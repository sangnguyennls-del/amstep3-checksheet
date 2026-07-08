-- Tách bạch Kíp (đơn vị, "Kíp 1".."Kíp 4" -- dữ liệu thật đã có sẵn trên
-- thietbi.kip từ trước) và Nhóm nhỏ (số "1".."4" -- khái niệm MỚI, chưa
-- từng có cột nào lưu). Đợt trước đã NHẦM đổi nhãn UI "Kíp"→"Nhóm" trong
-- khi cột kip vẫn đang lưu đúng dữ liệu Kíp thật -- migration này KHÔNG
-- đụng gì tới cột kip hiện có (vẫn giữ nguyên nghĩa Kíp, RPC
-- can_approve_congviec_change ở 0013 vẫn đúng, không cần đổi), chỉ thêm
-- cột nhom hoàn toàn mới.
alter table thietbi add column nhom text;
alter table nguoidung add column nhom text;

-- Sửa dữ liệu đã lỡ nhập sai do hướng dẫn nhầm ở đợt trước: giá trị "Nhóm
-- N" đang nằm lộn trong nguoidung.kip hoặc nguoidung.don_vi (lẽ ra phải ở
-- cột nhom mới) -- chuyển đúng chỗ, xoá khỏi chỗ sai.
update nguoidung set nhom = substring(kip from '\d+'), kip = null
  where kip ~* '^Nhóm\s*\d+$';
update nguoidung set nhom = coalesce(nhom, substring(don_vi from '\d+')), don_vi = null
  where don_vi ~* '^Nhóm\s*\d+$';
