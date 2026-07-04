// Pha 7 (Task 4) — ghi THUC_HIEN (lưới chấm công lịch sử, ~39562 dòng dự
// kiến) + BAT_THUONG đi kèm (ket_qua='R') vào Postgres qua `pg`, idempotent.
// Xem docs/plans/pha7-data-migration.md mục "Task 4".
//
// LƯU Ý QUAN TRỌNG (xem mục "Quyết định kỹ thuật" trong plan): với các dòng
// ket_qua='R', BẮT BUỘC insert THUC_HIEN + BAT_THUONG trong CÙNG 1 transaction
// thật (BEGIN...COMMIT) qua `pg` — đây là cách DUY NHẤT thoả ràng buộc
// `deferrable initially deferred` (`trg_thuc_hien_requires_bat_thuong`,
// 0002_functions_triggers.sql) mà không mở 2 câu lệnh tách rời (nếu tách rời,
// giữa 2 lệnh nếu script chết giữa chừng sẽ để lại 1 THUC_HIEN ket_qua='R'
// không có BAT_THUONG, vi phạm ràng buộc nghiệp vụ mục E của CLAUDE.md).
import type { Client } from "pg";
import { withTransaction } from "./db.ts";
import type { MigrateOptions } from "./migrateEquipment.ts";
import type { CongViecKey, OrphanThucHienRecord, ThucHienRecord } from "./types.ts";

const CHUNK_SIZE = 500;
const MO_TA_BAT_THUONG_LICH_SU = "Dữ liệu lịch sử — không có mô tả gốc";
const TRANG_THAI_BAT_THUONG_LICH_SU = "Đã đóng";

// ---------------------------------------------------------------------------
// PHÁT HIỆN MỚI (Task 4, không có trong plan ban đầu — tương tự cách Task 1
// phát hiện vấn đề whitespace Config/Data): sheet Data thật có 807 nhóm
// (congViecKey, ngay) bị TRÙNG khoá `unique(congviec_id, ngay)` của bảng
// thuc_hien (908 dòng dư), đến từ các dòng Data gốc trùng lặp thật sự trong
// sheet. Đã kiểm tra kỹ:
//   - 675 nhóm: mọi bản trùng có GIÁ TRỊ GIỐNG HỆT nhau (keHoach/ketQua/
//     nguoiThucHien) — vô hại, chỉ là dòng Data bị copy-paste dư, gộp còn 1
//     bản không mất thông tin gì.
//   - 132 nhóm (267 dòng): các bản trùng có GIÁ TRỊ MÂU THUẪN (vd 1 bản
//     keHoach=true, bản kia keHoach=false, cùng ngày cùng thiết bị cùng nội
//     dung) — đã xác nhận KHÔNG có dòng nào trong số này là ket_qua='R' (an
//     toàn, không ảnh hưởng BAT_THUONG). KHÔNG có căn cứ để tự chọn "bản nào
//     đúng" — đúng nguyên tắc "không bao giờ bỏ âm thầm" (mục G CLAUDE.md, và
//     đúng tinh thần xử lý orphan "ngày 31" mà Task 1 đã áp dụng), TOÀN BỘ
//     các dòng thuộc nhóm mâu thuẫn được đưa vào `legacy_orphan_thuc_hien`
//     thay vì ghi bừa 1 bản vào `thuc_hien` chính thức.
// ---------------------------------------------------------------------------

function parseCongViecKeyParts(key: CongViecKey): {
  maThietBi: string;
  tenChiTiet: string;
  dieuKienCoBan: string;
  loaiHoatDong: string;
} {
  // congViecKey = `${maThietBi}||${tenChiTiet}||${dieuKienCoBan}||${loaiHoatDong}`
  // (xem chiTietKeyOf/congViecKeyOf trong buildModel.ts). Tách theo "||" —
  // giả định KHÔNG có "||" literal trong text (nhất quán với cách buildModel.ts
  // tự xây khoá này, không escape ký tự phân cách).
  const parts = key.split("||");
  const loaiHoatDong = parts[parts.length - 1];
  const maThietBi = parts[0];
  const tenChiTiet = parts[1];
  const dieuKienCoBan = parts.slice(2, parts.length - 1).join("||");
  return { maThietBi, tenChiTiet, dieuKienCoBan, loaiHoatDong };
}

export interface DedupeThucHienResult {
  thucHien: ThucHienRecord[];
  conflictOrphans: OrphanThucHienRecord[];
}

