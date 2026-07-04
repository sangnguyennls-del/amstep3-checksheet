// Pha 7 (Task 2) — ghi THIETBI + CHITIET + CONGVIEC vào Postgres qua `pg`,
// idempotent (chạy lại nhiều lần không tạo trùng). Dùng `MigrationModel` từ
// Task 1 (buildModel.ts). Xem docs/plans/pha7-data-migration.md mục "Task 2".
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { ChiTietRecord, CongViecRecord, ThietBiRecord } from "./types.ts";

export interface MigrateOptions {
  /** true = thực sự ghi DB; false (mặc định an toàn) = chỉ đếm/log, không INSERT. */
  commit: boolean;
}

/**
 * Ghi danh sách THIETBI vào Postgres. Trả về map `ma_thiet_bi -> id (uuid)`
 * để bước sau (CHITIET/CONGVIEC) nối quan hệ cha-con.
 *
 * Idempotent: nếu thiết bị đã tồn tại (theo `unique(ma_thiet_bi)`), DÙNG LẠI
 * id cũ, KHÔNG ghi đè các trường tổ chức đã có giá trị — tránh xoá mất dữ
 * liệu admin đã tự sửa tay qua UI /admin/equipment (xem Global Constraints
 * trong plan). Riêng các cột đang NULL ở DB thì được backfill bằng giá trị
 * model nếu có (`DO UPDATE ... WHERE col IS NULL`).
 *
 * LƯU Ý QUAN TRỌNG về thứ tự chạy: `thietbi.nguoi_phu_trach` có khoá ngoại
 * tới `nguoidung(msnv)`. Kế hoạch (Task 4's run.ts) liệt kê thứ tự gọi là
 * `migrateThietBi` TRƯỚC `migrateNguoiDung` — nghĩa là ở lần chạy đầu tiên,
 * bảng `nguoidung` CHƯA CÓ DÒNG NÀO, nên set `nguoi_phu_trach` thẳng sẽ vi
 * phạm FK. Hàm này xử lý bằng cách: chỉ set `nguoi_phu_trach` nếu msnv đó đã
 * tồn tại trong `nguoidung` tại thời điểm gọi (kiểm tra bằng `exists`), nếu
 * chưa thì để NULL và dựa vào nhánh "đã tồn tại" (UPDATE ... WHERE IS NULL)
 * để tự backfill ở lần gọi `migrateThietBi` KẾ TIẾP (chạy lại sau khi
 * `migrateNguoiDung` đã chạy) — không cần Task 4 phải đảo thứ tự.
 */
