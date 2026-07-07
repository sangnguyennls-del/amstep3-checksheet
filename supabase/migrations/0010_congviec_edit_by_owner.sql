-- Cho phép người phụ trách thiết bị (không chỉ Admin/AdminM) tự sửa
-- thoi_gian/tan_suat_chu/tan_suat_so hoặc loại bỏ mềm 1 CONGVIEC ngay trên
-- /checksheet, kèm lý do bắt buộc để truy vết -- yêu cầu bắt buộc của AM
-- Step 3 (xem CLAUDE.md mục C: đo giờ tiết kiệm bằng cách loại bỏ hạng mục
-- không cần thiết). RLS `congviec_write` (0003) vẫn giữ nguyên chỉ cho
-- Admin/AdminM ghi trực tiếp lên bảng -- 2 RPC security definer dưới đây là
-- đường duy nhất để user thường thực hiện đúng 2 thao tác này, đúng pattern
-- đã dùng cho upsert_thuc_hien/set_ket_qua_r_with_bat_thuong (0002).

alter table audit_log add column ly_do text;

-- ---------------------------------------------------------------------------
-- Admin/AdminM HOẶC người phụ trách thiết bị chứa CONGVIEC này -- không xét
-- cai_dat_bool('ENABLE_DEVICE_LOCK') như can_edit_plan/can_edit_act (đây là
-- quyền sửa thoi_gian/tan_suat/loại bỏ, khác với quyền tick Plan/Actual hàng
-- ngày, nên không dùng chung cờ bật/tắt khoá thiết bị).
-- ---------------------------------------------------------------------------
create function can_manage_congviec(p_congviec_id text) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_nguoi_phu_trach text;
begin
  if current_role_is_admin() then
    return true;
  end if;

  select t.nguoi_phu_trach into v_nguoi_phu_trach
  from congviec cv
  join chitiet ct on ct.id = cv.chitiet_id
  join thietbi t on t.id = ct.thietbi_id
  where cv.id = p_congviec_id;

  return v_nguoi_phu_trach is not null and v_nguoi_phu_trach = current_msnv();
end;
$$;

grant execute on function can_manage_congviec(text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_congviec_with_reason: CHỈ đổi 3 cột thoi_gian/tan_suat_chu/
-- tan_suat_so (không đụng loai_hoat_dong/active/hieu_luc_* -- các trường đó
-- vẫn là việc của Admin qua /admin/equipment). Lý do bắt buộc, ghi vào
-- audit_log cùng transaction.
-- ---------------------------------------------------------------------------
create function update_congviec_with_reason(
  p_congviec_id text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_old congviec;
  v_new congviec;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do thay đổi là bắt buộc';
  end if;

  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền sửa công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  select * into v_old from congviec where id = p_congviec_id;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;

  update congviec
    set thoi_gian = p_thoi_gian,
        tan_suat_chu = p_tan_suat_chu,
        tan_suat_so = p_tan_suat_so
    where id = p_congviec_id
    returning * into v_new;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', p_congviec_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);

  return to_jsonb(v_new);
end;
$$;

grant execute on function update_congviec_with_reason(text, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_congviec_with_reason: loại bỏ MỀM (active=false + ngay_loai_bo),
-- KHÔNG xoá cứng -- đúng cơ chế "loại bỏ dần" đã thiết kế sẵn (CLAUDE.md mục
-- C), giữ lịch sử để đo giờ tiết kiệm được. Lý do bắt buộc, ghi audit_log.
-- ---------------------------------------------------------------------------
create function remove_congviec_with_reason(
  p_congviec_id text,
  p_ly_do text
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_old congviec;
  v_new congviec;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do loại bỏ là bắt buộc';
  end if;

  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền loại bỏ công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  select * into v_old from congviec where id = p_congviec_id;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;

  update congviec
    set active = false,
        ngay_loai_bo = today_vn()
    where id = p_congviec_id
    returning * into v_new;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', p_congviec_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);

  return to_jsonb(v_new);
end;
$$;

grant execute on function remove_congviec_with_reason(text, text) to authenticated;
