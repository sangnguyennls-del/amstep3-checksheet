// Pha 7 (Task 1) — đọc file .xlsx nguồn theo đúng tên sheet + vị trí cột đã
// xác minh thủ công trong docs/plans/pha7-data-migration.md (mục "Bối cảnh").
// KHÔNG dùng tên cột từ header để đọc sheet "Data" vì header của sheet đó
// SAI, không khớp nội dung thật — xem bảng đối chiếu trong plan.
// xlsx là package CommonJS thuần (không có "exports" map, named-export
// detection của Node ESM loader không đáng tin cậy với nó) -- import default
// rồi dùng qua namespace object, KHÔNG dùng `import * as XLSX`.
import XLSX from "xlsx";
import type {
  RawConfigRow,
  RawDataRow,
  RawImageRow,
  RawLogRow,
  RawThietBiFullRow,
  RawUserRow,
} from "./types.ts";

// Hằng số tên sheet — dùng thay vì gõ tay chuỗi nhiều nơi để tránh lỗi thiếu
// dấu cách cuối (sheet "Thiết bị " có 1 dấu cách cuối tên, dễ gõ sai).
export const SHEET_NAMES = {
  CONFIG: "Config",
  USERS: "Users",
  IMAGES: "Images",
  THIET_BI_FULL: "Thiết bị ", // CHÚ Ý dấu cách cuối — 9 ký tự, KHÔNG được trim khi tra cứu tên sheet
  LOGS: "Logs",
  DATA: "Data",
} as const;

// Sheet PHẢI BỎ QUA (liệt kê để tài liệu hoá quyết định, không dùng trong code):
// "Bản sao của Config - 120625", "Bản sao của Logs", "Bản sao của Data", "Query".

export function loadWorkbook(path: string): XLSX.WorkBook {
  return XLSX.readFile(path);
}

function getSheetOrThrow(wb: XLSX.WorkBook, sheetName: string): XLSX.WorkSheet {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(
      `Không tìm thấy sheet "${sheetName}" trong file .xlsx. Các sheet có trong file: ${wb.SheetNames.join(", ")}`,
    );
  }
  return sheet;
}

/** Đọc 1 sheet thành mảng-các-mảng (bỏ dòng header ở index 0), giữ nguyên kiểu số/chuỗi gốc. */
function readRowsAsArrays(wb: XLSX.WorkBook, sheetName: string, rawValues = true): unknown[][] {
  const sheet = getSheetOrThrow(wb, sheetName);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: rawValues,
  });
  return rows.slice(1); // bỏ dòng header
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Chuẩn hoá text nhiều dòng (Tên chi tiết / Điều kiện cơ bản): thu gọn MỌI
 * khoảng trắng liên tiếp (bao gồm xuống dòng \n) thành 1 dấu cách.
 *
 * Phát hiện thực tế (KHÔNG có trong plan, tự phát hiện khi build model lần
 * đầu và thấy hàng trăm orphanThucHien giả): cùng 1 điều kiện cơ bản được
 * gõ trong Config với \n giữa các câu (vd "...kêu lạ. \nNắp bảo vệ..."),
 * nhưng cùng nội dung đó ở nhiều dòng Data lại bị Google Sheets/Excel làm
 * phẳng thành 1 dòng khi lưu (mất \n, chỉ còn 1 dấu cách) -- 2 CÁCH GÕ CHO
 * CÙNG 1 NỘI DUNG THẬT. Nếu match nguyên văn (không collapse whitespace)
 * sẽ coi đây là 2 "dieu_kien_co_ban" khác nhau -> sai lệch hàng loạt
 * CONGVIEC không khớp được giữa Config và Data. Áp dụng hàm này cho CẢ
 * Config lẫn Data trước khi build khoá dedupe/match để 2 cách gõ quy về
 * cùng 1 giá trị.
 */
