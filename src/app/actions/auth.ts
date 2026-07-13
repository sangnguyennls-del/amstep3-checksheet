"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

// Quy tắc 1 (hệ cũ checkLogin): khi bảo trì bật, chặn mọi đăng nhập trừ
// role AdminM, kèm thông báo cụ thể. Đây là ngoại lệ duy nhất phải xử lý ở
// tầng app (không thể thuần RLS) vì Supabase Auth sign-in không đi qua RLS
// -- mọi ghi dữ liệu thật vẫn được RLS/can_edit_* chặn độc lập nếu phiên
// đăng nhập cũ còn sót lại lúc bật bảo trì giữa chừng.
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: "Vui lòng nhập đầy đủ tài khoản và mật khẩu" };
  }

  const supabase = await createClient();

  // Việc 4: cho đăng nhập bằng MSNV hoặc username -- resolve_login_email
  // (migration 0012) tra ra email thật tương ứng, luôn trả về 1 email hợp
  // lệ cú pháp kể cả khi không khớp ai (không tiết lộ tài khoản tồn tại
  // hay không qua bước này -- signInWithPassword mới là nơi phát tín hiệu
  // đúng/sai, giống hệt nhau cho "không có tài khoản" và "sai mật khẩu").
  const { data: resolvedEmail } = await supabase.rpc("resolve_login_email", {
    p_identifier: identifier,
  });

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: resolvedEmail ?? identifier,
    password,
  });

  if (signInError || !signInData.user) {
    return { error: "Sai tài khoản hoặc mật khẩu" };
  }

  const { data: maintenanceRow } = await supabase
    .from("cai_dat")
    .select("value")
    .eq("key", "MAINTENANCE_MODE")
    .maybeSingle();

  const { data: profile } = await supabase
    .from("nguoidung")
    .select("vai_tro")
    .eq("id", signInData.user.id)
    .maybeSingle();

  const isMaintenanceOn = maintenanceRow?.value === "true";
  const isAdminM = profile?.vai_tro === "adminm";

  if (isMaintenanceOn && !isAdminM) {
    await supabase.auth.signOut();
    return {
      error: "Hệ thống đang bảo trì, vui lòng quay lại sau. Chỉ AdminM được đăng nhập lúc này.",
    };
  }

  redirect("/checksheet");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type ChangePasswordState = {
  error: string | null;
  success?: boolean;
};

// Mục 12: người dùng TỰ đổi mật khẩu của chính mình sau khi đăng nhập (trước
// đây chỉ có admin reset hộ). Bắt nhập mật khẩu hiện tại và xác thực lại bằng
// signInWithPassword trước khi updateUser -- phòng máy để quên đăng nhập bị
// người khác đổi mật khẩu chiếm tài khoản. Chỉ đổi được cho CHÍNH session
// đang đăng nhập (supabase.auth.updateUser), không cần service role.
export async function changeOwnPassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới" };
  }
  if (newPassword.length < 6) {
    return { error: "Mật khẩu mới phải có ít nhất 6 ký tự" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Mật khẩu mới nhập lại không khớp" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại" };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: "Mật khẩu hiện tại không đúng" };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    // Supabase từ chối đặt lại đúng mật khẩu cũ -- dịch thông báo cho dễ hiểu.
    if (updateError.message.includes("different from the old password")) {
      return { error: "Mật khẩu mới phải khác mật khẩu hiện tại" };
    }
    return { error: updateError.message };
  }

  return { error: null, success: true };
}
