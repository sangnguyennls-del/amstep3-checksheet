// Hàm truy vấn danh sách đề xuất sửa/xoá công việc cho trang quản trị
// /admin/de-xuat (Việc 2). RLS `de_xuat_congviec_select` (migration 0013) đã
// tự giới hạn kết quả theo người gọi (chính người đề xuất, hoặc Admin có
// quyền duyệt đúng Nhóm/AdminM) -- không cần lọc thêm gì ở đây.
import type { SupabaseClient } from "@supabase/supabase-js";

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type DeXuatCongViecItem = {
  id: string;
  congViecId: string | null; // null với loaiDeXuat === "them"
  loaiDeXuat: "sua" | "loai_bo" | "them";
  thoiGianMoi: number | null;
  tanSuatChuMoi: string | null;
  tanSuatSoMoi: number | null;
  lyDo: string;
  trangThai: "Chờ duyệt" | "Đã duyệt" | "Từ chối";
  nguoiDeXuat: string;
  nguoiDuyet: string | null;
  lyDoTuChoi: string | null;
  createdAt: string;
  // Giá trị HIỆN TẠI của congviec, để so sánh với *Moi -- lấy trực tiếp từ
  // bảng congviec (không phải snapshot tại thời điểm đề xuất).
  thoiGianHienTai: number | null;
  tanSuatChuHienTai: string | null;
  tanSuatSoHienTai: number | null;
  loaiHoatDong: string;
  tenChiTiet: string;
  maThietBi: string;
  tenThietBi: string;
  // Chỉ có với loaiDeXuat === "them":
  tenChiTietMoi: string | null;
  dieuKienCoBanMoi: string | null;
  sttMoi: number | null;
  loaiHoatDongMoi: string | null;
  chiTietChonTen: string | null; // tên chi tiết có sẵn (kiểu a); null nếu chi tiết mới
};

type ThietBiJoin = { ma_thiet_bi: string; ten_thiet_bi: string };
type ChiTietJoin = { ten_chi_tiet: string; thietbi: ThietBiJoin | ThietBiJoin[] | null };
type CongViecJoin = {
  loai_hoat_dong: string;
  thoi_gian: number | null;
  tan_suat_chu: string | null;
  tan_suat_so: number | null;
  chitiet: ChiTietJoin | ChiTietJoin[] | null;
};
// Join trực tiếp qua thietbi_id/chitiet_id (đề xuất 'them') -- chỉ cần tên
// chi tiết đã chọn (kiểu a) / thiết bị mục tiêu, khác join lồng qua congviec.
type ChiTietDirectJoin = { ten_chi_tiet: string };

type DeXuatJoinRow = {
  id: string;
  congviec_id: string | null;
  loai_de_xuat: "sua" | "loai_bo" | "them";
  thoi_gian_moi: number | null;
  tan_suat_chu_moi: string | null;
  tan_suat_so_moi: number | null;
  ly_do: string;
  trang_thai: "Chờ duyệt" | "Đã duyệt" | "Từ chối";
  nguoi_de_xuat: string;
  nguoi_duyet: string | null;
  ly_do_tu_choi: string | null;
  created_at: string;
  congviec: CongViecJoin | CongViecJoin[] | null;
  // Chỉ có với loai_de_xuat === 'them':
  thietbi_id: string | null;
  chitiet_id: string | null;
  ten_chi_tiet_moi: string | null;
  dieu_kien_co_ban_moi: string | null;
  stt_moi: number | null;
  loai_hoat_dong_moi: string | null;
  thietbi: ThietBiJoin | ThietBiJoin[] | null;
  chitiet: ChiTietDirectJoin | ChiTietDirectJoin[] | null;
};

export async function getDeXuatCongViecList(
  supabase: SupabaseClient,
  trangThaiFilter?: string[],
): Promise<DeXuatCongViecItem[]> {
  let query = supabase
    .from("de_xuat_congviec")
    .select(
      `id, congviec_id, loai_de_xuat, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi, ly_do,
       trang_thai, nguoi_de_xuat, nguoi_duyet, ly_do_tu_choi, created_at,
       thietbi_id, chitiet_id, ten_chi_tiet_moi, dieu_kien_co_ban_moi, stt_moi, loai_hoat_dong_moi,
       thietbi ( ma_thiet_bi, ten_thiet_bi ),
       chitiet ( ten_chi_tiet ),
       congviec ( loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so,
         chitiet!inner ( ten_chi_tiet, thietbi!inner ( ma_thiet_bi, ten_thiet_bi ) ) )`,
    )
    .order("created_at", { ascending: false });

  if (trangThaiFilter && trangThaiFilter.length > 0) {
    query = query.in("trang_thai", trangThaiFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as DeXuatJoinRow[];

  return rows.map((r) => {
    const congViec = firstOrNull(r.congviec);
    const chiTiet = firstOrNull(congViec?.chitiet ?? null);
    const thietBi = firstOrNull(chiTiet?.thietbi ?? null);
    // Join trực tiếp qua thietbi_id/chitiet_id -- chỉ có giá trị với 'them'
    // (congviec_id null => join lồng ở trên rỗng, phải fallback về đây).
    const thietBiTrucTiep = firstOrNull(r.thietbi);
    const chiTietTrucTiep = firstOrNull(r.chitiet);

    return {
      id: r.id,
      congViecId: r.congviec_id,
      loaiDeXuat: r.loai_de_xuat,
      thoiGianMoi: r.thoi_gian_moi,
      tanSuatChuMoi: r.tan_suat_chu_moi,
      tanSuatSoMoi: r.tan_suat_so_moi,
      lyDo: r.ly_do,
      trangThai: r.trang_thai,
      nguoiDeXuat: r.nguoi_de_xuat,
      nguoiDuyet: r.nguoi_duyet,
      lyDoTuChoi: r.ly_do_tu_choi,
      createdAt: r.created_at,
      thoiGianHienTai: congViec?.thoi_gian ?? null,
      tanSuatChuHienTai: congViec?.tan_suat_chu ?? null,
      tanSuatSoHienTai: congViec?.tan_suat_so ?? null,
      loaiHoatDong: congViec?.loai_hoat_dong ?? "",
      tenChiTiet: chiTiet?.ten_chi_tiet ?? "",
      maThietBi: thietBi?.ma_thiet_bi ?? thietBiTrucTiep?.ma_thiet_bi ?? "",
      tenThietBi: thietBi?.ten_thiet_bi ?? thietBiTrucTiep?.ten_thiet_bi ?? "",
      tenChiTietMoi: r.ten_chi_tiet_moi ?? null,
      dieuKienCoBanMoi: r.dieu_kien_co_ban_moi ?? null,
      sttMoi: r.stt_moi ?? null,
      loaiHoatDongMoi: r.loai_hoat_dong_moi ?? null,
      chiTietChonTen: chiTietTrucTiep?.ten_chi_tiet ?? null,
    };
  });
}
