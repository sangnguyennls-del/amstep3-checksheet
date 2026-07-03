// Supabase Auth yêu cầu định dạng email. Hệ thống cũ đăng nhập bằng
// username/MSNV thường, nên sinh một email nội bộ giả để giữ thói quen đăng
// nhập cũ mà không cần thu thập email thật của từng nhân viên.
const USERNAME_EMAIL_DOMAIN = "pvcfc.internal";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}
