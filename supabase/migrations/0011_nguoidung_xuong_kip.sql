-- Thêm Xưởng/Nhóm (kip) trên chính tài khoản người dùng -- nền tảng cho:
-- (1) bộ lọc /checksheet và /admin/equipment tự mặc định theo hồ sơ đăng
--     nhập, (2) phạm vi duyệt đề xuất công việc giới hạn theo Nhóm (xem
--     migration sau, 0013_de_xuat_congviec.sql).
-- Nullable, không backfill bắt buộc: admin điền dần qua /admin/users.
alter table nguoidung add column xuong text;
alter table nguoidung add column kip text;