/**
 * Gộp các dòng THUC_HIEN dự kiến bị trùng khoá `(congViecKey, ngay)` (vi phạm
 * `unique(congviec_id, ngay)` của DB) TRƯỚC KHI ghi, để tránh phụ thuộc vào
 * thứ tự xử lý ngẫu nhiên của `ON CONFLICT DO NOTHING` (vốn sẽ âm thầm giữ
 * "bản tới trước" mà không ai biết bản nào bị bỏ). Xem giải thích chi tiết ở
 * comment đầu file.
 */
export function dedupeThucHien(thucHienList: ThucHienRecord[]): DedupeThucHienResult {
  const groups = new Map<string, ThucHienRecord[]>();
  for (const t of thucHienList) {
    const k = `${t.congViecKey}||${t.ngay}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const result: ThucHienRecord[] = [];
  const conflictOrphans: OrphanThucHienRecord[] = [];
  let soNhomTrungHopLe = 0;
  let soDongDuBoQua = 0;
  let soNhomMauThuan = 0;

  for (const rows of groups.values()) {
    if (rows.length === 1) {
      result.push(rows[0]);
      continue;
    }

    const first = rows[0];
    const allSame = rows.every(
      (r) => r.keHoach === first.keHoach && r.ketQua === first.ketQua && r.nguoiThucHien === first.nguoiThucHien,
    );

    if (allSame) {
      result.push(first);
      soNhomTrungHopLe++;
      soDongDuBoQua += rows.length - 1;
      continue;
    }

    soNhomMauThuan++;
    const { maThietBi, tenChiTiet, dieuKienCoBan, loaiHoatDong } = parseCongViecKeyParts(first.congViecKey);
    for (const r of rows) {
      conflictOrphans.push({
        thietBi: maThietBi,
        tenChiTiet,
        dieuKienCoBan,
        loaiHoatDong,
        thangNam: r.legacyMonthYear,
        ngay: r.ngay,
        giaTriO: `${r.keHoach ? "Y" : "N"}|${r.ketQua}`,
        legacyRowId: r.legacyRowId,
        lyDo: `Trùng khoá (thiết bị+chi tiết+điều kiện+loại+ngày) nhưng giá trị MÂU THUẪN giữa ${rows.length} dòng Data khác nhau — không tự chọn 1 bản, cần admin rà soát thủ công (Pha 7 Task 4 phát hiện, không có trong plan ban đầu).`,
      });
    }
  }

  console.log(
    `dedupeThucHien: ${soNhomTrungHopLe} nhóm trùng khoá (congviec_id, ngay) nhưng giá trị GIỐNG HỆT nhau (dòng Data gốc bị lặp vô hại) — đã gộp còn 1 bản/nhóm, bỏ ${soDongDuBoQua} dòng dư (không mất thông tin).`,
  );
  if (soNhomMauThuan > 0) {
    console.warn(
      `dedupeThucHien: CẢNH BÁO — ${soNhomMauThuan} nhóm trùng khoá (congviec_id, ngay) có giá trị MÂU THUẪN — đã đưa TOÀN BỘ ${conflictOrphans.length} dòng liên quan vào legacy_orphan_thuc_hien để admin rà soát thủ công, KHÔNG ghi bản nào của các nhóm này vào thuc_hien chính thức.`,
    );
  }

  return { thucHien: result, conflictOrphans };
}

interface ResolvedThucHien extends ThucHienRecord {
  congviecId: string;
}

/** Khoá để đối chiếu tồn tại: `${congviec_id}|${ngay}` (khớp `unique(congviec_id, ngay)`). */
function existKey(congviecId: string, ngay: string): string {
  return `${congviecId}|${ngay}`;
}

/**
 * Query hàng loạt (1 lần/chunk) xem những cặp (congviec_id, ngay) nào đã tồn
 * tại sẵn trong `thuc_hien` — dùng cho báo cáo đếm "đã tồn tại/tạo mới" chính
 * xác ở CẢ dry-run lẫn commit (không cần insert thử để biết).
 */
async function findExistingKeys(
  client: Client,
  rows: ResolvedThucHien[],
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const result = await client.query<{ congviec_id: string; ngay: string }>(
    `select t.congviec_id, t.ngay::text as ngay
     from thuc_hien t
     join (
       select unnest($1::text[]) as congviec_id, unnest($2::date[]) as ngay
     ) v on v.congviec_id = t.congviec_id and v.ngay = t.ngay`,
    [rows.map((r) => r.congviecId), rows.map((r) => r.ngay)],
  );
  return new Set(result.rows.map((r) => existKey(r.congviec_id, r.ngay)));
}

function resolveCongViecId(
  t: ThucHienRecord,
  congViecIdMap: Map<CongViecKey, string>,
): string | null {
  return congViecIdMap.get(t.congViecKey) ?? null;
}

/**
 * Ghi các dòng THUC_HIEN có `ketQua !== 'R'` theo lô (chunk 500 dòng/lần),
 * dùng 1 câu `INSERT ... VALUES (...), (...), ... ON CONFLICT (congviec_id,
 * ngay) DO NOTHING` cho cả chunk — đơn giản hơn mở 1 transaction/dòng, và vẫn
 * idempotent (chạy lại không tạo trùng, không cần transaction riêng vì mỗi
 * dòng chỉ có 1 câu INSERT độc lập, không có ràng buộc liên bảng nào cần bảo
 * vệ như trường hợp 'R').
 */
async function migrateNonRChunk(
  client: Client,
  chunk: ResolvedThucHien[],
  existing: Set<string>,
  commit: boolean,
): Promise<{ soDaCo: number; soTaoMoi: number }> {
  let soDaCo = 0;
  let soTaoMoi = 0;
  for (const t of chunk) {
    if (existing.has(existKey(t.congviecId, t.ngay))) soDaCo++;
    else soTaoMoi++;
  }

  if (!commit || chunk.length === 0) {
    return { soDaCo, soTaoMoi };
  }

  const cols = 7;
  const valuesSql: string[] = [];
  const params: unknown[] = [];
  chunk.forEach((t, idx) => {
    const base = idx * cols;
    valuesSql.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`,
    );
    params.push(
      t.congviecId,
      t.ngay,
      t.keHoach,
      t.ketQua,
      t.nguoiThucHien,
      t.legacyRowId,
      t.legacyMonthYear,
    );
  });

  await client.query(
    `insert into thuc_hien
       (congviec_id, ngay, ke_hoach, ket_qua, nguoi_thuc_hien, legacy_row_id, legacy_month_year)
     values ${valuesSql.join(",")}
     on conflict (congviec_id, ngay) do nothing`,
    params,
  );

  return { soDaCo, soTaoMoi };
}

