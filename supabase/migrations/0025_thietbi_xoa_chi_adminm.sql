-- Đợt: siết quyền XOÁ thiết bị + bật audit cho thietbi.
--
-- Bối cảnh: xoá 1 thiết bị kéo theo `on delete cascade` xoá sạch chitiet ->
-- congviec -> thuc_hien (toàn bộ lịch sử chấm công). Trước đây policy
-- `thietbi_write` (0003) cho phép cả `admin` thường DELETE, và bảng thietbi
-- KHÔNG có audit trigger -> một admin lỡ/cố xoá thiết bị là mất trắng lịch sử
-- mà không để lại dấu vết trực tiếp (đã xảy ra trên prod: 3 thiết bị S06109/
-- S06116/S06117 bị admin xoá, phải dựng lại từ backup + audit thuc_hien).
--
-- Sửa gốc ở tầng RLS (lằn ranh #9: đổi quyền phải ở RLS, không chỉ client):
--   * INSERT/UPDATE: giữ cho Admin (admin cần sửa/nhập thiết bị hằng ngày).
--   * DELETE: chỉ AdminM (thao tác hiếm, phá huỷ diện rộng).
-- Và bật audit trigger để MỌI thêm/sửa/xoá thiết bị đều truy được về sau.

-- 1) Thay policy `for all` bằng các policy tách theo lệnh.
drop policy thietbi_write on thietbi;

create policy thietbi_insert on thietbi
  for insert to authenticated
  with check (current_role_is_admin());

create policy thietbi_update on thietbi
  for update to authenticated
  using (current_role_is_admin())
  with check (current_role_is_admin());

create policy thietbi_delete on thietbi
  for delete to authenticated
  using (current_role_is_adminm());

-- 2) Audit trigger cho thietbi (tái dùng fn_audit_log_change từ 0009 — cùng
--    cơ chế đang dùng cho thuc_hien/bat_thuong). Nhờ gia_tri_cu = to_jsonb(old)
--    lúc DELETE, một thiết bị bị xoá vẫn khôi phục lại được từ audit_log.
create trigger trg_audit_thietbi
  after insert or update or delete on thietbi
  for each row execute function fn_audit_log_change();