export async function migrateThietBi(
  client: Client,
  thietBiList: ThietBiRecord[],
  { commit }: MigrateOptions,
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  let soDaCo = 0;
  let soTaoMoi = 0;
  let soBackfillNguoiPhuTrach = 0;
  let soChoNguoiPhuTrach = 0;

  for (const tb of thietBiList) {
    // LƯU Ý: bảng thietbi có trigger fn_normalize_ma_thiet_bi (0002_functions_
    // triggers.sql) tự động upper(trim(...)) ma_thiet_bi lúc INSERT/UPDATE —
    // có từ trước Pha 7, không thuộc phạm vi sửa ở đây. Vì vậy MỌI so khớp
    // ma_thiet_bi với DB đều phải áp `upper(trim(...))` giống hệt, nếu không
    // các thiết bị có chữ thường trong mã (vd "Lube oil Unit MNCO2") sẽ
    // không bao giờ được nhận diện là "đã tồn tại" ở lần chạy lại, gây lỗi
    // insert trùng khoá.
    const existing = await client.query<{ id: string; nguoi_phu_trach: string | null }>(
      "select id, nguoi_phu_trach from thietbi where ma_thiet_bi = upper(trim($1))",
      [tb.maThietBi],
    );

    if (existing.rows.length > 0) {
      const id = existing.rows[0].id;
      idMap.set(tb.maThietBi, id);
      soDaCo++;

      if (commit) {
        // Backfill các cột tổ chức đang NULL bằng giá trị model (không ghi
        // đè cột đã có giá trị — kể cả nếu model đổi khác, giữ nguyên dữ
        // liệu hiện có vì admin có thể đã tự sửa). nguoi_phu_trach chỉ được
        // set nếu msnv tồn tại trong nguoidung (tránh vi phạm FK khi
        // nguoidung chưa migrate xong).
        const result = await client.query<{ nguoi_phu_trach: string | null }>(
          `update thietbi set
             cum = coalesce(thietbi.cum, $2),
             khu_vuc = coalesce(thietbi.khu_vuc, $3),
             xuong = coalesce(thietbi.xuong, $4),
             kip = coalesce(thietbi.kip, $5),
             lanh_dao = coalesce(thietbi.lanh_dao, $6),
             truong_ca = coalesce(thietbi.truong_ca, $7),
             nguoi_phu_trach = coalesce(
               thietbi.nguoi_phu_trach,
               case when $8::text is not null and exists (select 1 from nguoidung where msnv = $8) then $8 else null end
             ),
             anh_url = coalesce(thietbi.anh_url, $9),
             updated_at = now()
           where ma_thiet_bi = upper(trim($1))
           returning nguoi_phu_trach`,
          [
            tb.maThietBi,
            tb.cum,
            tb.khuVuc,
            tb.xuong,
            tb.kip,
            tb.lanhDao,
            tb.truongCa,
            tb.nguoiPhuTrach,
            tb.anhUrl,
          ],
        );
        if (existing.rows[0].nguoi_phu_trach === null && result.rows[0]?.nguoi_phu_trach !== null) {
          soBackfillNguoiPhuTrach++;
        }
      }
      continue;
    }

    if (!commit) {
      // Dry-run: không insert, chỉ dùng uuid giả tạm trong bộ nhớ để các
      // bước dry-run sau (đếm CHITIET/CONGVIEC dự kiến) vẫn chạy được logic
      // đối chiếu — không cần chính xác tuyệt đối, chỉ cần đúng SỐ LƯỢNG.
      idMap.set(tb.maThietBi, randomUUID());
      soTaoMoi++;
      continue;
    }

    let nguoiPhuTrachToInsert: string | null = null;
    if (tb.nguoiPhuTrach !== null) {
      const nguoiDungExists = await client.query("select 1 from nguoidung where msnv = $1", [
        tb.nguoiPhuTrach,
      ]);
      if (nguoiDungExists.rows.length > 0) {
        nguoiPhuTrachToInsert = tb.nguoiPhuTrach;
      } else {
        soChoNguoiPhuTrach++;
      }
    }

    const inserted = await client.query<{ id: string }>(
      `insert into thietbi
         (ma_thiet_bi, ten_thiet_bi, cum, khu_vuc, xuong, kip, lanh_dao, truong_ca, nguoi_phu_trach, anh_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        tb.maThietBi,
        tb.tenThietBi,
        tb.cum,
        tb.khuVuc,
        tb.xuong,
        tb.kip,
        tb.lanhDao,
        tb.truongCa,
        nguoiPhuTrachToInsert,
        tb.anhUrl,
      ],
    );
    idMap.set(tb.maThietBi, inserted.rows[0].id);
    soTaoMoi++;
  }

  console.log(
    `migrateThietBi: ${commit ? "đã ghi" : "dự kiến (dry-run)"} — đã tồn tại sẵn: ${soDaCo}, tạo mới: ${soTaoMoi} (tổng ${thietBiList.length}).`,
  );
  if (commit && (soChoNguoiPhuTrach > 0 || soBackfillNguoiPhuTrach > 0)) {
    console.log(
      `migrateThietBi: nguoi_phu_trach tạm để NULL do nguoidung chưa có (sẽ tự backfill khi chạy lại migrateThietBi SAU migrateNguoiDung): ${soChoNguoiPhuTrach} thiết bị mới; đã backfill được ${soBackfillNguoiPhuTrach} thiết bị đã tồn tại sẵn ở lần chạy này.`,
    );
  }
  return idMap;
}

/**
 * Ghi danh sách CHITIET + CONGVIEC vào Postgres. Trả về map
 * `CongViecKey (khoá tạm trong bộ nhớ) -> congviec_id thật` — dùng ở Task 4
 * để nối THUC_HIEN.
 *
 * Idempotent: CHITIET/CONGVIEC không có unique constraint tự nhiên (id do
 * `next_chitiet_id()`/`next_congviec_id()` sinh) nên phải tự SELECT kiểm tra
 * tồn tại trước khi INSERT (theo thietbi_id+ten_chi_tiet+dieu_kien_co_ban cho
 * CHITIET, theo chitiet_id+loai_hoat_dong cho CONGVIEC).
 */
export async function migrateChiTietCongViec(
  client: Client,
  chiTietList: ChiTietRecord[],
  congViecList: CongViecRecord[],
  thietBiIdMap: Map<string, string>,
  { commit }: MigrateOptions,
): Promise<Map<string, string>> {
  // Khoá tạm CHITIET (key của model, dạng `${maThietBi}||${tenChiTiet}||${dieuKienCoBan}`)
  // -> chitiet_id thật, dùng để nối CONGVIEC bên dưới.
  const chiTietIdMap = new Map<string, string>();
  let chiTietDaCo = 0;
  let chiTietTaoMoi = 0;

  for (const ct of chiTietList) {
    const thietbiId = thietBiIdMap.get(ct.maThietBi);
    if (!thietbiId) {
      throw new Error(
        `migrateChiTietCongViec: không tìm thấy thietbi_id cho mã "${ct.maThietBi}" (CHITIET "${ct.tenChiTiet}") — thietBiIdMap thiếu, kiểm tra lại thứ tự gọi migrateThietBi trước.`,
      );
    }

    const existing = await client.query<{ id: string }>(
      `select id from chitiet
       where thietbi_id = $1 and ten_chi_tiet = $2 and dieu_kien_co_ban is not distinct from $3`,
      [thietbiId, ct.tenChiTiet, ct.dieuKienCoBan],
    );

    if (existing.rows.length > 0) {
      chiTietIdMap.set(ct.key, existing.rows[0].id);
      chiTietDaCo++;
      continue;
    }

    if (!commit) {
      chiTietIdMap.set(ct.key, `DRYRUN-CT-${randomUUID()}`);
      chiTietTaoMoi++;
      continue;
    }

    const inserted = await client.query<{ id: string }>(
      `insert into chitiet (thietbi_id, stt, ten_chi_tiet, dieu_kien_co_ban)
       values ($1, $2, $3, $4)
       returning id`,
      [thietbiId, ct.stt, ct.tenChiTiet, ct.dieuKienCoBan],
    );
    chiTietIdMap.set(ct.key, inserted.rows[0].id);
    chiTietTaoMoi++;
  }

  console.log(
    `migrateChiTietCongViec (CHITIET): ${commit ? "đã ghi" : "dự kiến (dry-run)"} — đã tồn tại sẵn: ${chiTietDaCo}, tạo mới: ${chiTietTaoMoi} (tổng ${chiTietList.length}).`,
  );

  // Khoá tạm CONGVIEC (key của model, dạng `${chiTietKey}||${loaiHoatDong}`)
  // -> congviec_id thật.
  const congViecIdMap = new Map<string, string>();
  let congViecDaCo = 0;
  let congViecTaoMoi = 0;

  for (const cv of congViecList) {
    const chitietId = chiTietIdMap.get(cv.chiTietKey);
    if (!chitietId) {
      throw new Error(
        `migrateChiTietCongViec: không tìm thấy chitiet_id cho khoá "${cv.chiTietKey}" (CONGVIEC loại "${cv.loaiHoatDong}") — chiTietIdMap thiếu.`,
      );
    }

    const existing = await client.query<{ id: string }>(
      `select id from congviec where chitiet_id = $1 and loai_hoat_dong = $2`,
      [chitietId, cv.loaiHoatDong],
    );

    if (existing.rows.length > 0) {
      congViecIdMap.set(cv.key, existing.rows[0].id);
      congViecDaCo++;
      continue;
    }

    if (!commit) {
      congViecIdMap.set(cv.key, `DRYRUN-CV-${randomUUID()}`);
      congViecTaoMoi++;
      continue;
    }

    const inserted = await client.query<{ id: string }>(
      `insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [chitietId, cv.loaiHoatDong, cv.thoiGian, cv.tanSuatChu, cv.tanSuatSo],
    );
    congViecIdMap.set(cv.key, inserted.rows[0].id);
    congViecTaoMoi++;
  }

  console.log(
    `migrateChiTietCongViec (CONGVIEC): ${commit ? "đã ghi" : "dự kiến (dry-run)"} — đã tồn tại sẵn: ${congViecDaCo}, tạo mới: ${congViecTaoMoi} (tổng ${congViecList.length}).`,
  );

  return congViecIdMap;
}
