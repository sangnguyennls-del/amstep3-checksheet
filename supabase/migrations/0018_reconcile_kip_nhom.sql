-- Vòng 2 (docs/QUYET-DINH.md 2026-07-14): Kíp và Nhóm nhỏ cùng một khái niệm
-- (Kíp 1 = Nhóm 1 ...). Giao diện từ nay chỉ hiển thị/nhập "Nhóm nhỏ" (`nhom`),
-- action tự suy `kip = 'Kíp ' || nhom` khi lưu. Migration này đồng bộ dữ liệu
-- hiện có cho 2 cột luôn khớp nhau.
--
-- `kip` là dữ liệu gốc thật ("Kíp 1".."Kíp 4", có từ đầu), `nhom` mới thêm ở
-- 0014/0015 (backfill có thể lệch) -> lấy KÍP làm chuẩn: nhom = phần số trong
-- kip. Với dòng chỉ có nhom (kip null) thì suy ngược kip = 'Kíp ' || nhom.
-- Giữ nguyên cột `kip` trong schema (RLS/duyệt đề xuất `can_approve_congviec_change`
-- + lịch ca pha 2 vẫn dùng).

-- THIETBI: kíp -> nhóm (kip là chuẩn)
update thietbi
set nhom = substring(kip from '\d+')
where kip ~ '\d';

-- THIETBI: dòng chỉ có nhóm, chưa có kíp -> suy kíp
update thietbi
set kip = 'Kíp ' || nhom
where (kip is null or btrim(kip) = '') and nhom ~ '\d';

-- NGUOIDUNG: tương tự
update nguoidung
set nhom = substring(kip from '\d+')
where kip ~ '\d';

update nguoidung
set kip = 'Kíp ' || nhom
where (kip is null or btrim(kip) = '') and nhom ~ '\d';
