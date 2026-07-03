-- Pha 1 (bổ sung): GRANT cấp bảng cho role `authenticated`.
-- Postgres/Supabase yêu cầu 2 lớp độc lập: GRANT (có được thao tác trên
-- bảng không) và RLS policy (được thao tác trên NHỮNG DÒNG nào) -- thiếu
-- GRANT thì dù policy cho phép vẫn bị chặn ở lớp trước với lỗi
-- "permission denied for table ...".
--
-- Đồng thời chuyển 2 hàm sinh mã ổn định (next_chitiet_id/next_congviec_id)
-- sang SECURITY DEFINER: khi INSERT vào CHITIET/CONGVIEC do role
-- `authenticated` thực hiện, default expression gọi các hàm này để lấy
-- nextval() -- nếu không phải SECURITY DEFINER, nextval() sẽ chạy dưới
-- quyền `authenticated` và bị từ chối vì role đó không sở hữu sequence.

alter function next_chitiet_id() security definer set search_path = public;
alter function next_congviec_id() security definer set search_path = public;

grant select, insert, update, delete on cai_dat to authenticated;
grant select, insert, update, delete on nguoidung to authenticated;
grant select, insert, update, delete on thietbi to authenticated;
grant select, insert, update, delete on chitiet to authenticated;
grant select, insert, update, delete on congviec to authenticated;
grant select, insert, update on thuc_hien to authenticated;
grant select, insert, update on bat_thuong to authenticated;
grant select on audit_log to authenticated;

-- service_role có thuộc tính BYPASSRLS nhưng vẫn cần GRANT bảng riêng --
-- BYPASSRLS chỉ bỏ qua kiểm tra policy, không thay thế hệ thống GRANT của
-- Postgres. Dùng cho Server Action phía admin (tạo user, seed dữ liệu...).
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
