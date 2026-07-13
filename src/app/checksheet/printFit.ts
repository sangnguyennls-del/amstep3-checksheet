// Mục 8: tiện ích in PDF -- tên file mặc định + tự thu bản in vừa 1 trang A3
// ngang. Dùng chung cho nút "In" của /checksheet và in hàng loạt ở
// /admin/stats (BatchPrint).

// Vùng in A3 ngang với margin 10mm (print.css @page): 420-20 x 297-20 mm,
// quy ra CSS px ở 96dpi (1mm ~ 3.7795px).
export const PRINT_PAGE_WIDTH_PX = Math.floor((420 - 20) * (96 / 25.4)); // ~1511
export const PRINT_PAGE_HEIGHT_PX = Math.floor((297 - 20) * (96 / 25.4)); // ~1047

/** "B07601" + "2026-07" -> "Checksheet-B07601-072026" (tên file PDF mặc định). */
export function buildPrintTitle(maThietBi: string, monthValue: string): string {
  const [y, m] = monthValue.split("-");
  return `Checksheet-${maThietBi}-${m}${y}`;
}

/**
 * Thu bản in (.print-sheet) vừa 1 trang: phần tử này nằm off-screen với bề
 * rộng đúng vùng in A3 (print.css) nên scrollHeight đo được chính là chiều
 * cao thật khi in. Nếu cao quá khổ giấy: dùng `zoom` (ảnh hưởng layout thật,
 * khác transform -- transform không đổi kích thước hộp nên vẫn bị ngắt
 * trang) và NỚI bề rộng = pageWidth/zoom để sau khi thu nhỏ bản in vẫn phủ
 * kín bề ngang trang giấy. Thiết bị ít dòng: reset về mặc định (zoom 1).
 */
export function fitPrintSheetToPage(): void {
  const sheets = document.querySelectorAll<HTMLElement>(".print-sheet");
  sheets.forEach((sheet) => {
    // Reset trước khi đo (lần in trước có thể đã đặt zoom/width).
    sheet.style.removeProperty("zoom");
    sheet.style.removeProperty("width");
    const naturalHeight = sheet.scrollHeight;
    if (naturalHeight <= PRINT_PAGE_HEIGHT_PX) return;
    const scale = PRINT_PAGE_HEIGHT_PX / naturalHeight;
    sheet.style.setProperty("zoom", String(scale));
    sheet.style.setProperty("width", `${Math.floor(PRINT_PAGE_WIDTH_PX / scale)}px`);
  });
}
