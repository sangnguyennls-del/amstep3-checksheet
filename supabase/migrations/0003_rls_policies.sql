-- Pha 1: Row Level Security -- nguồn chân lý duy nhất cho phân quyền, thay
-- cho logic bị lặp lại (và có thể lệch) giữa client/server của hệ Apps
-- Script cũ. Đường ghi chính cho THUC_HIEN/BAT_THUONG là các RPC
-- SECURITY DEFINER ở 0002 (bỏ qua RLS theo quyền owner) -- policy ở đây là
-- lớp phòng thủ thứ 2 chặn ghi trực tiếp qua PostgREST không qua RPC.

alter table cai_dat enable row level security;
alter table nguoidung enable row level security;
alter table thietbi enable row level security;
alter table chitiet enable row level security;
alter table congviec enable row level security;
alter table thuc_hien enable row level security;
alter table bat_thuong enable row level security;
alter table audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- CAI_DAT
-- ---------------------------------------------------------------------------
create policy cai_dat_select on cai_dat
  for select to authenticated
  using (true);

create policy cai_dat_write on cai_dat
  for all to authenticated
  using (current_role_is_admin())
  with check (current_role_is_admin());

-- ---------------------------------------------------------------------------
-- NGUOIDUNG
-- Quy tắc 5: chỉ AdminM cấp/giữ role adminm -- enforce chính ở trigger
-- fn_guard_vai_tro_change (0002); policy ở đây chỉ định ai được đọc/ghi hàng.
-- ---------------------------------------------------------------------------
create policy nguoidung_select on nguoidung
  for select to authenticated
  using (auth.uid() = id or current_role_is_admin());

create policy nguoidung_update on nguoidung
  for update to authenticated
  using (auth.uid() = id or current_role_is_admin())
  with check (auth.uid() = id or current_role_is_admin());

create policy nguoidung_insert on nguoidung
  for insert to authenticated
  with check (current_role_is_admin());

create policy nguoidung_delete on nguoidung
  for delete to authenticated
  using (current_role_is_admin());

-- ---------------------------------------------------------------------------
-- THIETBI / CHITIET / CONGVIEC
-- Đọc mở cho mọi người dùng đã đăng nhập (giữ đúng hành vi getConfig cũ --
-- ai cũng lọc/xem được toàn bộ danh sách thiết bị, chỉ GHI mới bị chặn),
-- ghi chỉ Admin/AdminM.
-- ---------------------------------------------------------------------------
create policy thietbi_select on thietbi
  for select to authenticated using (true);
create policy thietbi_write on thietbi
  for all to authenticated
  using (current_role_is_admin()) with check (current_role_is_admin());

create policy chitiet_select on chitiet
  for select to authenticated using (true);
create policy chitiet_write on chitiet
  for all to authenticated
  using (current_role_is_admin()) with check (current_role_is_admin());

create policy congviec_select on congviec
  for select to authenticated using (true);
create policy congviec_write on congviec
  for all to authenticated
  using (current_role_is_admin()) with check (current_role_is_admin());

-- ---------------------------------------------------------------------------
-- THUC_HIEN
-- SELECT mở (giữ đúng hành vi getData cũ). INSERT/UPDATE là lớp phòng thủ
-- thứ 2 sau RPC upsert_thuc_hien/set_ket_qua_r_with_bat_thuong -- không cho
-- phép set ket_qua='R' trực tiếp qua đường này (chỉ RPC gộp mới được, vì
-- RPC chạy dưới quyền owner nên không bị chặn bởi policy này).
-- DELETE: không cho phép (không có policy delete = mặc định từ chối).
-- ---------------------------------------------------------------------------
create policy thuc_hien_select on thuc_hien
  for select to authenticated using (true);

create policy thuc_hien_insert on thuc_hien
  for insert to authenticated
  with check (
    ket_qua <> 'R'
    and (can_edit_plan(congviec_id, ngay) or can_edit_act_base(congviec_id, ngay))
  );

create policy thuc_hien_update on thuc_hien
  for update to authenticated
  using (can_edit_plan(congviec_id, ngay) or can_edit_act_base(congviec_id, ngay))
  with check (
    ket_qua <> 'R'
    and (can_edit_plan(congviec_id, ngay) or can_edit_act_base(congviec_id, ngay))
  );

-- ---------------------------------------------------------------------------
-- BAT_THUONG
-- SELECT mở (cần xem tooltip/lịch sử bất thường của thiết bị bất kỳ).
-- INSERT trực tiếp (ngoài RPC) vẫn phải qua can_edit_act_base + trigger đã
-- chặn nếu THUC_HIEN cha không phải 'R'. UPDATE chỉ Admin/AdminM (trang quản
-- lý bất thường), không ai được DELETE (giữ lịch sử theo mục E CLAUDE.md).
-- ---------------------------------------------------------------------------
create policy bat_thuong_select on bat_thuong
  for select to authenticated using (true);

create policy bat_thuong_insert on bat_thuong
  for insert to authenticated
  with check (
    exists (
      select 1 from thuc_hien th
      where th.id = thuchien_id
        and can_edit_act_base(th.congviec_id, th.ngay)
    )
  );

create policy bat_thuong_update on bat_thuong
  for update to authenticated
  using (current_role_is_admin())
  with check (current_role_is_admin());

-- ---------------------------------------------------------------------------
-- AUDIT_LOG
-- Chỉ Admin/AdminM đọc được; không ai ghi trực tiếp (trigger SECURITY
-- DEFINER ở Pha 8 tự bỏ qua RLS khi ghi).
-- ---------------------------------------------------------------------------
create policy audit_log_select on audit_log
  for select to authenticated
  using (current_role_is_admin());
