"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { usernameToEmail } from "@/lib/auth/username";

export type UserActionState = {
  error: string | null;
  success?: boolean;
};

function friendlyRoleGuardError(message: string): string {
  if (message.includes("Chỉ AdminM")) {
    return "Chỉ AdminM mới được cấp quyền AdminM cho người khác.";
  }
  return message;
}

// "" là giá trị cũ của option "User" (trước khi RoleSelect đổi sang value="user")
// -- vẫn chấp nhận để không gãy form nào còn gửi chuỗi rỗng; cả hai đều được
// coerce thành 'user' khi ghi DB (`vaiTro || "user"`).
const VAI_TRO_HOP_LE = ["", "user", "admin", "adminm"];

// Vòng 2: Kíp = Nhóm nhỏ (Kíp N = Nhóm N). Giao diện chỉ nhập "Nhóm nhỏ";
// cột `kip` (dùng cho duyệt đề xuất theo Nhóm + lịch ca) được suy từ nhom để
// 2 cột luôn nhất quán. "1" -> "Kíp 1"; rỗng -> null.
function kipFromNhom(nhom: string): string | null {
  return nhom ? `Kíp ${nhom}` : null;
}

export async function createUser(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const msnv = String(formData.get("msnv") ?? "").trim();
  const hoTen = String(formData.get("hoTen") ?? "").trim();
  const xuong = String(formData.get("xuong") ?? "").trim();
  const nhom = String(formData.get("nhom") ?? "").trim();
  const vaiTro = String(formData.get("vaiTro") ?? "").trim();

  if (!username || !password || !msnv || !hoTen) {
    return { error: "Vui lòng nhập đầy đủ tài khoản, mật khẩu, MSNV và họ tên" };
  }

  if (!VAI_TRO_HOP_LE.includes(vaiTro)) {
    return { error: "Vai trò không hợp lệ" };
  }

  // Check app-level này là lớp phòng thủ đầu tiên cho đường INSERT: insert
  // bên dưới dùng service-role client (bypass RLS hoàn toàn), và service-role
  // không có auth.uid()/JWT context nên fn_guard_vai_tro_change (0002/0005)
  // không thể tự chặn "not admin" cho chính request này -- nó chỉ còn backstop
  // riêng cho nhánh adminm-escalation khi INSERT đến từ một kết nối
  // authenticated/anon khác (không phải service_role), xem 0005 để biết chi
  // tiết. Nói cách khác: đừng xoá check này với giả định "trigger đã lo" --
  // với chính luồng createUser này, trigger cố tình bỏ qua guard adminm khi
  // current_user = 'service_role' để không chặn oan các lần tạo user hợp lệ.
  if (vaiTro === "adminm" && admin.vaiTro !== "adminm") {
    return { error: "Chỉ AdminM mới được cấp quyền AdminM cho người khác." };
  }

  const adminClient = createAdminClient();

  const { data: created, error: createAuthError } = await adminClient.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });

  if (createAuthError || !created.user) {
    return { error: createAuthError?.message ?? "Không thể tạo tài khoản đăng nhập" };
  }

  const { error: insertError } = await adminClient.from("nguoidung").insert({
    id: created.user.id,
    msnv,
    ho_ten: hoTen,
    xuong: xuong || null,
    nhom: nhom || null,
    kip: kipFromNhom(nhom),
    // Việc 4: lưu song song với email suy ra ở trên (usernameToEmail) để
    // resolve_login_email (migration 0012) tra được -- không đổi cách sinh
    // email, chỉ thêm 1 cột đọc được cho luồng đăng nhập bằng MSNV/username.
    username: username.toLowerCase(),
    vai_tro: vaiTro || "user",
  });

  if (insertError) {
    // Rollback: xoá auth user vừa tạo để không tạo user "mồ côi" không có
    // profile trong nguoidung.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return { error: friendlyRoleGuardError(insertError.message) };
  }

  revalidatePath("/admin/users");
  return { error: null, success: true };
}

export async function updateUser(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "");
  const hoTen = String(formData.get("hoTen") ?? "").trim();
  const xuong = String(formData.get("xuong") ?? "").trim();
  const nhom = String(formData.get("nhom") ?? "").trim();
  const vaiTro = String(formData.get("vaiTro") ?? "").trim();

  if (!id || !hoTen) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  if (!VAI_TRO_HOP_LE.includes(vaiTro)) {
    return { error: "Vai trò không hợp lệ" };
  }

  // Dùng client server thường (không phải admin client) để UPDATE nguoidung
  // -- vậy RLS + trigger guard fn_guard_vai_tro_change áp dụng tự nhiên.
  const supabase = await createClient();
  const { error } = await supabase
    .from("nguoidung")
    .update({
      ho_ten: hoTen,
      xuong: xuong || null,
      nhom: nhom || null,
      kip: kipFromNhom(nhom),
      vai_tro: vaiTro || "user",
    })
    .eq("id", id);

  if (error) {
    return { error: friendlyRoleGuardError(error.message) };
  }

  revalidatePath("/admin/users");
  return { error: null, success: true };
}

export async function deleteUser(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  if (!id) {
    return { error: "Thiếu ID người dùng" };
  }

  const adminClient = createAdminClient();
  // Cascade tự xoá nguoidung nhờ "on delete cascade" đã khai báo ở schema.
  const { error } = await adminClient.auth.admin.deleteUser(id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}

export async function resetUserPassword(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!id || !newPassword) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  if (newPassword.length < 6) {
    return { error: "Mật khẩu mới phải có ít nhất 6 ký tự" };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(id, { password: newPassword });

  if (error) {
    return { error: error.message };
  }

  return { error: null, success: true };
}
