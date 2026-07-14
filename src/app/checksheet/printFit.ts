// Mục 8: tiện ích in PDF -- tên file mặc định + tự thu bản in vừa 1 trang A3
// ngang. Dùng chung cho nút "In" của /checksheet và in hàng loạt ở
// /admin/stats (BatchPrint).

// Vùng in A3 ngang. Dùng khổ THẬN TRỌNG: trình duyệt khi in thật thường áp
// lề mặc định lớn hơn `@page margin: 10mm` (tuỳ lựa chọn Margins trong hộp
// thoại in), nên nếu lấy đúng 420-20mm (~1511px) thì bảng sát mép và bị cắt
// cột ngày cuối. Trừ hao ~50mm bề ngang (25mm mỗi bên) để 31 cột luôn nằm
// gọn dù người dùng để lề "Default". 96dpi: 1mm ~ 3.7795px.
export const PRINT_PAGE_WIDTH_PX = Math.floor((420 - 50) * (96 / 25.4)); // ~1398
export const PRINT_PAGE_HEIGHT_PX = Math.floor((297 - 30) * (96 / 25.4)); // ~1009

/** "B07601" + "2026-07" -> "Checksheet-B07601-072026" (tên file PDF mặc định). */
export function buildPrintTitle(maThietBi: string, monthValue: string): string {
  const [y, m] = monthValue.split("-");
  return `Checksheet-${maThietBi}-${m}${y}`;
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
