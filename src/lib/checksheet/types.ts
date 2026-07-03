// Kiểu dữ liệu dùng xuyên suốt Pha 4 (Checksheet Grid). Task 1 định nghĩa,
// Task 2-4 import lại NGUYÊN TRẠNG — không định nghĩa lại ở nơi khác.
// Xem "### Cấu trúc dữ liệu grid" ở docs/plans/pha4-checksheet-grid.md.

export type KetQua = "G" | "R" | "N";

export type CongViecRow = {
  congViecId: string; // "CV00001"
  chiTietId: string; // "CT00001"
  stt: number | null;
  tenChiTiet: string;
  dieuKienCoBan: string | null;
  loaiHoatDong: string;
  thoiGian: number | null;
};

export type ThucHienCell = {
  id: string | null; // null nếu ô này chưa có dòng thuc_hien nào
  keHoach: boolean;
  ketQua: KetQua;
  updatedAt: string | null; // ISO timestamp, dùng cho optimistic concurrency
  // Task 4: mô tả bất thường (bat_thuong.mo_ta) khi ketQua="R" -- join từ
  // getThucHien() (queries.ts) để Cell.tsx hiện tooltip hover mà không cần gọi
  // riêng 1 API cho từng ô. undefined/null nếu ô không phải "R" hoặc chưa tải
  // join (vd vừa applyBatThuong ở gridReducer, xem BatThuongModal.tsx).
  batThuongMoTa?: string | null;
};

// Map "CV00001_2026-07-15" -> ThucHienCell
export type ThucHienMap = Record<string, ThucHienCell>;

export function cellKey(congViecId: string, ngayIso: string): string {
  return `${congViecId}_${ngayIso}`;
}

export type FilterOptions = {
  xuong: string[];
  kip: string[];
  // Mỗi phần tử định dạng "msnv - ho_ten" (hoặc chỉ "msnv" nếu chưa có hồ sơ
  // nguoidung tương ứng) để UI hiển thị đủ thông tin từ 1 mảng string phẳng
  // đúng theo shape đã chốt trong plan. Khi lọc thietBi theo nhân viên đã
  // chọn, tách lấy phần msnv trước dấu " - " để so khớp với
  // thietBi[].nguoiPhuTrach. Xem cách tách trong queries.ts (parseNhanVienMsnv).
  nhanVien: string[];
  thietBi: {
    id: string;
    maThietBi: string;
    tenThietBi: string;
    xuong: string;
    kip: string;
    nguoiPhuTrach: string | null;
    anhUrl: string | null;
  }[];
};
