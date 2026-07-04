// Pha 7 (Task 3) — tạo 58 tài khoản Supabase Auth thật + profile `nguoidung`,
// idempotent (chạy lại nhiều lần không tạo trùng). Dùng `MigrationModel` từ
// Task 1 (buildModel.ts). Xem docs/plans/pha7-data-migration.md mục "Task 3".
//
// LƯU Ý QUAN TRỌNG: username dùng để build email Auth PHẢI là cột "User" của
// sheet Users (vd "vanvv"), KHÔNG PHẢI msnv — xem NguoiDungRecord.username
// (types.ts) và mục "Bối cảnh" #1 trong plan. `usernameToEmail` được IMPORT
// TRỰC TIẾP từ `src/lib/auth/username.ts` (không copy lại công thức) để đảm
// bảo tuyệt đối cùng 1 nguồn chân lý với code app thật đang chạy — đây là
// import (đọc), KHÔNG chỉnh sửa gì trong `src/`.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import { usernameToEmail } from "../../src/lib/auth/username.ts";
import type { MigrateOptions } from "./migrateEquipment.ts";
import type { NguoiDungRecord } from "./types.ts";

/**
 * Ghi danh sách NGUOIDUNG (Supabase Auth user + profile `nguoidung`) vào hệ
 * thống. Với mỗi user:
 * - Kiểm tra tồn tại bằng `msnv` qua `pg` TRƯỚC KHI gọi Auth API (bắt buộc —
 *   gọi `auth.admin.createUser()` 2 lần cho cùng email sẽ lỗi, không thể chỉ
 *   dựa vào catch lỗi để idempotent).
 * - Nếu chưa tồn tại và `commit=true`: tạo Auth user (email =
 *   `usernameToEmail(username)`, mật khẩu chung `tempPassword`), rồi INSERT
 *   `nguoidung` với `id = created.user.id`.
 * - Nếu bước INSERT `nguoidung` thất bại SAU KHI đã tạo Auth user thành công:
 *   rollback bằng cách xoá Auth user vừa tạo (không để lại tài khoản "mồ
 *   côi") — giống hệt pattern trong `src/app/actions/users.ts`'s `createUser`.
 * - Không throw dừng cả script khi 1 user lỗi — log rõ ràng rồi tiếp tục với
 *   user kế tiếp (đúng nguyên tắc "không bao giờ bỏ âm thầm" nhưng cũng
 *   "không để 1 lỗi làm hỏng cả 58 user").
 */
export async function migrateNguoiDung(
  supabaseAdmin: SupabaseClient,
  pgClient: Client,
  users: NguoiDungRecord[],
  tempPassword: string,
  { commit }: MigrateOptions,
): Promise<void> {
  let soDaCo = 0;
  let soTaoMoi = 0;
  let soLoi = 0;
  const loiChiTiet: string[] = [];

  for (const u of users) {
    const existing = await pgClient.query<{ id: string }>(
      "select id from nguoidung where msnv = $1",
      [u.msnv],
    );

    if (existing.rows.length > 0) {
      soDaCo++;
      continue;
    }

    if (!commit) {
      // Dry-run: không gọi Auth API, không insert, chỉ đếm dự kiến.
      soTaoMoi++;
      continue;
    }

    const email = usernameToEmail(u.username);
    const { data: created, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createAuthError || !created?.user) {
      soLoi++;
      const msg = `MSNV ${u.msnv} (username "${u.username}", email "${email}"): ${
        createAuthError?.message ?? "không rõ lỗi (Auth API không trả user)"
      }`;
      loiChiTiet.push(msg);
      console.error(`migrateNguoiDung: LỖI tạo Auth user cho ${msg} — bỏ qua user này.`);
      continue;
    }

    try {
      // LƯU Ý (bug tiền hữu phát hiện khi chạy trên dữ liệu thật, KHÔNG
      // thuộc phạm vi Task 3, ghi lại ở đây vì chặn trực tiếp việc insert
      // đúng 1 user có vai_tro='adminm'): trigger `trg_guard_vai_tro_change`
      // (0005_guard_vai_tro_insert.sql) chỉ cho phép INSERT
      // `vai_tro='adminm'` khi `current_user = 'service_role'` (hoặc người
      // insert đã là adminm). Nhưng hàm này khai báo `security definer` với
      // owner là `postgres` — bên trong 1 hàm `security definer`,
      // `current_user` LUÔN trả về OWNER của hàm (`postgres`), bất kể caller
      // đã `set role` thành gì trước đó (đã verify độc lập bằng 1 hàm test
      // riêng: `set local role service_role` rồi gọi 1 hàm security-definer
      // khác vẫn thấy `current_user = 'postgres'`, không phải
      // `service_role`). Hệ quả: nhánh "bypass cho service_role" trong
      // trigger này KHÔNG BAO GIỜ pass được bằng `set role` — CỐ TÌNH KHÔNG
      // dùng `session_replication_role = replica` hay bất kỳ cách nào khác
      // để vô hiệu hoá trigger bảo vệ leo thang quyền này từ script migrate,
      // vì đó là hành động làm yếu 1 cơ chế bảo mật mà không có sự cho phép
      // rõ ràng của người vận hành — xem mục "Concerns" trong báo cáo Task 3
      // để biết các phương án xử lý đề xuất cho riêng 1 tài khoản AdminM này.
      await pgClient.query(
        `insert into nguoidung (id, msnv, ho_ten, don_vi, vai_tro) values ($1, $2, $3, $4, $5)`,
        [created.user.id, u.msnv, u.hoTen, u.donVi, u.vaiTro],
      );
      soTaoMoi++;
    } catch (insertErr) {
      // Rollback: xoá Auth user vừa tạo để không tạo user "mồ côi" không có
      // profile trong nguoidung — đúng pattern createUser (src/app/actions/users.ts).
      soLoi++;
      const reason = insertErr instanceof Error ? insertErr.message : String(insertErr);
      const msg = `MSNV ${u.msnv} (username "${u.username}"): tạo Auth user OK (id=${created.user.id}) nhưng INSERT nguoidung lỗi: ${reason} — đã rollback (xoá) Auth user vừa tạo.`;
      loiChiTiet.push(msg);
      console.error(`migrateNguoiDung: LỖI — ${msg}`);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    }
  }

  console.log(
    `migrateNguoiDung: ${commit ? "đã ghi" : "dự kiến (dry-run)"} — đã tồn tại sẵn: ${soDaCo}, tạo mới: ${soTaoMoi}${
      soLoi > 0 ? `, LỖI: ${soLoi}` : ""
    } (tổng ${users.length}).`,
  );
  if (loiChiTiet.length > 0) {
    console.error(`migrateNguoiDung: chi tiết ${loiChiTiet.length} lỗi:\n  ${loiChiTiet.join("\n  ")}`);
  }
}
