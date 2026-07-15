// Mục 8: tiện ích in PDF -- tên file mặc định + tự thu bản in vừa 1 trang A3
// ngang. Dùng chung cho nút "In" của /checksheet và in hàng loạt ở
// /admin/stats (BatchPrint).

// Bao vừa-1-trang, TỐI ƯU CHO A3 NGANG (quyết định người dùng 2026-07-14).
//
// Lịch sử để đừng "sửa lại cho an toàn" mà không biết lý do: vòng 3 từng đặt bao
// theo khổ DỌC-an toàn (~1009px) để phòng "Microsoft Print to PDF bỏ qua
// `@page landscape` -> in ra khổ dọc". Nhưng thực tế mọi bản người dùng xuất đều
// ra khổ NGANG, nên bao dọc phí mất ~1/3 bề ngang trang -> bảng in bị NHỎ (chỉ
// dùng 63% bề ngang). Người dùng đã chốt: tối ưu khổ ngang, CHẤP NHẬN đánh đổi
// -- nếu đích in nào ra khổ DỌC thì bảng sẽ tràn 2 trang trở lại.
//
// Ngân sách (đã kiểm chứng từ PDF thật: rendered_mm = cap_px / 3.7795, trình
// duyệt KHÔNG tự co thêm):
//   Bề ngang: A3 ngang 420mm - lề @page 20mm = 400mm page-box, trừ padding p-6
//             của <main> (24px x 2 = 12.7mm) -> 387mm khả dụng.
//   Bề cao:   297 - 20 - 12.7 = 264mm khả dụng.
// Lấy 380mm x 257mm (chừa ~7mm an toàn mỗi chiều). 96dpi: 1mm ~ 3.7795px.
export const PRINT_PAGE_WIDTH_PX = Math.floor((420 - 40) * (96 / 25.4)); // ~1436 (380mm)
export const PRINT_PAGE_HEIGHT_PX = Math.floor((297 - 40) * (96 / 25.4)); // ~971 (257mm)

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
 * Vòng 4: bao RỘNG/CAO (PRINT_PAGE_*_PX) tính theo khổ A3 NGANG -- xem lý do +
 * ngân sách mm ở comment của 2 hằng số đó. Thiết bị ÍT dòng bị bề RỘNG chặn
 * (lấp gần hết bề ngang, chừa trắng dưới -- đúng ý người dùng, không giãn dòng);
 * thiết bị NHIỀU dòng bị bề CAO chặn (lấp gần hết chiều dọc).
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
