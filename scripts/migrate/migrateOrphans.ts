// Pha 7 (Task 4) — ghi `orphanThucHien` (dòng Data cũ không tạo được THUC_HIEN
// chính thức, vd "ngày 31" không tồn tại ở tháng 30 ngày) vào
// `legacy_orphan_thuc_hien` để admin rà soát thủ công. Xem
// docs/plans/pha7-data-migration.md mục "Task 4".
import type { Client } from "pg";
import type { MigrateOptions } from "./migrateEquipment.ts";
import type { OrphanThucHienRecord } from "./types.ts";

const CHUNK_SIZE = 500;

/**
 * Ghi toàn bộ `orphans` vào `legacy_orphan_thuc_hien`. Giống `migrateLegacyLogs`
 * — không có khoá tự nhiên để merge/idempotent theo từng dòng, nên `TRUNCATE`
 * rồi `INSERT` lại toàn bộ mỗi lần `commit=true` (dữ liệu tĩnh, suy ra lại y
 * hệt từ cùng file .xlsx nguồn ở mỗi lần chạy).
 */
export async function migrateOrphanThucHien(
  client: Client,
  orphans: OrphanThucHienRecord[],
  { commit }: MigrateOptions,
): Promise<void> {
  console.log(
    `migrateOrphanThucHien: ${commit ? "đã ghi" : "dự kiến (dry-run)"} — sẽ TRUNCATE rồi ghi lại toàn bộ ${orphans.length} dòng vào legacy_orphan_thuc_hien.`,
  );

  if (!commit) return;

  await client.query("truncate table legacy_orphan_thuc_hien");

  const cols = 9;
  for (let i = 0; i < orphans.length; i += CHUNK_SIZE) {
    const chunk = orphans.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const valuesSql: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((o, idx) => {
      const base = idx * cols;
      valuesSql.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
      );
      params.push(
        o.thietBi,
        o.tenChiTiet,
        o.dieuKienCoBan,
        o.loaiHoatDong,
        o.thangNam,
        o.ngay,
        o.giaTriO,
        o.legacyRowId,
        o.lyDo,
      );
    });
    await client.query(
      `insert into legacy_orphan_thuc_hien
         (thiet_bi, ten_chi_tiet, dieu_kien_co_ban, loai_hoat_dong, thang_nam, ngay, gia_tri_o, legacy_row_id, ly_do)
       values ${valuesSql.join(",")}`,
      params,
    );
  }

  console.log(`migrateOrphanThucHien: đã ghi ${orphans.length} dòng vào legacy_orphan_thuc_hien.`);
}
