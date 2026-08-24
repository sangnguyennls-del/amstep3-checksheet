"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

// Đổi Trưởng ca / Lãnh đạo (quản đốc) HÀNG LOẠT trên thietbi: thay 1 tên cũ ->
// tên mới cho mọi thiết bị đang để tên đó. truong_ca/lanh_dao là text tự do
// trên thietbi (không phải FK). Chỉ AdminM.

const FIELD_LABEL = { truong_ca: "Trưởng ca", lanh_dao: "Lãnh đạo" } as const;
export type NhanSuField = keyof typeof FIELD_LABEL;

async function requireAdminM() {
  const ctx = await requireAdmin();
  if (ctx.vaiTro !== "adminm") throw new Error("Chỉ AdminM mới đổi được Trưởng ca / Lãnh đạo");
}

// Whitelist tên cột (KHÔNG cho nội suy cột tuỳ ý -> chặn ghi nhầm cột khác).
function assertField(f: string): asserts f is NhanSuField {
  if (f !== "truong_ca" && f !== "lanh_dao") throw new Error("Trường không hợp lệ");
}

export type NhanSuPreview = { count: number; devices: string[]; error: string | null };

export async function previewDoiNhanSu(field: string, oldName: string): Promise<NhanSuPreview> {
  try {
    await requireAdminM();
    assertField(field);
    const o = oldName.trim();
    if (!o) return { count: 0, devices: [], error: "Chưa chọn tên cần thay" };
    const supabase = await createClient();
    const { data, error } = await supabase.from("thietbi").select("ma_thiet_bi").eq(field, o).order("ma_thiet_bi");
    if (error) throw new Error(error.message);
    return { count: data.length, devices: data.map((d) => d.ma_thiet_bi as string), error: null };
  } catch (e) {
    return { count: 0, devices: [], error: e instanceof Error ? e.message : "Không xem trước được" };
  }
}

export type NhanSuApply = { applied: number; error: string | null };

export async function applyDoiNhanSu(field: string, oldName: string, newName: string): Promise<NhanSuApply> {
  try {
    await requireAdminM();
    assertField(field);
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n) return { applied: 0, error: "Nhập đủ tên cũ và tên mới" };
    if (o === n) return { applied: 0, error: "Tên cũ và tên mới giống nhau" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = user
      ? await supabase.from("nguoidung").select("msnv").eq("id", user.id).maybeSingle()
      : { data: null };
    const actor = (me?.msnv as string | undefined) ?? null;

    // Service role: update + audit (audit_log không có RLS insert; đã gate AdminM).
    const admin = createAdminClient();
    const { data: rows, error: e1 } = await admin.from("thietbi").select("id").eq(field, o);
    if (e1) throw new Error(e1.message);
    if (!rows || rows.length === 0) {
      return { applied: 0, error: `Không có thiết bị nào đang để ${FIELD_LABEL[field]} = "${o}"` };
    }
    for (const r of rows) {
      await admin.from("audit_log").insert({
        bang: "thietbi",
        ban_ghi_id: r.id,
        hanh_dong: "UPDATE",
        gia_tri_cu: { [field]: o },
        gia_tri_moi: { [field]: n },
        nguoi_thuc_hien: actor,
        ly_do: `Đổi ${FIELD_LABEL[field]} hàng loạt: ${o} -> ${n}`,
      });
    }
    const { error: e2 } = await admin.from("thietbi").update({ [field]: n }).eq(field, o);
    if (e2) throw new Error(e2.message);

    revalidatePath("/admin/equipment");
    revalidatePath("/admin/dong-bo");
    return { applied: rows.length, error: null };
  } catch (e) {
    return { applied: 0, error: e instanceof Error ? e.message : "Không áp dụng được" };
  }
}
