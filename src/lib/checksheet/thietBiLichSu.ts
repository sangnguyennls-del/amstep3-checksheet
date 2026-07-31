// Đợt 5 #4: lịch sử thay đổi của 1 thiết bị, chia rõ 2 phần dễ đọc:
//  * CẤU HÌNH  -> RPC get_thietbi_cauhinh (từ de_xuat_congviec: đủ loại/trạng
//    thái + người đề xuất + người duyệt + thời gian áp dụng).
//  * CHẤM CÔNG -> RPC get_thietbi_chamcong (audit_log thuc_hien, kèm tên chi
//    tiết + loại hoạt động để biết thuộc chi tiết nào).
// RPC (security definer) trả dữ liệu thô; format hiển thị lo ở đây.
import type { SupabaseClient } from "@supabase/supabase-js";

export type LoaiDeXuat = "sua" | "loai_bo" | "them" | "khoi_phuc";
export type TrangThaiDeXuat = "Chờ duyệt" | "Đã duyệt" | "Từ chối";

export type CauHinhRow = {
  id: string;
  loaiDeXuat: LoaiDeXuat;
  trangThai: TrangThaiDeXuat;
  tenChiTiet: string;
  loaiHoatDong: string;
  thoiGianCu: number | null;
  tanSuatChuCu: string | null;
  tanSuatSoCu: number | null;
  thoiGianMoi: number | null;
  tanSuatChuMoi: string | null;
  tanSuatSoMoi: number | null;
  lyDo: string | null;
  lyDoTuChoi: string | null;
  nguoiDeXuat: string | null;
  nguoiDeXuatTen: string | null;
  nguoiDuyet: string | null;
  nguoiDuyetTen: string | null;
  createdAt: string;
  updatedAt: string;
  apDungTu: string | null; // "YYYY-MM-DD"
};

export type ChamCongRow = {
  thoiGian: string;
  hanhDong: "INSERT" | "UPDATE" | "DELETE";
  giaTriCu: Record<string, unknown> | null;
  giaTriMoi: Record<string, unknown> | null;
  nguoiMsnv: string | null;
  nguoiTen: string | null;
  tenChiTiet: string | null;
  loaiHoatDong: string | null;
  stt: number | null;
};

type CauHinhRpc = {
  id: string;
  loai_de_xuat: LoaiDeXuat;
  trang_thai: TrangThaiDeXuat;
  ten_chi_tiet: string | null;
  loai_hoat_dong: string | null;
  thoi_gian_cu: number | null;
  tan_suat_chu_cu: string | null;
  tan_suat_so_cu: number | null;
  thoi_gian_moi: number | null;
  tan_suat_chu_moi: string | null;
  tan_suat_so_moi: number | null;
  ly_do: string | null;
  ly_do_tu_choi: string | null;
  nguoi_de_xuat: string | null;
  nguoi_de_xuat_ten: string | null;
  nguoi_duyet: string | null;
  nguoi_duyet_ten: string | null;
  created_at: string;
  updated_at: string;
  ap_dung_tu: string | null;
};

type ChamCongRpc = {
  thoi_gian: string;
  hanh_dong: string;
  gia_tri_cu: Record<string, unknown> | null;
  gia_tri_moi: Record<string, unknown> | null;
  nguoi_msnv: string | null;
  nguoi_ten: string | null;
  ten_chi_tiet: string | null;
  loai_hoat_dong: string | null;
  stt: number | null;
};

export async function getThietBiCauHinh(
  supabase: SupabaseClient,
  thietBiId: string,
): Promise<CauHinhRow[]> {
  const { data, error } = await supabase.rpc("get_thietbi_cauhinh", { p_thietbi_id: thietBiId });
  if (error) throw error;
  return ((data ?? []) as CauHinhRpc[]).map((r) => ({
    id: r.id,
    loaiDeXuat: r.loai_de_xuat,
    trangThai: r.trang_thai,
    tenChiTiet: r.ten_chi_tiet ?? "",
    loaiHoatDong: r.loai_hoat_dong ?? "",
    thoiGianCu: r.thoi_gian_cu,
    tanSuatChuCu: r.tan_suat_chu_cu,
    tanSuatSoCu: r.tan_suat_so_cu,
    thoiGianMoi: r.thoi_gian_moi,
    tanSuatChuMoi: r.tan_suat_chu_moi,
    tanSuatSoMoi: r.tan_suat_so_moi,
    lyDo: r.ly_do,
    lyDoTuChoi: r.ly_do_tu_choi,
    nguoiDeXuat: r.nguoi_de_xuat,
    nguoiDeXuatTen: r.nguoi_de_xuat_ten,
    nguoiDuyet: r.nguoi_duyet,
    nguoiDuyetTen: r.nguoi_duyet_ten,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    apDungTu: r.ap_dung_tu,
  }));
}

