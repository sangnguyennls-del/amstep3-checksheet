// Pha 7 (Task 1) — các kiểu dữ liệu dùng chung cho toàn bộ script migrate.
// Xem docs/plans/pha7-data-migration.md mục "Bối cảnh" để biết nguồn gốc
// từng trường (vị trí cột trong file .xlsx gốc đã xác minh thủ công).

// ---------------------------------------------------------------------------
// Raw*: đại diện 1 dòng thô đọc thẳng từ sheet, đã cắt bỏ dòng đệm trống
// nhưng CHƯA chuẩn hoá giá trị (chưa dedupe, chưa tách mã ghép, chưa map
// Tên -> MSNV).
// ---------------------------------------------------------------------------

/** 1 dòng sheet "Config" (header ĐÚNG với nội dung, đọc theo tên cột an toàn). */
export interface RawConfigRow {
  stt: number | null;
  xuong: string;
  kip: string;
  ten: string; // người phụ trách (Config chỉ lưu TÊN, không lưu MSNV)
  thietBi: string; // mã thiết bị THÔ, có thể là mã ghép (vd "E06119-E06120-E06121")
  cumThietBi: string;
  khuVuc: string;
  lanhDaoXuong: string;
  truongCa: string;
  tenChiTiet: string;
  dieuKienCoBan: string;
  loaiHoatDong: string; // cột "Tiêu chuẩn" của Config = Loại hoạt động thật
  thoiGian: number | null;
  tanSuatChu: string;
  tanSuatSo: number | null;
}

/**
 * 1 dòng sheet "Data" — CHÚ Ý: header ghi trong file SAI, không khớp nội
 * dung thật. Các trường dưới đây đặt tên theo NỘI DUNG THẬT (đã xác minh
 * bằng cách đối chiếu giá trị với enum Loại đã biết và với sheet Config),
 * không theo nhãn header. Xem bảng đối chiếu cột trong plan, mục "Bối cảnh".
 */
export interface RawDataRow {
  thangNam: string; // cột 0, vd "03/2026" — header ĐÚNG
  legacyRowId: string; // cột 1 — header ghi nhầm "Xưởng", thật ra là rowId cũ, ĐÔI KHI SAI/CŨ, chỉ lưu tham khảo
  xuong: string; // cột 2 — header ghi nhầm "Kíp"
  ten: string; // cột 3 — tên người phụ trách, đúng vị trí
  thietBi: string; // cột 4 — đúng vị trí
  tenChiTiet: string; // cột 5 — đúng vị trí
  loaiHoatDong: string; // cột 6 — header ghi nhầm "Điều Kiện cơ bản", thật ra là Loại hoạt động
  dieuKienCoBan: string; // cột 7 — header ghi nhầm "Tiêu chuẩn", thật ra là Điều kiện cơ bản
  ngay31: string[]; // cột 8..38 — 31 ô "Plan|Actual" theo thứ tự ngày 1..31
  tenNguoiChinhSuaCuoi: string; // cột 39 — TÊN người chỉnh sửa cuối, không phải MSNV
}

/** 1 dòng sheet "Users" — chỉ dòng có MSNV khác rỗng mới là user thật. */
export interface RawUserRow {
  msnv: string;
  username: string; // cột "User" — dùng để build email Auth, KHÔNG dùng MSNV
  password: string; // KHÔNG mang sang hệ mới, chỉ đọc để tham khảo nếu cần
  hoTen: string;
  donVi: string;
  role: string; // "Admin" | "AdminM" | "User" | ""
}

/** 1 dòng sheet "Images". */
export interface RawImageRow {
  thietBi: string;
  url: string;
}

/** 1 dòng sheet "Thiết bị " (CHÚ Ý dấu cách cuối tên sheet) — danh sách đầy đủ mã thiết bị. */
export type RawThietBiFullRow = string; // chỉ có 1 cột mã thiết bị

/** 1 dòng sheet "Logs" — audit tóm tắt cũ, copy nguyên trạng, không transform nghiệp vụ. */
export interface RawLogRow {
  thoiGian: string; // giữ nguyên chuỗi định dạng gốc "DD/MM/YYYY HH:MM:SS"
  nguoiChinhSua: string;
  taiKhoan: string;
  thangDuLieu: string;
  thietBiTacDong: string;
}

// ---------------------------------------------------------------------------
// Record đã chuẩn hoá — đầu ra của buildMigrationModel(). Task 2-4 sẽ đọc
// các mảng này để ghi vào Postgres. CHITIET/CONGVIEC chưa có id thật (id do
// DB sinh lúc INSERT ở Task 2) nên dùng "key" ổn định trong bộ nhớ để nối
// quan hệ cha-con, tương tự "khoá tạm" nêu trong plan Task 2.
// ---------------------------------------------------------------------------

export type VaiTro = "user" | "admin" | "adminm";

export interface NguoiDungRecord {
  msnv: string;
  username: string;
  hoTen: string;
  donVi: string | null;
  vaiTro: VaiTro;
}

export interface ThietBiRecord {
  maThietBi: string;
  tenThietBi: string; // = maThietBi (không có nguồn nào khác để suy tên đẹp hơn)
  cum: string | null;
  khuVuc: string | null;
  xuong: string | null;
  kip: string | null;
  lanhDao: string | null;
  truongCa: string | null;
  nguoiPhuTrach: string | null; // MSNV, null nếu không tra được hoặc thiết bị mới hoàn toàn
  anhUrl: string | null; // URL Drive gốc, chưa resolve
}

/** Khoá dedupe/nối quan hệ CHITIET trong bộ nhớ: `${maThietBi}||${tenChiTiet}||${dieuKienCoBan}`. */
export type ChiTietKey = string;

export interface ChiTietRecord {
  key: ChiTietKey;
  maThietBi: string;
  stt: number | null; // số đánh trên sơ đồ hình ảnh, chỉ để hiển thị, không tham gia khoá
  tenChiTiet: string;
  dieuKienCoBan: string;
}

/** Khoá dedupe/nối quan hệ CONGVIEC trong bộ nhớ: `${chiTietKey}||${loaiHoatDong}`. */
export type CongViecKey = string;

export interface CongViecRecord {
  key: CongViecKey;
  chiTietKey: ChiTietKey;
  loaiHoatDong: string; // đã chuẩn hoá, 1 trong 4 giá trị enum
  thoiGian: number | null;
  tanSuatChu: string | null;
  tanSuatSo: number | null;
}

export interface ThucHienRecord {
  congViecKey: CongViecKey;
  ngay: string; // "YYYY-MM-DD"
  keHoach: boolean;
  ketQua: "G" | "R" | "N";
  nguoiThucHien: string | null; // MSNV, null nếu không tra được hoặc ô trống
  legacyRowId: string;
  legacyMonthYear: string;
  needsBatThuong: boolean; // true khi ketQua === 'R'
}

export interface OrphanThucHienRecord {
  thietBi: string;
  tenChiTiet: string;
  dieuKienCoBan: string;
  loaiHoatDong: string;
  thangNam: string;
  ngay: string | null; // null nếu không tính được ngày hợp lệ
  giaTriO: string; // "Y|G" nguyên gốc
  legacyRowId: string;
  lyDo: string;
}

export interface MigrationModel {
  nguoiDung: NguoiDungRecord[];
  thietBi: ThietBiRecord[];
  chiTiet: ChiTietRecord[];
  congViec: CongViecRecord[];
  thucHien: ThucHienRecord[];
  orphanThucHien: OrphanThucHienRecord[];
  logs: RawLogRow[];
  warnings: string[];
}