function strCollapseWhitespace(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function numOrNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Config — header ĐÚNG với nội dung, nhưng vẫn đọc theo VỊ TRÍ CỘT (không
// dùng tên cột) để nhất quán với cách đọc Data và tránh phụ thuộc thứ tự
// cột nếu người dùng lỡ sắp xếp lại cột trong Google Sheets trước khi export.
// Vị trí: [STT(0), Xưởng(1), Kíp(2), Tên(3), Thiết bị(4), Cụm Thiết bị(5),
// Khu vực(6), Lãnh đạo xưởng(7), Trưởng ca(8), Tên chi tiết(9),
// Điều Kiện cơ bản(10), Tiêu chuẩn=Loại hoạt động(11), Thời gian(12),
// Tần suất(13), Tần suất - n(14)].
// Lọc dòng đệm trống bằng cột STT (0) rỗng — đã xác minh dòng có STT rỗng
// luôn là dòng đệm trống của Google Sheet (0 phản ví dụ ngược lại).
// ---------------------------------------------------------------------------
export function readConfigRows(wb: XLSX.WorkBook): RawConfigRow[] {
  const rows = readRowsAsArrays(wb, SHEET_NAMES.CONFIG);
  return rows
    .filter((r) => str(r[0]) !== "")
    .map((r) => ({
      stt: numOrNull(r[0]),
      xuong: str(r[1]),
      kip: str(r[2]),
      ten: str(r[3]),
      thietBi: str(r[4]),
      cumThietBi: str(r[5]),
      khuVuc: str(r[6]),
      lanhDaoXuong: str(r[7]),
      truongCa: str(r[8]),
      tenChiTiet: strCollapseWhitespace(r[9]),
      dieuKienCoBan: strCollapseWhitespace(r[10]),
      loaiHoatDong: str(r[11]),
      thoiGian: numOrNull(r[12]),
      tanSuatChu: str(r[13]),
      tanSuatSo: numOrNull(r[14]),
    }));
}

// ---------------------------------------------------------------------------
// Data — CHÚ Ý header của sheet này SAI (xem đầu file). Đọc theo vị trí cột
// đã xác minh: 0=Tháng/Năm, 1=rowId cũ (header ghi nhầm "Xưởng"),
// 2=Xưởng (header ghi nhầm "Kíp"), 3=Tên, 4=Thiết bị, 5=Tên chi tiết,
// 6=Loại hoạt động (header ghi nhầm "Điều Kiện cơ bản"),
// 7=Điều kiện cơ bản (header ghi nhầm "Tiêu chuẩn"), 8..38=31 ngày,
// 39=Tên người chỉnh sửa cuối. Lọc dòng đệm trống bằng cột 0 (Tháng/Năm) rỗng.
// ---------------------------------------------------------------------------
export function readDataRows(wb: XLSX.WorkBook): RawDataRow[] {
  const rows = readRowsAsArrays(wb, SHEET_NAMES.DATA);
  return rows
    .filter((r) => str(r[0]) !== "")
    .map((r) => {
      const ngay31: string[] = [];
      for (let day = 1; day <= 31; day++) {
        ngay31.push(str(r[7 + day])); // cột 8..38
      }
      return {
        thangNam: str(r[0]),
        legacyRowId: str(r[1]),
        xuong: str(r[2]),
        ten: str(r[3]),
        thietBi: str(r[4]),
        tenChiTiet: strCollapseWhitespace(r[5]),
        loaiHoatDong: str(r[6]),
        dieuKienCoBan: strCollapseWhitespace(r[7]),
        ngay31,
        tenNguoiChinhSuaCuoi: str(r[39]),
      };
    });
}

// ---------------------------------------------------------------------------
// Users — chỉ giữ dòng có MSNV (cột 0) khác rỗng, phần còn lại là dòng đệm
// trống của Google Sheet (940/998 dòng, đã xác minh thủ công).
// ---------------------------------------------------------------------------
export function readUsersRows(wb: XLSX.WorkBook): RawUserRow[] {
  const rows = readRowsAsArrays(wb, SHEET_NAMES.USERS);
  return rows
    .filter((r) => str(r[0]) !== "")
    .map((r) => ({
      msnv: str(r[0]),
      username: str(r[1]),
      password: str(r[2]),
      hoTen: str(r[3]),
      donVi: str(r[4]),
      role: str(r[5]),
    }));
}

// ---------------------------------------------------------------------------
// Images — [Thiết bị(0), URL(1)], lọc dòng có mã thiết bị rỗng.
// ---------------------------------------------------------------------------
export function readImagesRows(wb: XLSX.WorkBook): RawImageRow[] {
  const rows = readRowsAsArrays(wb, SHEET_NAMES.IMAGES);
  return rows
    .filter((r) => str(r[0]) !== "")
    .map((r) => ({
      thietBi: str(r[0]),
      url: str(r[1]),
    }));
}

// ---------------------------------------------------------------------------
// "Thiết bị " — danh sách đầy đủ mã thiết bị, chỉ 1 cột, lọc dòng rỗng.
// ---------------------------------------------------------------------------
export function readThietBiFullList(wb: XLSX.WorkBook): RawThietBiFullRow[] {
  const rows = readRowsAsArrays(wb, SHEET_NAMES.THIET_BI_FULL);
  return rows.map((r) => str(r[0])).filter((v) => v !== "");
}

// ---------------------------------------------------------------------------
// Logs — audit tóm tắt cũ, copy nguyên trạng. Dùng raw:false để lấy đúng
// chuỗi ngày-giờ ĐÃ ĐỊNH DẠNG hiển thị trong Google Sheets (vd
// "13/03/2026 13:09:20") thay vì số serial ngày của Excel (vd 46094.548...)
// mà raw:true trả về cho cột kiểu ngày-giờ.
// ---------------------------------------------------------------------------
export function readLogsRows(wb: XLSX.WorkBook): RawLogRow[] {
  const rows = readRowsAsArrays(wb, SHEET_NAMES.LOGS, false);
  return rows
    .filter((r) => str(r[0]) !== "")
    .map((r) => ({
      thoiGian: str(r[0]),
      nguoiChinhSua: str(r[1]),
      taiKhoan: str(r[2]),
      thangDuLieu: str(r[3]),
      thietBiTacDong: str(r[4]),
    }));
}
