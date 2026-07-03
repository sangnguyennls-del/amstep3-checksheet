"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export type UpdateBatThuongState = { error: string | null; success?: boolean };

const initialOk: UpdateBatThuongState = { error: null };

const VALID_TRANG_THAI = ["Mở", "Đang xử lý", "Đã đóng"] as const;
type TrangThai = (typeof VALID_TRANG_THAI)[number];

function isValidTrangThai(v: string): v is TrangThai {
  return (VALID_TRANG_THAI as readonly string[]).includes(v);
}

// Đổi trạng thái 1 bất thường (và ngày khắc phục đi kèm khi đóng) từ trang
// quản trị /admin/bat-thuong. Không có edit mo_ta/xoá -- ngoài phạm vi Task 2
// (xem brief Global Constraints).
export async function updateBatThuongStatus(
  _prevState: UpdateBatThuongState,
  formData: FormData,
): Promise<UpdateBatThuongState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "").trim();
  const trangThaiRaw = String(formData.get("trangThai") ?? "").trim();
  const ngayKhacPhuc = String(formData.get("ngayKhacPhuc") ?? "").trim() || null;

  if (!id) {
    return { error: "Thiếu ID bất thường" };
  }

  if (!trangThaiRaw || !isValidTrangThai(trangThaiRaw)) {
    return { error: "Trạng thái không hợp lệ" };
  }

  // Không có ràng buộc này ở DB (xem CLAUDE.md mục E) -- phải chặn ở đây để
  // tránh đóng 1 bất thường mà không ghi lại ngày đã khắc phục xong.
  if (trangThaiRaw === "Đã đóng" && !ngayKhacPhuc) {
    return { error: "Phải nhập ngày khắc phục khi đóng bất thường" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bat_thuong")
    .update({ trang_thai: trangThaiRaw, ngay_khac_phuc: ngayKhacPhuc })
    .eq("id", id);

  if (error) {
    // Lỗi Postgres thô (vd vi phạm CHECK constraint do race condition hiếm)
    // -- không lộ chi tiết kỹ thuật ra UI, theo đúng pattern equipment.ts.
    return { error: "Không thể cập nhật trạng thái, vui lòng thử lại" };
  }

  revalidatePath("/admin/bat-thuong");
  return { error: null, success: true };
}

export const updateBatThuongInitialState = initialOk;
