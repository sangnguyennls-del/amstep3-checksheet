// Pha 7 (Task 2) — kết nối Postgres trực tiếp bằng `pg` cho MỌI thao tác ghi
// vào các bảng nghiệp vụ (thietbi/chitiet/congviec/thuc_hien/bat_thuong/...).
// KHÔNG dùng Supabase client/RPC cho các bảng này — xem lý do bắt buộc ở
// docs/plans/pha7-data-migration.md mục "Quyết định kỹ thuật: dùng pg kết nối
// thẳng Postgres" (RPC set_ket_qua_r_with_bat_thuong áp cửa sổ ±4 ngày dựa
// trên today_vn(), sẽ chặn nhầm việc ghi dữ liệu lịch sử).
import { Client } from "pg";

/**
 * Tạo 1 `pg.Client` mới đã connect, đọc connection string từ
 * `SUPABASE_DB_URL` (bắt buộc). Gọi `client.end()` khi dùng xong.
 */
export async function getPgClient(): Promise<Client> {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error(
      "Thiếu biến môi trường SUPABASE_DB_URL (connection string Postgres trực tiếp, " +
        'vd "postgresql://postgres:postgres@127.0.0.1:54322/postgres" cho local Supabase, ' +
        "lấy bằng `npx supabase status`).",
    );
  }
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * Chạy `fn` trong 1 transaction thật (`BEGIN...COMMIT`), tự `ROLLBACK` nếu
 * `fn` throw. Dùng cho các trường hợp cần nhiều câu lệnh cùng thành công/thất
 * bại (vd THUC_HIEN ket_qua='R' + BAT_THUONG đi kèm ở Task 4).
 */
export async function withTransaction<T>(
  client: Client,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
