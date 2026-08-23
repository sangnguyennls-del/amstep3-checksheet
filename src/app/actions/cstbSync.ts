"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { readCstbDeviceRows } from "@/lib/cstb/googleSheet";
import {
  computeCstbDiff,
  type CstbDiff,
  type NguoiDung,
  type ThietBiSnapshot,
} from "@/lib/cstb/diff";

// Đổi phân công diện rộng -> chỉ AdminM (super admin), không phải admin thường.
async function requireAdminM() {
  const ctx = await requireAdmin();
  if (ctx.vaiTro !== "adminm") {
    throw new Error("Chỉ AdminM mới được đồng bộ phân công từ Google Sheet");
  }
  return ctx;
}

// Đọc sheet + snapshot thietbi/nguoidung rồi tính diff (dùng chung cho preview
// và apply -- apply tính lại để tránh dữ liệu cũ).
async function loadDiff(): Promise<CstbDiff> {
  const supabase = await createClient();
  const [sheetRows, tbRes, ndRes] = await Promise.all([
    readCstbDeviceRows(),
    supabase.from("thietbi").select("id, ma_thiet_bi, nguoi_phu_trach, nhom"),
    supabase.from("nguoidung").select("msnv, ho_ten, nhom"),
  ]);
  if (tbRes.error) throw new Error(`Đọc thiết bị lỗi: ${tbRes.error.message}`);
  if (ndRes.error) throw new Error(`Đọc người dùng lỗi: ${ndRes.error.message}`);

  const thietBi: ThietBiSnapshot[] = (tbRes.data ?? []).map((t) => ({
    id: t.id as string,
    maThietBi: t.ma_thiet_bi as string,
    nguoiPhuTrach: (t.nguoi_phu_trach as string | null) ?? null,
    nhom: (t.nhom as string | null) ?? null,
  }));
  const nguoiDung: NguoiDung[] = (ndRes.data ?? []).map((u) => ({
    msnv: u.msnv as string,
    hoTen: u.ho_ten as string,
    nhom: (u.nhom as string | null) ?? null,
  }));

  return computeCstbDiff(sheetRows, thietBi, nguoiDung);
}

export type PreviewResult = { diff: CstbDiff | null; error: string | null };

export async function previewCstbSync(): Promise<PreviewResult> {
  try {
    await requireAdminM();
    const diff = await loadDiff();
    return { diff, error: null };
  } catch (e) {
    return { diff: null, error: e instanceof Error ? e.message : "Không xem trước được" };
  }
}

export type ApplyResult = { applied: number; error: string | null };

// kip suy từ nhom, khớp đúng cách equipment.ts (kipFromNhom): "1" -> "Kíp 1".
// Giữ 2 cột nhất quán -- app luôn quản kip = "Kíp <nhom>".
function kipFromNhom(nhom: string | null): string | null {
  return nhom ? `Kíp ${nhom}` : null;
}

export async function applyCstbSync(): Promise<ApplyResult> {
  try {
    await requireAdminM();
    const diff = await loadDiff(); // tính lại fresh ngay trước khi ghi
    if (diff.changes.length === 0) return { applied: 0, error: null };

    // Lấy MSNV người thực hiện để ghi audit.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = user
      ? await supabase.from("nguoidung").select("msnv").eq("id", user.id).maybeSingle()
      : { data: null };
    const actor = (me?.msnv as string | undefined) ?? null;

    // Service role: thietbi UPDATE + audit_log INSERT (audit_log không có RLS
    // insert policy nên phải bypass; đã gate AdminM ở trên).
    const admin = createAdminClient();
    let applied = 0;
    // ponytail: cập nhật từng dòng (Supabase không có transaction đa câu). Nếu
    // lỗi giữa chừng -> áp một phần; chạy lại đồng bộ sẽ hoàn tất phần còn lại.
    for (const c of diff.changes) {
      const kip = kipFromNhom(c.newNhom);
      const { error } = await admin
        .from("thietbi")
        .update({ nguoi_phu_trach: c.newMsnv, nhom: c.newNhom, kip })
        .eq("id", c.thietBiId);
      if (error) {
        throw new Error(`Cập nhật ${c.maThietBi} lỗi (đã áp ${applied}): ${error.message}`);
      }
      await admin.from("audit_log").insert({
        bang: "thietbi",
        ban_ghi_id: c.thietBiId,
        hanh_dong: "UPDATE",
        gia_tri_cu: { nguoi_phu_trach: c.oldMsnv, nhom: c.oldNhom },
        gia_tri_moi: { nguoi_phu_trach: c.newMsnv, nhom: c.newNhom, kip },
        nguoi_thuc_hien: actor,
        ly_do: "Đồng bộ CSTB từ Google Sheet",
      });
      applied++;
    }

    revalidatePath("/admin/equipment");
    revalidatePath("/admin/dong-bo");
    return { applied, error: null };
  } catch (e) {
    return { applied: 0, error: e instanceof Error ? e.message : "Không áp dụng được" };
  }
}
