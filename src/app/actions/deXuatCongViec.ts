"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export type ResolveDeXuatState = { error: string | null; success?: boolean };

// Duyệt/từ chối 1 đề xuất sửa/xoá công việc từ /admin/de-xuat. requireAdmin()
// chỉ xác nhận vai_tro admin/adminm nói chung -- phạm vi giới hạn theo Nhóm
// (Admin thường chỉ duyệt được đề xuất cùng Nhóm) do RPC
// `resolve_de_xuat_congviec` (migration 0013, qua can_approve_congviec_change)
// tự chặn và raise lỗi, action chỉ cần bắt lỗi đó và hiển thị lại cho người
// dùng -- không lặp lại logic kiểm tra Nhóm ở tầng app.
export async function resolveDeXuatCongViec(
  _prevState: ResolveDeXuatState,
  formData: FormData,
): Promise<ResolveDeXuatState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const hanhDong = String(formData.get("hanhDong") ?? "").trim();
  const lyDoTuChoi = String(formData.get("lyDoTuChoi") ?? "").trim() || null;

  if (!id) {
    return { error: "Thiếu ID đề xuất" };
  }
  if (hanhDong !== "duyet" && hanhDong !== "tu_choi") {
    return { error: "Hành động không hợp lệ" };
  }
  if (hanhDong === "tu_choi" && !lyDoTuChoi) {
    return { error: "Vui lòng nhập lý do từ chối" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_de_xuat_congviec", {
    p_de_xuat_id: id,
    p_hanh_dong: hanhDong,
    p_ly_do_tu_choi: lyDoTuChoi,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/de-xuat");
  return { error: null, success: true };
}
