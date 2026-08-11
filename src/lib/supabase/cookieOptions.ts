// Cho phép app chạy CẢ khi mở trực tiếp LẪN khi nhúng iframe (Google Sites).
//
// Cookie phiên mặc định của @supabase/ssr là SameSite=Lax -> trong iframe khác
// site trình duyệt không gửi/không cho JS đọc -> lưới checksheet (nạp phía
// client) trả rỗng. SameSite=None + Secure cho phép gửi cookie trong iframe.
//
// KHÔNG dùng Partitioned (CHIPS): Partitioned chia cookie theo TỪNG site cha,
// nên đăng nhập trong iframe (site cha = google sites) thì link trực tiếp
// (site cha = vercel) lại là ngăn khác -> mất phiên. Bỏ Partitioned = 1 cookie
// dùng chung -> cả hai cùng thấy. Đánh đổi: iframe phụ thuộc trình duyệt CHO
// PHÉP cookie bên-thứ-ba (Safari/iOS hoặc Chrome chặn 3P cookie thì iframe vẫn
// có thể trống); khi đó dùng link trực tiếp. In PDF: luôn dùng link trực tiếp
// (iframe không gọi được window.print()).
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
    ? { sameSite: "none" as const, secure: true }
    : {};
