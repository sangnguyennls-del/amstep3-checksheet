// Cho phép app chạy trong IFRAME KHÁC SITE (Google Sites nhúng app Vercel).
//
// Trong iframe bên-thứ-ba, cookie phiên mặc định của @supabase/ssr là
// SameSite=Lax -> trình duyệt KHÔNG gửi/không cho JS đọc trong ngữ cảnh này,
// nên browser client mất phiên và lưới checksheet (nạp phía client) trả rỗng.
// SameSite=None + Secure + Partitioned (CHIPS) cho phép cookie hoạt động trong
// iframe. First-party (mở trực tiếp) vẫn chạy bình thường (None/Partitioned
// tương thích ngược khi truy cập trực tiếp).
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