/**
 * Ghi 1 dòng THUC_HIEN ket_qua='R' + BAT_THUONG đi kèm, trong CÙNG 1
 * transaction thật (BEGIN...COMMIT). Trả về `{ thucHienTaoMoi, batThuongTaoMoi }`
 * — nếu THUC_HIEN đã tồn tại từ trước (`ON CONFLICT DO NOTHING` không trả
 * dòng), KHÔNG tạo BAT_THUONG cho nó (tránh trùng, và vì không biết `id` thật
 * của THUC_HIEN đã tồn tại từ context này — không cần thiết, lần tạo trước đã
 * lo phần BAT_THUONG của nó rồi).
 */
async function migrateOneRRow(
  client: Client,
  t: ResolvedThucHien,
  commit: boolean,
  daTonTai: boolean,
): Promise<{ thucHienTaoMoi: boolean; batThuongTaoMoi: boolean }> {
  if (!commit) {
    return { thucHienTaoMoi: !daTonTai, batThuongTaoMoi: !daTonTai };
  }

  return withTransaction(client, async (c) => {
    const inserted = await c.query<{ id: string }>(
      `insert into thuc_hien
         (congviec_id, ngay, ke_hoach, ket_qua, nguoi_thuc_hien, legacy_row_id, legacy_month_year)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (congviec_id, ngay) do nothing
       returning id`,
      [
        t.congviecId,
        t.ngay,
        t.keHoach,
        t.ketQua,
        t.nguoiThucHien,
        t.legacyRowId,
        t.legacyMonthYear,
      ],
    );

    if (inserted.rows.length === 0) {
      // Đã tồn tại từ trước — bỏ qua tạo BAT_THUONG (tránh trùng lặp).
      return { thucHienTaoMoi: false, batThuongTaoMoi: false };
    }

    const thuchienId = inserted.rows[0].id;
    const batThuongInserted = await c.query<{ id: string }>(
      `insert into bat_thuong (thuchien_id, mo_ta, trang_thai, ngay_phat_hien, nguoi_ghi)
       values ($1,$2,$3,$4,$5)
       on conflict (thuchien_id) do nothing
       returning id`,
      [thuchienId, MO_TA_BAT_THUONG_LICH_SU, TRANG_THAI_BAT_THUONG_LICH_SU, t.ngay, t.nguoiThucHien],
    );

    return { thucHienTaoMoi: true, batThuongTaoMoi: batThuongInserted.rows.length > 0 };
  });
}

