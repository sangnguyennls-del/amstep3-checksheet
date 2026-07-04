-- Pha 7 (Task 2) — phát hiện khi migrate dữ liệu thật: cột chitiet.stt (số
-- đánh dấu trên sơ đồ hình ảnh thiết bị, chỉ để hiển thị, xem 0001_schema.sql)
-- được khai báo `int` nhưng dữ liệu Config thật có 4 dòng dùng số thập phân
-- có ý nghĩa để đánh dấu điểm phụ trên sơ đồ (vd "1.2", "10.11" — không phải
-- lỗi gõ, giữ nguyên để hiển thị đúng phiếu in). Đổi sang `numeric` để không
-- mất thông tin hiển thị này.
alter table chitiet alter column stt type numeric using stt::numeric;
