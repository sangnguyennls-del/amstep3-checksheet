import { createClient } from "@/lib/supabase/server";

export type AdminContext = { userId: string; vaiTro: "admin" | "adminm" };

// Throw nếu người gọi hiện tại không phải admin/adminm. Dùng client
// server thường (KHÔNG dùng service role) để câu query này vẫn đi qua
// RLS -- một user thường sẽ không tự đọc được vai_tro của người khác,
// nhưng đọc được vai_tro CHÍNH MÌNH (RLS nguoidung_select cho phép
// auth.uid() = id), nên luôn đọc được để tự kiểm tra.
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");

  const { data: profile } = await supabase
    .from("nguoidung")
    .select("vai_tro")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.vai_tro !== "admin" && profile?.vai_tro !== "adminm") {
    throw new Error("Không có quyền truy cập trang quản trị");
  }
  return { userId: user.id, vaiTro: profile.vai_tro };
}
