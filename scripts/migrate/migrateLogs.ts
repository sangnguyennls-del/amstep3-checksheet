// Pha 7 (Task 4) — copy nguyên trạng sheet "Logs" cũ vào `legacy_logs_import`.
// Xem docs/plans/pha7-data-migration.md mục "Task 4" + Global Constraints
// ("LEGACY_LOGS_IMPORT: không có ý nghĩa nghiệp vụ để merge — dùng TRUNCATE
// rồi insert lại mỗi lần chạy --commit, dữ liệu log lịch sử tĩnh, không đổi
// giữa các lần export — tự quyết định, ưu tiên đơn giản").
import type { Client } from "pg";
import type { MigrateOptions } from "./migrateEquipment.ts";
import type { RawLogRow } from "./types.ts";

const CHUNK_SIZE = 500;

/**
 * Ghi toàn bộ `logs` (RawLogRow[], nguyên trạng sheet "Logs" cũ) vào
 * `legacy_logs_import`. Không idempotent theo từng dòng (không có khoá tự
 * nhiên để merge) — thay vào đó `TRUNCATE` cả bảng rồi `INSERT` lại toàn bộ
 * mỗi lần `commit=true`, đơn giản và đủ đúng vì dữ liệu log lịch sử là tĩnh
 * (không đổi giữa các lần chạy export/migrate).
 */
export async function migrateLegacyLogs(
  client: Client,
  logs: RawLogRow[],
  { commit }: MigrateOptions,
): Promise<void> {
  console.log(
    `migrateLegacyLogs: ${commit ? "đã ghi" : "dự kiến (dry-run)"} — sẽ TRUNCATE rồi ghi lại toàn bộ ${logs.length} dòng vào legacy_logs_import.`,
  );

  if (!commit) return;

  await client.query("truncate table legacy_logs_import");

  const cols = 5;
  for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
    const chunk = logs.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const valuesSql: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((log, idx) => {
      const base = idx * cols;
      valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
      params.push(log.thoiGian, log.nguoiChinhSua, log.taiKhoan, log.thangDuLieu, log.thietBiTacDong);
    });
    await client.query(
      `insert into legacy_logs_import
         (thoi_gian, nguoi_chinh_sua, tai_khoan, thang_du_lieu, thiet_bi_tac_dong)
       values ${valuesSql.join(",")}`,
      params,
    );
  }

  console.log(`migrateLegacyLogs: đã ghi ${logs.length} dòng vào legacy_logs_import.`);
}
