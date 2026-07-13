-- Fix mục 3 (lọc thiết bị ra rỗng): migration 0014 thêm cột thietbi.nhom
-- nhưng chỉ đổ dữ liệu phía nguoidung -> thietbi.nhom NULL toàn bộ, trong khi
-- bộ lọc /admin/equipment và /checksheet mặc định theo nguoidung.nhom của
-- người đăng nhập => so sánh null = '1' loại sạch danh sách.
--
-- Quyết định 2026-07-13 (docs/QUYET-DINH.md): thiết bị lấy Nhóm nhỏ theo nhóm
-- của nhân viên đang đứng tên phụ trách. Chỉ đổ cho dòng đang NULL -- admin
-- đã nhập tay (nếu có) không bị ghi đè; thiết bị chưa gán người phụ trách
-- hoặc người phụ trách chưa có nhóm thì giữ NULL, admin bổ sung qua form.
update thietbi t
set nhom = n.nhom
from nguoidung n
where n.msnv = t.nguoi_phu_trach
  and t.nhom is null
  and n.nhom is not null;