/**
 * Ghi toàn bộ THUC_HIEN (+ BAT_THUONG cho ket_qua='R') từ `MigrationModel`.
 * Idempotent: chạy lại nhiều lần không tạo trùng ở cả 2 bảng.
 */
export async function migrateThucHienBatch(
  client: Client,
  thucHienList: ThucHienRecord[],
  congViecIdMap: Map<CongViecKey, string>,
  { commit }: MigrateOptions,
): Promise<void> {
  let soKhongTimThayCongViec = 0;
  const nonR: ResolvedThucHien[] = [];
  const rRows: ResolvedThucHien[] = [];

  for (const t of thucHienList) {
    const congviecId = resolveCongViecId(t, congViecIdMap);
    if (!congviecId) {
      soKhongTimThayCongViec++;
      console.warn(
        `migrateThucHienBatch: không tìm thấy congviec_id cho khoá "${t.congViecKey}" (ngày ${t.ngay}, legacyRowId="${t.legacyRowId}") — bỏ qua dòng này (kiểm tra lại thứ tự gọi migrateChiTietCongViec trước).`,
      );
      continue;
    }
    const resolved: ResolvedThucHien = { ...t, congviecId };
    if (t.ketQua === "R") rRows.push(resolved);
    else nonR.push(resolved);
  }

  // ---- Xử lý các dòng KHÔNG phải 'R' theo lô 500 dòng/lần. ----
  let nonRDaCo = 0;
  let nonRTaoMoi = 0;
  for (let i = 0; i < nonR.length; i += CHUNK_SIZE) {
    const chunk = nonR.slice(i, i + CHUNK_SIZE);
    const existing = await findExistingKeys(client, chunk);
    const { soDaCo, soTaoMoi } = await migrateNonRChunk(client, chunk, existing, commit);
    nonRDaCo += soDaCo;
    nonRTaoMoi += soTaoMoi;
  }

  console.log(
    `migrateThucHienBatch (ket_qua != 'R'): ${commit ? "đã ghi" : "dự kiến (dry-run)"} — đã tồn tại sẵn: ${nonRDaCo}, tạo mới: ${nonRTaoMoi} (tổng ${nonR.length}).`,
  );

  // ---- Xử lý các dòng 'R' — mỗi dòng 1 transaction thật kèm BAT_THUONG. ----
  let rDaCo = 0;
  let rTaoMoi = 0;
  let batThuongTaoMoi = 0;
  for (let i = 0; i < rRows.length; i += CHUNK_SIZE) {
    const chunk = rRows.slice(i, i + CHUNK_SIZE);
    const existing = await findExistingKeys(client, chunk);
    for (const t of chunk) {
      const daTonTai = existing.has(existKey(t.congviecId, t.ngay));
      const { thucHienTaoMoi, batThuongTaoMoi: btMoi } = await migrateOneRRow(
        client,
        t,
        commit,
        daTonTai,
      );
      if (thucHienTaoMoi) rTaoMoi++;
      else rDaCo++;
      if (btMoi) batThuongTaoMoi++;
    }
  }

  console.log(
    `migrateThucHienBatch (ket_qua = 'R', kèm BAT_THUONG): ${commit ? "đã ghi" : "dự kiến (dry-run)"} — đã tồn tại sẵn: ${rDaCo}, tạo mới: ${rTaoMoi} (tổng ${rRows.length}); BAT_THUONG tạo mới: ${batThuongTaoMoi}.`,
  );

  if (soKhongTimThayCongViec > 0) {
    console.warn(
      `migrateThucHienBatch: CẢNH BÁO — ${soKhongTimThayCongViec} dòng THUC_HIEN dự kiến KHÔNG tìm thấy congviec_id tương ứng, đã bị bỏ qua (xem log ở trên). Đây là dấu hiệu bất thường, cần điều tra nếu số này > 0.`,
    );
  }
}
