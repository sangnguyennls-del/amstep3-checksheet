"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export type EquipmentActionState = {
  error: string | null;
  success?: boolean;
};

function friendlyFkError(message: string): string {
  if (message.includes("violates foreign key constraint")) {
    return "MSNV người phụ trách không tồn tại trong hệ thống";
  }
  return message;
}

function optionalText(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

// Vòng 2: Kíp = Nhóm nhỏ (Kíp N = Nhóm N). Giao diện chỉ nhập "Nhóm nhỏ";
// cột `kip` (còn dùng cho duyệt đề xuất `can_approve_congviec_change` + lịch
// ca) được suy ra từ nhom để dữ liệu 2 cột luôn nhất quán. nhom "1" -> kip
// "Kíp 1"; nếu nhom rỗng thì kip null.
function kipFromNhom(nhom: string | null): string | null {
  return nhom ? `Kíp ${nhom}` : null;
}

// ---------------------------------------------------------------------------
// THIETBI
// ---------------------------------------------------------------------------

export async function createThietBi(
  _prevState: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const maThietBi = String(formData.get("maThietBi") ?? "").trim();
  const tenThietBi = String(formData.get("tenThietBi") ?? "").trim();

  if (!maThietBi || !tenThietBi) {
    return { error: "Vui lòng nhập Mã thiết bị và Tên thiết bị" };
  }

  const nhom = optionalText(formData, "nhom");
  const supabase = await createClient();
  const { error } = await supabase.from("thietbi").insert({
    ma_thiet_bi: maThietBi,
    ten_thiet_bi: tenThietBi,
    cum: optionalText(formData, "cum"),
    khu_vuc: optionalText(formData, "khuVuc"),
    xuong: optionalText(formData, "xuong"),
    nhom,
    kip: kipFromNhom(nhom),
    lanh_dao: optionalText(formData, "lanhDao"),
    truong_ca: optionalText(formData, "truongCa"),
    nguoi_phu_trach: optionalText(formData, "nguoiPhuTrach"),
    anh_url: optionalText(formData, "anhUrl"),
  });

  if (error) {
    return { error: friendlyFkError(error.message) };
  }

  revalidatePath("/admin/equipment");
  return { error: null, success: true };
}

export async function updateThietBi(
  _prevState: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "");
  const maThietBi = String(formData.get("maThietBi") ?? "").trim();
  const tenThietBi = String(formData.get("tenThietBi") ?? "").trim();

  if (!id || !maThietBi || !tenThietBi) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  const nhom = optionalText(formData, "nhom");
  const supabase = await createClient();
  const { error } = await supabase
    .from("thietbi")
    .update({
      ma_thiet_bi: maThietBi,
      ten_thiet_bi: tenThietBi,
      cum: optionalText(formData, "cum"),
      khu_vuc: optionalText(formData, "khuVuc"),
      xuong: optionalText(formData, "xuong"),
      nhom,
      kip: kipFromNhom(nhom),
      lanh_dao: optionalText(formData, "lanhDao"),
      truong_ca: optionalText(formData, "truongCa"),
      nguoi_phu_trach: optionalText(formData, "nguoiPhuTrach"),
      anh_url: optionalText(formData, "anhUrl"),
    })
    .eq("id", id);

  if (error) {
    return { error: friendlyFkError(error.message) };
  }

  revalidatePath("/admin/equipment");
  revalidatePath(`/admin/equipment/${id}`);
  return { error: null, success: true };
}

