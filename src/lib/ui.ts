// Token class dùng chung cho input/button/card trên toàn ứng dụng — tránh lặp
// lại cùng 1 chuỗi Tailwind ở nhiều file (form thiết bị, người dùng, cài đặt,
// bất thường, đăng nhập...). Đây là các hằng số className thuần, không phải
// component bọc, để không phá vỡ các form dùng useActionState/formAction sẵn có.
//
// Gu thiết kế (tham khảo apple-DESIGN.md, xem thêm kế hoạch "Việc B5"): 1 màu
// nhấn duy nhất (Apple Action Blue #0066cc) cho mọi nút chính/link/focus ring
// -- không dùng thêm màu nhấn thứ 2. Quy tắc bo góc thống nhất: NÚT luôn bo
// tròn pill (rounded-full, đúng "button-primary" của Apple), input/card giữ
// rounded-md/rounded-lg như cũ -- 2 hệ bo góc tách biệt, không trộn lẫn.
export const ui = {
  input:
    "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
    "placeholder:text-gray-400 transition-colors " +
    "focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 " +
    "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
  label: "text-sm font-medium text-gray-700",
  buttonPrimary:
    "inline-flex items-center justify-center rounded-full bg-[#0066cc] px-4 py-2 text-sm font-medium text-white " +
    "transition-colors hover:bg-[#0055ab] active:bg-[#004a94] " +
    "focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 " +
    "disabled:cursor-not-allowed disabled:opacity-60",
  buttonSecondary:
    "inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 " +
    "transition-colors hover:bg-gray-50 active:bg-gray-100 " +
    "focus:outline-none focus:ring-2 focus:ring-gray-200 " +
    "disabled:cursor-not-allowed disabled:opacity-60",
  buttonDanger:
    "inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white " +
    "transition-colors hover:bg-red-700 active:bg-red-800 " +
    "focus:outline-none focus:ring-2 focus:ring-red-200 " +
    "disabled:cursor-not-allowed disabled:opacity-60",
  card: "rounded-lg border border-gray-200 bg-white p-4 shadow-sm",
  errorText: "text-sm text-red-600",
  successText: "text-sm text-green-600",
  navLink: "text-sm font-medium text-gray-600 transition-colors hover:text-[#0066cc]",
  navLinkActive: "text-sm font-medium text-[#0066cc]",
} as const;
