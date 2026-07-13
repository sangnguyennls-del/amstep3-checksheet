-- Fix bug sót từ 0013: bảng de_xuat_congviec được tạo kèm RLS policy SELECT
-- nhưng THIẾU GRANT cấp bảng (quy ước repo là grant tường minh từng bảng,
-- xem 0004_grants.sql -- "all tables" trong 0004 chỉ áp cho bảng đã tồn tại
-- lúc đó). Hậu quả trên DB migrate mới: /admin/de-xuat lỗi 42501
-- "permission denied for table de_xuat_congviec", badge "Chờ duyệt" trên
-- checksheet âm thầm không hiện (client nuốt lỗi).
--
-- Chỉ cần SELECT cho authenticated: mọi ghi (tạo/duyệt/từ chối đề xuất) đều
-- đi qua RPC security definer (propose_congviec_change /
-- resolve_de_xuat_congviec), đúng thiết kế "không có insert/update policy
-- trực tiếp" của 0013.
grant select on de_xuat_congviec to authenticated;
grant select, insert, update, delete on de_xuat_congviec to service_role;