// Việc #4: gán nhanh người phụ trách ngay trên bảng danh sách thiết bị
// (không phải mở trang chi tiết + lưu cả form). Chỉ đụng đúng cột
// nguoi_phu_trach nên không cần các trường khác của updateThietBi.
export async function assignNguoiPhuTrach(
  thietBiId: string,
  msnv: string | null,
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  if (!thietBiId) {
    return { error: "Thiếu ID thiết bị" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("thietbi")
    .update({ nguoi_phu_trach: msnv || null })
    .eq("id", thietBiId);

  if (error) {
    return { error: friendlyFkError(error.message) };
  }

  revalidatePath("/admin/equipment");
  return { error: null };
}

export async function deleteThietBi(id: string): Promise<{ error: string | null }> {
  try {
    // Chỉ AdminM: xoá thiết bị cascade mất toàn bộ chi tiết/công việc/chấm công.
    // Lằn ranh #9 + RLS thietbi_delete (0025) là tầng chặn chính; đây là tầng 1.
    const ctx = await requireAdmin();
    if (ctx.vaiTro !== "adminm") {
      return {
        error:
          "Chỉ AdminM mới được xoá thiết bị (xoá sẽ mất toàn bộ chi tiết, công việc và lịch sử chấm công của thiết bị).",
      };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  if (!id) {
    return { error: "Thiếu ID thiết bị" };
  }

  const supabase = await createClient();
  // Cascade tự xoá chitiet -> congviec nhờ "on delete cascade" đã khai báo ở schema.
  const { error } = await supabase.from("thietbi").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/equipment");
  return { error: null };
}

// ---------------------------------------------------------------------------
// CHITIET
// ---------------------------------------------------------------------------

export async function createChiTiet(
  _prevState: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const thietBiId = String(formData.get("thietBiId") ?? "").trim();
  const tenChiTiet = String(formData.get("tenChiTiet") ?? "").trim();
  const sttRaw = String(formData.get("stt") ?? "").trim();

  if (!thietBiId || !tenChiTiet) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  const stt = sttRaw ? Number(sttRaw) : null;
  if (sttRaw && !Number.isFinite(stt)) {
    return { error: "STT phải là số" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("chitiet").insert({
    thietbi_id: thietBiId,
    stt,
    ten_chi_tiet: tenChiTiet,
    dieu_kien_co_ban: optionalText(formData, "dieuKienCoBan"),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/equipment/${thietBiId}`);
  return { error: null, success: true };
}

export async function updateChiTiet(
  _prevState: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "");
  const thietBiId = String(formData.get("thietBiId") ?? "").trim();
  const tenChiTiet = String(formData.get("tenChiTiet") ?? "").trim();
  const sttRaw = String(formData.get("stt") ?? "").trim();

  if (!id || !tenChiTiet) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  const stt = sttRaw ? Number(sttRaw) : null;
  if (sttRaw && !Number.isFinite(stt)) {
    return { error: "STT phải là số" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("chitiet")
    .update({
      stt,
      ten_chi_tiet: tenChiTiet,
      dieu_kien_co_ban: optionalText(formData, "dieuKienCoBan"),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/equipment/${thietBiId}`);
  return { error: null, success: true };
}

export async function deleteChiTiet(
  id: string,
  thietBiId: string,
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  if (!id) {
    return { error: "Thiếu ID chi tiết" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("chitiet").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/equipment/${thietBiId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// CONGVIEC
// ---------------------------------------------------------------------------

export async function createCongViec(
  _prevState: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const chiTietId = String(formData.get("chiTietId") ?? "").trim();
  const thietBiId = String(formData.get("thietBiId") ?? "").trim();
  const loaiHoatDong = String(formData.get("loaiHoatDong") ?? "").trim();
  const thoiGianRaw = String(formData.get("thoiGian") ?? "").trim();
  const tanSuatSoRaw = String(formData.get("tanSuatSo") ?? "").trim();

  if (!chiTietId || !loaiHoatDong) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  const thoiGian = thoiGianRaw ? Number(thoiGianRaw) : null;
  const tanSuatSo = tanSuatSoRaw ? Number(tanSuatSoRaw) : null;
  if ((thoiGianRaw && !Number.isFinite(thoiGian)) || (tanSuatSoRaw && !Number.isFinite(tanSuatSo))) {
    return { error: "Thời gian/Tần suất số phải là số" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("congviec").insert({
    chitiet_id: chiTietId,
    loai_hoat_dong: loaiHoatDong,
    thoi_gian: thoiGian,
    tan_suat_chu: optionalText(formData, "tanSuatChu"),
    tan_suat_so: tanSuatSo,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/equipment/${thietBiId}`);
  return { error: null, success: true };
}

export async function updateCongViec(
  _prevState: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const id = String(formData.get("id") ?? "");
  const thietBiId = String(formData.get("thietBiId") ?? "").trim();
  const loaiHoatDong = String(formData.get("loaiHoatDong") ?? "").trim();
  const thoiGianRaw = String(formData.get("thoiGian") ?? "").trim();
  const tanSuatSoRaw = String(formData.get("tanSuatSo") ?? "").trim();
  // Cơ chế "loại bỏ dần" (mục C CLAUDE.md): active=false + ngay_loai_bo thay
  // vì xoá cứng CONGVIEC.
  const active = formData.get("active") != null;
  const hieuLucTu = optionalText(formData, "hieuLucTu");
  const hieuLucDen = optionalText(formData, "hieuLucDen");
  const ngayLoaiBo = optionalText(formData, "ngayLoaiBo");

  if (!id || !loaiHoatDong) {
    return { error: "Thiếu dữ liệu cần thiết" };
  }

  const thoiGian = thoiGianRaw ? Number(thoiGianRaw) : null;
  const tanSuatSo = tanSuatSoRaw ? Number(tanSuatSoRaw) : null;
  if ((thoiGianRaw && !Number.isFinite(thoiGian)) || (tanSuatSoRaw && !Number.isFinite(tanSuatSo))) {
    return { error: "Thời gian/Tần suất số phải là số" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("congviec")
    .update({
      loai_hoat_dong: loaiHoatDong,
      thoi_gian: thoiGian,
      tan_suat_chu: optionalText(formData, "tanSuatChu"),
      tan_suat_so: tanSuatSo,
      active,
      hieu_luc_tu: hieuLucTu,
      hieu_luc_den: hieuLucDen,
      ngay_loai_bo: ngayLoaiBo,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/equipment/${thietBiId}`);
  return { error: null, success: true };
}

export async function deleteCongViec(
  id: string,
  thietBiId: string,
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  if (!id) {
    return { error: "Thiếu ID công việc" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("congviec").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/equipment/${thietBiId}`);
  return { error: null };
}
