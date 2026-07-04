-- Pha 7 (Task 1): 2 bảng phục vụ import dữ liệu lịch sử từ Google Sheet cũ.
-- Xem docs/plans/pha7-data-migration.md để biết bối cảnh đầy đủ.

-- Sao chép nguyên trạng sheet "Logs" cũ (audit tóm tắt) để tham khảo lịch sử,
-- KHÔNG dùng làm audit trail chính thức (đó là AUDIT_LOG ở Pha 8).
create table legacy_logs_import (
  id bigint generated always as identity primary key,
  thoi_gian text,        -- giữ nguyên chuỗi gốc "DD/MM/YYYY HH:MM:SS", không ép kiểu (dữ liệu tĩnh, không cần query theo ngày)
  nguoi_chinh_sua text,
  tai_khoan text,
  thang_du_lieu text,
  thiet_bi_tac_dong text,
  imported_at timestamptz not null default now()
);
alter table legacy_logs_import enable row level security;
create policy legacy_logs_import_select on legacy_logs_import
  for select to authenticated using (current_role_is_admin());
grant select on legacy_logs_import to authenticated;
grant select, insert, delete on legacy_logs_import to service_role;

-- Các dòng Data cũ KHÔNG match được vào CONGVIEC nào (không tìm thấy tổ hợp
-- thiết bị+nội dung+điều kiện+loại tương ứng) -- ghi lại để admin rà soát thủ
-- công thay vì bỏ âm thầm (mục G CLAUDE.md).
create table legacy_orphan_thuc_hien (
  id bigint generated always as identity primary key,
  thiet_bi text,
  ten_chi_tiet text,
  dieu_kien_co_ban text,
  loai_hoat_dong text,
  thang_nam text,
  ngay date,
  gia_tri_o text,      -- "Y|G" nguyên gốc
  legacy_row_id text,
  ly_do text,          -- vd "Không tìm thấy CONGVIEC khớp", "Nhiều hơn 1 CONGVIEC khớp"
  imported_at timestamptz not null default now()
);
alter table legacy_orphan_thuc_hien enable row level security;
create policy legacy_orphan_thuc_hien_select on legacy_orphan_thuc_hien
  for select to authenticated using (current_role_is_admin());
grant select on legacy_orphan_thuc_hien to authenticated;
grant select, insert, delete on legacy_orphan_thuc_hien to service_role;
