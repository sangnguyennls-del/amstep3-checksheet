"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth/username";

export type LoginState = {
  error: string | null;
};

// Quy tắc 1 (hệ cũ checkLogin): khi bảo trì bật, chặn mọi đăng nhập trừ
// role AdminM, kèm thông báo cụ thể. Đây là ngoại lệ duy nhất phải xử lý ở
// tầng app (không thể thuần RLS) vì Supabase Auth sign-in không đi qua RLS
// -- mọi ghi dữ liệu thật vẫn được RLS/can_edit_* chặn độc lập nếu phiên
// đăng nhập cũ còn sót lại lúc bật bảo trì giữa chừng.
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Vui lòng nhập đầy đủ tài khoản và mật khẩu" };
  }

  const supabase = await createClient();

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
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