export async function getThietBiChamCong(
  supabase: SupabaseClient,
  thietBiId: string,
): Promise<ChamCongRow[]> {
  const { data, error } = await supabase.rpc("get_thietbi_chamcong", { p_thietbi_id: thietBiId });
  if (error) throw error;
  return ((data ?? []) as ChamCongRpc[]).map((r) => ({
    thoiGian: r.thoi_gian,
    hanhDong: r.hanh_dong as ChamCongRow["hanhDong"],
    giaTriCu: r.gia_tri_cu,
    giaTriMoi: r.gia_tri_moi,
    nguoiMsnv: r.nguoi_msnv,
    nguoiTen: r.nguoi_ten,
    tenChiTiet: r.ten_chi_tiet,
    loaiHoatDong: r.loai_hoat_dong,
    stt: r.stt,
  }));
}

// --- Format hiển thị ---------------------------------------------------------

export const LOAI_DE_XUAT_LABEL: Record<LoaiDeXuat, string> = {
  sua: "Sửa",
  loai_bo: "Loại bỏ",
  them: "Thêm mới",
  khoi_phuc: "Khôi phục",
};

function fmtTanSuat(chu: string | null, so: number | null): string {
  if (!chu && so == null) return "—";
  return `${chu ?? "?"}${so != null ? ` ×${so}` : ""}`;
}

/** Câu "nội dung thay đổi" (cũ→mới) cho 1 dòng cấu hình. */
export function moTaThayDoiCauHinh(row: CauHinhRow): string {
  if (row.loaiDeXuat === "loai_bo") return "Ngừng theo dõi hạng mục (loại bỏ dần)";
  if (row.loaiDeXuat === "khoi_phuc") return "Khôi phục theo dõi hạng mục";
  if (row.loaiDeXuat === "them") {
    const parts: string[] = [];
    if (row.thoiGianMoi != null) parts.push(`${row.thoiGianMoi} phút`);
    if (row.tanSuatChuMoi || row.tanSuatSoMoi != null) {
      parts.push(`tần suất ${fmtTanSuat(row.tanSuatChuMoi, row.tanSuatSoMoi)}`);
    }
    return `Thêm hạng mục mới${parts.length ? ` (${parts.join(", ")})` : ""}`;
  }
  // sua: chỉ liệt kê trường thực sự đổi.
  const changes: string[] = [];
  if (row.thoiGianMoi != null && row.thoiGianMoi !== row.thoiGianCu) {
    changes.push(`Thời gian: ${row.thoiGianCu ?? "—"} → ${row.thoiGianMoi} phút`);
  }
  const tsCu = fmtTanSuat(row.tanSuatChuCu, row.tanSuatSoCu);
  const tsMoi = fmtTanSuat(row.tanSuatChuMoi, row.tanSuatSoMoi);
  if (tsMoi !== "—" && tsMoi !== tsCu) {
    changes.push(`Tần suất: ${tsCu} → ${tsMoi}`);
  }
  return changes.length ? changes.join("; ") : "Cập nhật hạng mục";
}

/** Mô tả gọn 1 dòng chấm công. */
export function moTaChamCong(row: ChamCongRow): string {
  const v = (row.giaTriMoi ?? row.giaTriCu ?? {}) as Record<string, unknown>;
  const ngay = String(v.ngay ?? "");
  const day = ngay ? `Ngày ${Number(ngay.slice(8, 10))}: ` : "";
  if (row.hanhDong === "DELETE") return `${day}xoá ô chấm`;
  const ke = v.ke_hoach ? "có kế hoạch" : "không kế hoạch";
  const kq = String(v.ket_qua ?? "N");
  const kqLabel = kq === "G" ? "Tốt" : kq === "R" ? "Bất thường" : "Chưa/không";
  return `${day}${ke}, kết quả ${kqLabel}`;
}
