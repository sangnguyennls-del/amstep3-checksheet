-- Cho phép đăng nhập bằng MSNV HOẶC username cũ (Việc 4). Không đổi mật
-- khẩu/tài khoản hiện có -- chỉ thêm 1 đường phân giải identifier -> email
-- trước khi gọi signInWithPassword.

alter table nguoidung add column username text;
create unique index uq_nguoidung_username on nguoidung (username);

-- Backfill tài khoản hiện có: username suy ra từ local-part của email hiện
-- tại (đúng quy ước usernameToEmail() phía app: "${username}@pvcfc.internal").
update nguoidung n
set username = split_part(u.email, '@', 1)
from auth.users u
where u.id = n.id and n.username is null;

-- Ngoại lệ CÓ CHỦ ĐÍCH duy nhất trong codebase: RPC này PHẢI gọi được
-- TRƯỚC khi đăng nhập (chưa có phiên xác thực), nên grant cho `anon` thay
-- vì `authenticated` như mọi RPC khác. Chỉ đọc (stable), không có side
-- effect, không trả về gì ngoài 1 email -- không tiết lộ tài khoản có tồn
-- tại hay không (luôn trả về 1 email hợp lệ cú pháp dù có khớp hay không,
-- để signInWithPassword là nơi DUY NHẤT phát tín hiệu đúng/sai, giống hệt
-- cho cả 2 trường hợp "không có tài khoản" và "sai mật khẩu").
create function resolve_login_email(p_identifier text) returns text
language plpgsql stable security definer
set search_path = public as $$
declare
  v_email text;
begin
  select u.email into v_email
  from nguoidung n
  join auth.users u on u.id = n.id
  where n.msnv = trim(p_identifier) or n.username = lower(trim(p_identifier))
  limit 1;

  if v_email is null then
    return trim(p_identifier) || '@pvcfc.internal.invalid';
  end if;

  return v_email;
end;
$$;

grant execute on function resolve_login_email(text) to anon;
