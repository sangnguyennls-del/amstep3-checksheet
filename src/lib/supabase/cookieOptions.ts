// Cho phép app hiện trong IFRAME khác site (Google Sites nhúng app Vercel).
//
// Cookie phiên mặc định của @supabase/ssr là SameSite=Lax -> trong iframe khác
// site trình duyệt không gửi/không cho JS đọc -> lưới checksheet (nạp phía
// client) trả rỗng. Trình duyệt của user (đã xác nhận qua thực tế) CHẶN cookie
// bên-thứ-ba, nên None+Secure KHÔNG đủ -> phải thêm Partitioned (CHIPS): cookie
// được phân vùng theo site cha và vẫn hoạt động dưới chế độ chặn 3P cookie.
//
// HỆ QUẢ (chấp nhận theo yêu cầu "ưu tiên iframe hiện được"): Partitioned chia
// cookie theo TỪNG site cha -> iframe (cha = google sites) và LINK TRỰC TIẾP
// (cha = vercel) là 2 PHIÊN RIÊNG. Phải đăng nhập MỖI BÊN MỘT LẦN. Iframe để
// xem/chấm hằng ngày; khi cần IN PDF thì mở link trực tiếp (iframe không gọi
// được window.print()) và đăng nhập ở đó (1 lần, phiên first-party giữ lại).
//
// CHỈ áp ở production (https): SameSite=None bắt buộc Secure, mà Secure không đi
// qua http thường -> dev (http://localhost) giữ mặc định Lax để không gãy login.
// Phải override ở CẢ 3 nơi ghi cookie (server.ts, middleware.ts, client.ts) —
// nếu bỏ sót, lần refresh token sẽ ghi lại cookie Lax và hỏng lại trong iframe.
//
// ponytail: chặn theo NODE_ENV, không cấu hình runtime; cần bật/tắt động sau
// này thì đổi sang biến môi trường.
export const crossSiteCookieOptions =
  process.env.NODE_ENV === "production"
    ? { sameSite: "none" as const, secure: true, partitioned: true }
    : {};
