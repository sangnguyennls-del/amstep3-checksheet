// Hàm truy vấn danh sách bất thường cho trang quản trị (Pha 5, Task 1).
// Đọc-only: join xuyên suốt bat_thuong -> thuc_hien -> congviec -> chitiet ->
// thietbi qua các FK có sẵn (không cần view/RPC mới, xem 0001_schema.sql).
import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST trả embed 1-1 (phía "many" không unique) có thể là object hoặc
// mảng 1 phần tử tuỳ version -- đã gặp ở Pha 4 (xem `firstOrNull()` trong
// `src/lib/checksheet/queries.ts`), tái dùng lại đúng kỹ thuật đó thay vì viết
// lại logic khác cho cùng 1 vấn đề đã biết.
function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type BatThuongListItem = {
  id: string;
  moTa: string;
  anhUrl: string | null;
  ngayPhatHien: string; // "YYYY-MM-DD"
  ngayKhacPhuc: string | null;
  trangThai: "Mở" | "Đang xử lý" | "Đã đóng";
  nguoiGhi: string | null;
  nguoiGhiTen: string | null; // họ tên (join nguoidung theo nguoi_ghi)
  ngay: string; // ngày của thuc_hien liên quan ("YYYY-MM-DD")
  loaiHoatDong: string;
  tenChiTiet: string;
  maThietBi: string;
  tenThietBi: string;
};

type ThietBiJoin = { ma_thiet_bi: string; ten_thiet_bi: string };
type ChiTietJoin = { ten_chi_tiet: string; thietbi: ThietBiJoin | ThietBiJoin[] | null };
type CongViecJoin = { loai_hoat_dong: string; chitiet: ChiTietJoin | ChiTietJoin[] | null };
type ThucHienJoin = { ngay: string; congviec: CongViecJoin | CongViecJoin[] | null };

type BatThuongJoinRow = {
  id: string;
  mo_ta: string;
  anh_url: string | null;
  ngay_phat_hien: string;
  ngay_khac_phuc: string | null;
  trang_thai: "Mở" | "Đang xử lý" | "Đã đóng";
  nguoi_ghi: string | null;
  updated_at: string;
  thuc_hien: ThucHienJoin | ThucHienJoin[] | null;
  // Họ tên người ghi (1 FK duy nhất bat_thuong.nguoi_ghi -> nguoidung.msnv).
  nguoi_ghi_nd: { ho_ten: string } | { ho_ten: string }[] | null;
};

/**
 * SELECT toàn bộ `bat_thuong` join xuyên suốt tới `thuc_hien` / `congviec` /
 * `chitiet` / `thietbi` để có đủ ngữ cảnh hiển thị trên bảng quản trị (ngày,
 * thiết bị, nội dung, loại hoạt động) mà không cần gọi thêm truy vấn nào.
 * `trangThaiFilter` không truyền hoặc mảng rỗng = lấy tất cả trạng thái.
 */
export async function getBatThuongList(
  supabase: SupabaseClient,
  trangThaiFilter?: string[],
): Promise<BatThuongListItem[]> {
  let query = supabase
    .from("bat_thuong")
    .select(
      `id, mo_ta, anh_url, ngay_phat_hien, ngay_khac_phuc, trang_thai, nguoi_ghi, updated_at,
       nguoi_ghi_nd:nguoidung!nguoi_ghi ( ho_ten ),
       thuc_hien!inner ( ngay,
         congviec!inner ( loai_hoat_dong,
           chitiet!inner ( ten_chi_tiet,
             thietbi!inner ( ma_thiet_bi, ten_thiet_bi ) ) ) )`,
    )
    .order("ngay_phat_hien", { ascending: false });

  if (trangThaiFilter && trangThaiFilter.length > 0) {
    query = query.in("trang_thai", trangThaiFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as BatThuongJoinRow[];

  return rows.map((r) => {
    const thucHien = firstOrNull(r.thuc_hien);
    const congViec = firstOrNull(thucHien?.congviec ?? null);
    const chiTiet = firstOrNull(congViec?.chitiet ?? null);
    const thietBi = firstOrNull(chiTiet?.thietbi ?? null);

    return {
      id: r.id,
      moTa: r.mo_ta,
      anhUrl: r.anh_url ?? null,
      ngayPhatHien: r.ngay_phat_hien,
      ngayKhacPhuc: r.ngay_khac_phuc ?? null,
      trangThai: r.trang_thai,
      nguoiGhi: r.nguoi_ghi ?? null,
      nguoiGhiTen: firstOrNull(r.nguoi_ghi_nd)?.ho_ten ?? null,
      ngay: thucHien?.ngay ?? "",
      loaiHoatDong: congViec?.loai_hoat_dong ?? "",
      tenChiTiet: chiTiet?.ten_chi_tiet ?? "",
      maThietBi: thietBi?.ma_thiet_bi ?? "",
      tenThietBi: thietBi?.ten_thiet_bi ?? "",
    };
  });
}
