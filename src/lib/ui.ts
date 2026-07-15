// Token class dùng chung cho input/button/card trên toàn ứng dụng — tránh lặp
// lại cùng 1 chuỗi Tailwind ở nhiều file (form thiết bị, người dùng, cài đặt,
// bất thường, đăng nhập...). Đây là các hằng số className thuần, không phải
// component bọc, để không phá vỡ các form dùng useActionState/formAction sẵn có.
//
// GU THIẾT KẾ: tái hiện giao diện GAS/Bootstrap 5 cũ mà operator đã quen (xem
// DESIGN.md). KHÔNG nạp Bootstrap thật -- dựng lại bằng Tailwind để tránh 2
// framework CSS xung đột trong cùng app.
//
// Đừng "sửa ngược" về gu Apple trước đây (accent #0066cc, nút bo tròn pill,
// nền #f5f5f7): đó là quyết định đã bị thay thế 2026-07-15 theo yêu cầu người
// dùng, vì hệ thống cũ đang chạy thực tế có giao diện này.
//
// Bảng màu Bootstrap 5 dùng ở đây:
//   primary #0d6efd (hover #0b5ed7, active #0a58ca) | secondary #6c757d
//   danger #dc3545  | viền #dee2e6 | viền input #ced4da | chữ #212529
//   bo góc 0.375rem = Tailwind `rounded-md` | focus ring 0.25rem alpha 25%
export const ui = {
  input:
    "rounded-md border border-[#ced4da] bg-white px-3 py-1.5 text-sm text-[#212529] " +
    "placeholder:text-[#6c757d] transition-colors " +
    "focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/25 " +
    "disabled:cursor-not-allowed disabled:bg-[#e9ecef] disabled:text-[#6c757d]",
  label: "text-sm font-medium text-[#212529]",
  buttonPrimary:
    "inline-flex items-center justify-center rounded-md bg-[#0d6efd] px-3 py-1.5 text-sm font-medium text-white " +
    "transition-colors hover:bg-[#0b5ed7] active:bg-[#0a58ca] " +
    "focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/25 " +
    "disabled:cursor-not-allowed disabled:opacity-65",
  buttonSecondary:
    "inline-flex items-center justify-center rounded-md border border-[#6c757d] bg-white px-3 py-1.5 text-sm font-medium text-[#6c757d] " +
    "transition-colors hover:bg-[#6c757d] hover:text-white active:bg-[#5c636a] " +
    "focus:outline-none focus:ring-4 focus:ring-[#6c757d]/25 " +
    "disabled:cursor-not-allowed disabled:opacity-65",
  buttonDanger:
    "inline-flex items-center justify-center rounded-md bg-[#dc3545] px-3 py-1.5 text-sm font-medium text-white " +
    "transition-colors hover:bg-[#bb2d3b] active:bg-[#b02a37] " +
    "focus:outline-none focus:ring-4 focus:ring-[#dc3545]/25 " +
    "disabled:cursor-not-allowed disabled:opacity-65",
  card: "rounded-md border border-[#dee2e6] bg-white p-4",
  errorText: "text-sm text-[#dc3545]",
  successText: "text-sm text-[#198754]",
  navLink: "text-sm font-medium text-[#212529]/65 transition-colors hover:text-[#0d6efd]",
  navLinkActive: "text-sm font-medium text-[#0d6efd]",

  /** Nhãn cột/tiêu đề kiểu bản cũ: CHỮ HOA, đậm, cỡ nhỏ. */
  tableHeadCell:
    "border border-[#dee2e6] bg-[#f8f9fa] px-2 py-1.5 text-xs font-bold tracking-wide text-[#212529] uppercase",
  /** Viền ô dữ liệu trong bảng, đồng bộ với tableHeadCell. */
  tableCell: "border border-[#dee2e6] px-2 py-1.5",
} as const;
