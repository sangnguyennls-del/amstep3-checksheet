// Mục 8: tiện ích in PDF -- tên file mặc định + tự thu bản in vừa 1 trang A3
// ngang. Dùng chung cho nút "In" của /checksheet và in hàng loạt ở
// /admin/stats (BatchPrint).

// Bao vừa-1-trang tính theo WORST-CASE của cả 2 hướng giấy, KHÔNG chỉ A3 ngang.
// Lý do: `@page { size: A3 landscape }` (print.css) chỉ được Chrome "Save as
// PDF" tôn trọng; các đích in phổ biến khác -- nhất là "Microsoft Print to PDF"
// (mặc định trên Windows) -- BỎ QUA lệnh landscape và in ra khổ A3 DỌC. Trên
// trang dọc, page-box (297mm trừ lề) chỉ ~1047px bề ngang, nên nếu tính bao
// theo bề ngang khổ ngang (~1398px) thì bảng ~1400px không được thu, tràn phải,
// bị cắt ở ~cột 28 và rớt sang trang 2 (đúng lỗi người dùng gặp).
//   - Bề RỘNG: lấy khổ DỌC-an toàn (297mm) -> vừa cả trang dọc lẫn ngang.
//   - Bề CAO: lấy khổ NGANG-an toàn (297mm) -> khổ dọc cao hơn nên luôn dư.
// Trừ hao ~30mm lề mỗi chiều cho lề mặc định của hộp thoại in. 96dpi: 1mm~3.7795px.
export const PRINT_PAGE_WIDTH_PX = Math.floor((297 - 30) * (96 / 25.4)); // ~1009
export const PRINT_PAGE_HEIGHT_PX = Math.floor((297 - 30) * (96 / 25.4)); // ~1009

/** "KT06101" + "2026-07" -> "072026-KT06101" (tên file PDF mặc định, MMyyyy-mã). */
export function buildPrintTitle(maThietBi: string, monthValue: string): string {
  const [y, m] = monthValue.split("-");
  return `${m}${y}-${maThietBi}`;
}

/**
 * Thu bản in (.print-sheet) vừa 1 trang A3: đo cả bề RỘNG lẫn bề CAO thật
 * (element nằm off-screen với kích thước đúng như khi in, xem print.css) rồi
 * áp 1 hệ số `zoom` = min(rộng, cao) để không tràn theo BẤT KỲ chiều nào.
 *
 * Sửa lỗi (vòng 2): bản cũ chỉ co khi CAO quá trang, bỏ qua chiều RỘNG -- nên
 * thiết bị ít dòng (bảng đủ rộng nhưng không cao) không được thu, in thật của
 * trình duyệt (lề mặc định) làm tràn phải, cắt mất các cột ngày cuối (26-31).
 * Cũng bỏ đoạn "nới width" cũ (phản tác dụng khi chiều rộng mới là ràng buộc).
 * `zoom` (không phải transform) để layout co thật, không bị ngắt trang.
 *
 * Sửa lỗi (vòng 3): bao RỘNG/CAO (PRINT_PAGE_*_PX) nay tính theo khổ DỌC-an
 * toàn, vì đích "Microsoft Print to PDF" bỏ qua `@page landscape` -> in ra A3
 * dọc; bao ngang cũ (~1398px) không thu đủ nên bảng ~1400px tràn cột 28-31 sang
 * trang 2. Thu về ~1009px thì vừa cả trang dọc lẫn ngang -> luôn 1 trang.
 */
export function fitPrintSheetToPage(): void {
  const sheets = document.querySelectorAll<HTMLElement>(".print-sheet");
  sheets.forEach((sheet) => {
    // Reset trước khi đo (lần in trước có thể đã đặt zoom).
    sheet.style.removeProperty("zoom");
    const naturalWidth = sheet.scrollWidth;
    const naturalHeight = sheet.scrollHeight;
    const scale = Math.min(
      1,
      PRINT_PAGE_WIDTH_PX / naturalWidth,
      PRINT_PAGE_HEIGHT_PX / naturalHeight,
    );
    if (scale < 1) {
      sheet.style.setProperty("zoom", String(scale));
    }
  });
}
