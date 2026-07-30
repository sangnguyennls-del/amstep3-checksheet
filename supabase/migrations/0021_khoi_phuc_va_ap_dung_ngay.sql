-- Đợt 4:
--  * #2 KHÔI PHỤC hạng mục đã loại bỏ (hiện lại từ tháng sau) -- luồng đề xuất
--    'khoi_phuc' song song 'sua'/'loai_bo'/'them'.
--  * #6 Nút "ÁP DỤNG NGAY THÁNG HIỆN TẠI" (đặc quyền admin) cho thêm/sửa/loại
--    bỏ -- thêm tham số p_ap_dung_ngay: true+admin => hiệu lực từ ĐẦU THÁNG
--    HIỆN TẠI thay vì đầu tháng sau. CỐ Ý ghi đè bất biến 0016 "không rewrite
--    tháng đã bắt đầu" theo yêu cầu người dùng (cuối tháng cần đổi ngay).
--
-- Vì phải thêm tham số vào các hàm sẵn có (đổi chữ ký) -> DROP rồi CREATE lại
-- (create or replace không đổi được danh sách tham số). Late binding của
-- plpgsql cho phép drop/create theo thứ tự bất kỳ. Nhớ bài học hosted Supabase:
-- hàm public MỚI tự được cấp EXECUTE cho anon/authenticated -> mọi hàm NỘI BỘ
-- phải revoke tường minh from anon, authenticated (không chỉ public).

-- ---------------------------------------------------------------------------
-- (0) Nới CHECK loai_de_xuat cho 'khoi_phuc' (cấu trúc như 'loai_bo':
-- congviec_id not null, các cột 'them' null -> nhánh else của chk_de_xuat_loai
-- 0019 đã bao). Ràng buộc cũ do 0019 đặt lại, bỏ theo tên rồi thêm lại.
-- ---------------------------------------------------------------------------
alter table de_xuat_congviec drop constraint de_xuat_congviec_loai_de_xuat_check;
alter table de_xuat_congviec add constraint de_xuat_congviec_loai_de_xuat_check
  check (loai_de_xuat in ('sua', 'loai_bo', 'them', 'khoi_phuc'));

-- ---------------------------------------------------------------------------
-- (1) DROP các hàm sẽ đổi chữ ký (thêm p_ap_dung_ngay) + resolve.
-- ---------------------------------------------------------------------------
drop function update_congviec_with_reason(text, numeric, text, numeric, text);
drop function remove_congviec_with_reason(text, text);
drop function propose_congviec_change(text, text, numeric, text, numeric, text);
drop function create_hang_muc_moi(uuid, text, text, text, int, text, numeric, text, numeric, text);
drop function propose_them_hang_muc(uuid, text, text, text, int, text, numeric, text, numeric, text);
drop function resolve_de_xuat_congviec(uuid, text, text);

-- ---------------------------------------------------------------------------
-- (2) restore_congviec_with_reason: mở lại cửa sổ hiệu lực của 1 công việc đã
-- loại bỏ (hieu_luc_den đóng ở cuối tháng, thay_the_boi null). HÀM NỘI BỘ.
-- Chỉ nhận dòng CÒN hiển thị tới ít nhất tháng này (trạng thái "loại bỏ từ
-- tháng sau") -> clear hieu_luc_den = hiện liên tục, KHÔNG tạo khe hở. Dòng đã
-- tắt hẳn ở quá khứ (có khe) phải khôi phục ở /admin/equipment để tránh vô
-- tình hiện lại các tháng ở giữa.
-- ---------------------------------------------------------------------------
create function restore_congviec_with_reason(
  p_congviec_id text,
  p_ly_do text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_old congviec;
  v_new congviec;
  v_month_start date := date_trunc('month', today_vn())::date;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do khôi phục là bắt buộc';
  end if;
  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền khôi phục công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  v_id := latest_congviec_version(p_congviec_id);
  select * into v_old from congviec where id = v_id for update;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;
  if v_old.thay_the_boi is not null then
    raise exception 'Công việc này đã có phiên bản kế nhiệm (do sửa), không ở trạng thái bị loại bỏ';
  end if;
  if v_old.active and v_old.hieu_luc_den is null then
    raise exception 'Công việc này đang hiệu lực, không cần khôi phục';
  end if;
  if v_old.hieu_luc_den is not null and v_old.hieu_luc_den < v_month_start then
    raise exception 'Công việc đã ngừng hiển thị từ trước tháng này -- hãy khôi phục ở trang Quản lý thiết bị (đặt lại Hiệu lực đến)';
  end if;

  update congviec
    set active = true,
        hieu_luc_den = null,
        ngay_loai_bo = null
    where id = v_id
    returning * into v_new;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);

  return to_jsonb(v_new) || jsonb_build_object('khoi_phuc', true);
end;
$$;

revoke execute on function restore_congviec_with_reason(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (3) update_congviec_with_reason (+ p_ap_dung_ngay). Thân giữ NGUYÊN logic
-- version-hoá 0016, chỉ đổi cách tính v_effect. HÀM NỘI BỘ.
-- ---------------------------------------------------------------------------
create function update_congviec_with_reason(
  p_congviec_id text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text,
  p_ap_dung_ngay boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_id text;
  v_old congviec;
  v_new congviec;
  v_succ congviec;
  -- Apply-now (admin): hiệu lực từ đầu THÁNG NÀY; mặc định: đầu tháng sau.
  v_effect date := case
    when p_ap_dung_ngay and current_role_is_admin() then date_trunc('month', today_vn())::date
    else (date_trunc('month', today_vn()) + interval '1 month')::date
  end;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do thay đổi là bắt buộc';
  end if;

  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền sửa công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  v_id := latest_congviec_version(p_congviec_id);
  select * into v_old from congviec where id = v_id for update;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;
  if not v_old.active or (v_old.hieu_luc_den is not null and v_old.hieu_luc_den < v_effect) then
    raise exception 'Công việc % đã bị loại bỏ/hết hiệu lực -- không thể sửa (Admin có thể khôi phục ở Quản lý thiết bị)', v_id;
  end if;

  if v_old.hieu_luc_tu is not null and v_old.hieu_luc_tu >= v_effect then
    update congviec
      set thoi_gian = p_thoi_gian,
          tan_suat_chu = p_tan_suat_chu,
          tan_suat_so = p_tan_suat_so
      where id = v_id
      returning * into v_new;

    insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
    values ('congviec', v_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);

    return jsonb_build_object(
      'version', 'in_place', 'congviec_id', v_id,
      'hieu_luc_tu', v_new.hieu_luc_tu, 'result', to_jsonb(v_new)
    );
  end if;

  insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu, hieu_luc_den)
  values (v_old.chitiet_id, v_old.loai_hoat_dong, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, true, v_effect, v_old.hieu_luc_den)
  returning * into v_succ;

  update congviec
    set hieu_luc_den = v_effect - 1,
        thay_the_boi = v_succ.id
    where id = v_id
    returning * into v_new;

  update thuc_hien th
    set congviec_id = v_succ.id
    where th.congviec_id = v_id
      and th.ngay >= v_effect
      and not exists (
        select 1 from thuc_hien x where x.congviec_id = v_succ.id and x.ngay = th.ngay
      );
  delete from thuc_hien th
    where th.congviec_id = v_id
      and th.ngay >= v_effect
      and not exists (select 1 from bat_thuong bt where bt.thuchien_id = th.id);

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);
  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_succ.id, 'INSERT', null, to_jsonb(v_succ), current_msnv(), p_ly_do);

  return jsonb_build_object(
    'version', 'superseded', 'congviec_id', v_succ.id, 'old_id', v_id,
    'hieu_luc_tu', v_effect, 'result', to_jsonb(v_succ)
  );
end;
$$;

revoke execute on function update_congviec_with_reason(text, numeric, text, numeric, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (4) remove_congviec_with_reason (+ p_ap_dung_ngay). HÀM NỘI BỘ.
-- ---------------------------------------------------------------------------
create function remove_congviec_with_reason(
  p_congviec_id text,
  p_ly_do text,
  p_ap_dung_ngay boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_id text;
  v_old congviec;
  v_new congviec;
  v_effect date := case
    when p_ap_dung_ngay and current_role_is_admin() then date_trunc('month', today_vn())::date
    else (date_trunc('month', today_vn()) + interval '1 month')::date
  end;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do loại bỏ là bắt buộc';
  end if;

  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền loại bỏ công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  v_id := latest_congviec_version(p_congviec_id);
  select * into v_old from congviec where id = v_id for update;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;
  if not v_old.active or (v_old.hieu_luc_den is not null and v_old.hieu_luc_den < v_effect) then
    raise exception 'Công việc % đã bị loại bỏ/hết hiệu lực trước đó', v_id;
  end if;

  if v_old.hieu_luc_tu is not null and v_old.hieu_luc_tu >= v_effect then
    update congviec
      set active = false,
          ngay_loai_bo = today_vn()
      where id = v_id
      returning * into v_new;
  else
    update congviec
      set hieu_luc_den = v_effect - 1,
          ngay_loai_bo = today_vn()
      where id = v_id
      returning * into v_new;
  end if;

  delete from thuc_hien th
    where th.congviec_id = v_id
      and th.ngay >= v_effect
      and not exists (select 1 from bat_thuong bt where bt.thuchien_id = th.id);

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);

  return to_jsonb(v_new) || jsonb_build_object('an_tu', v_effect);
end;
$$;

revoke execute on function remove_congviec_with_reason(text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (5) create_hang_muc_moi (+ p_ap_dung_ngay). HÀM NỘI BỘ.
-- ---------------------------------------------------------------------------
create function create_hang_muc_moi(
  p_thietbi_id uuid,
  p_chitiet_id text,
  p_ten_chi_tiet text,
  p_dieu_kien_co_ban text,
  p_stt int,
  p_loai_hoat_dong text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text,
  p_ap_dung_ngay boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_chitiet_id text := p_chitiet_id;
  v_new_ct chitiet;
  v_new_cv congviec;
  v_tb_id uuid;
  v_effect date := case
    when p_ap_dung_ngay and current_role_is_admin() then date_trunc('month', today_vn())::date
    else (date_trunc('month', today_vn()) + interval '1 month')::date
  end;
begin
  if p_loai_hoat_dong is null or trim(p_loai_hoat_dong) = '' then
    raise exception 'Loại hoạt động là bắt buộc';
  end if;

  if v_chitiet_id is null then
    if p_ten_chi_tiet is null or trim(p_ten_chi_tiet) = '' then
      raise exception 'Tên chi tiết là bắt buộc khi thêm chi tiết mới';
    end if;
    insert into chitiet (thietbi_id, stt, ten_chi_tiet, dieu_kien_co_ban)
    values (p_thietbi_id, p_stt, trim(p_ten_chi_tiet), p_dieu_kien_co_ban)
    returning * into v_new_ct;
    v_chitiet_id := v_new_ct.id;
    insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
    values ('chitiet', v_new_ct.id, 'INSERT', null, to_jsonb(v_new_ct), current_msnv(), p_ly_do);
  else
    select thietbi_id into v_tb_id from chitiet where id = v_chitiet_id;
    if v_tb_id is null then
      raise exception 'Không tìm thấy chi tiết %', v_chitiet_id;
    end if;
    if v_tb_id <> p_thietbi_id then
      raise exception 'Chi tiết % không thuộc thiết bị đã chọn', v_chitiet_id;
    end if;
  end if;

  insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu)
  values (v_chitiet_id, trim(p_loai_hoat_dong), p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, true, v_effect)
  returning * into v_new_cv;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_new_cv.id, 'INSERT', null, to_jsonb(v_new_cv), current_msnv(), p_ly_do);

  return jsonb_build_object(
    'chitiet_id', v_chitiet_id,
    'chitiet_moi', (p_chitiet_id is null),
    'congviec_id', v_new_cv.id,
    'hieu_luc_tu', v_effect
  );
end;
$$;

revoke execute on function create_hang_muc_moi(uuid, text, text, text, int, text, numeric, text, numeric, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (6) propose_congviec_change (+ p_ap_dung_ngay, + nhánh 'khoi_phuc').
-- ---------------------------------------------------------------------------
create function propose_congviec_change(
  p_congviec_id text,
  p_loai_de_xuat text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text,
  p_ap_dung_ngay boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_canonical text;
  v_row congviec;
  v_effect date := (date_trunc('month', today_vn()) + interval '1 month')::date;
  v_de_xuat_id uuid;
  v_result jsonb;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do là bắt buộc';
  end if;

  if p_loai_de_xuat not in ('sua', 'loai_bo', 'khoi_phuc') then
    raise exception 'Loại đề xuất không hợp lệ';
  end if;

  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền đề xuất thay đổi công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  v_canonical := latest_congviec_version(p_congviec_id);
  select * into v_row from congviec where id = v_canonical;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;
  -- sua/loai_bo: chặn nếu đã loại bỏ. khoi_phuc: ngược lại (restore RPC tự
  -- kiểm tra đúng trạng thái bị loại bỏ), không chặn ở đây.
  if p_loai_de_xuat in ('sua', 'loai_bo')
     and (not v_row.active or (v_row.hieu_luc_den is not null and v_row.hieu_luc_den < v_effect)) then
    raise exception 'Công việc này đã được loại bỏ/hết hiệu lực -- không thể đề xuất thay đổi';
  end if;

  if current_role_is_admin() then
    if p_loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(v_canonical, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, p_ap_dung_ngay);
    elsif p_loai_de_xuat = 'loai_bo' then
      v_result := remove_congviec_with_reason(v_canonical, p_ly_do, p_ap_dung_ngay);
    else
      v_result := restore_congviec_with_reason(v_canonical, p_ly_do);
    end if;
    return jsonb_build_object('applied', true, 'result', v_result);
  end if;

  begin
    insert into de_xuat_congviec (
      congviec_id, loai_de_xuat, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi, ly_do, nguoi_de_xuat
    ) values (
      v_canonical, p_loai_de_xuat, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, current_msnv()
    ) returning id into v_de_xuat_id;
  exception when unique_violation then
    raise exception 'Công việc này đang có đề xuất chờ duyệt';
  end;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values (
    'de_xuat_congviec', v_de_xuat_id::text, 'INSERT', null,
    jsonb_build_object(
      'congviec_id', v_canonical, 'loai_de_xuat', p_loai_de_xuat,
      'thoi_gian_moi', p_thoi_gian, 'tan_suat_chu_moi', p_tan_suat_chu, 'tan_suat_so_moi', p_tan_suat_so
    ),
    current_msnv(), p_ly_do
  );

  return jsonb_build_object('applied', false, 'de_xuat_id', v_de_xuat_id, 'congviec_id', v_canonical);
end;
$$;

grant execute on function propose_congviec_change(text, text, numeric, text, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- (7) propose_them_hang_muc (+ p_ap_dung_ngay, forward xuống create_hang_muc_moi).
-- ---------------------------------------------------------------------------
create function propose_them_hang_muc(
  p_thietbi_id uuid,
  p_chitiet_id text,
  p_ten_chi_tiet text,
  p_dieu_kien_co_ban text,
  p_stt int,
  p_loai_hoat_dong text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text,
  p_ap_dung_ngay boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_de_xuat_id uuid;
  v_result jsonb;
  v_ten text := nullif(trim(coalesce(p_ten_chi_tiet, '')), '');
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do là bắt buộc';
  end if;
  if p_loai_hoat_dong is null or trim(p_loai_hoat_dong) = '' then
    raise exception 'Loại hoạt động là bắt buộc';
  end if;
  if (p_chitiet_id is null) = (v_ten is null) then
    raise exception 'Phải chọn chi tiết có sẵn HOẶC nhập tên chi tiết mới (đúng một)';
  end if;

  if not can_manage_thietbi(p_thietbi_id) then
    raise exception 'Không có quyền đề xuất thêm hạng mục cho thiết bị này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  if p_chitiet_id is not null
     and not exists (select 1 from chitiet where id = p_chitiet_id and thietbi_id = p_thietbi_id) then
    raise exception 'Chi tiết % không thuộc thiết bị đã chọn', p_chitiet_id;
  end if;

  if current_role_is_admin() then
    v_result := create_hang_muc_moi(p_thietbi_id, p_chitiet_id, v_ten, p_dieu_kien_co_ban,
      p_stt, p_loai_hoat_dong, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, p_ap_dung_ngay);
    return jsonb_build_object('applied', true, 'result', v_result);
  end if;

  begin
    insert into de_xuat_congviec (
      loai_de_xuat, thietbi_id, chitiet_id, ten_chi_tiet_moi, dieu_kien_co_ban_moi, stt_moi,
      loai_hoat_dong_moi, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi, ly_do, nguoi_de_xuat
    ) values (
      'them', p_thietbi_id, p_chitiet_id, v_ten, p_dieu_kien_co_ban, p_stt,
      trim(p_loai_hoat_dong), p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, current_msnv()
    ) returning id into v_de_xuat_id;
  exception when unique_violation then
    raise exception 'Đang có đề xuất thêm công việc này chờ duyệt';
  end;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values (
    'de_xuat_congviec', v_de_xuat_id::text, 'INSERT', null,
    jsonb_build_object('loai_de_xuat', 'them', 'thietbi_id', p_thietbi_id, 'chitiet_id', p_chitiet_id,
      'ten_chi_tiet_moi', v_ten, 'loai_hoat_dong_moi', p_loai_hoat_dong),
    current_msnv(), p_ly_do
  );

  return jsonb_build_object('applied', false, 'de_xuat_id', v_de_xuat_id);
end;
$$;

grant execute on function propose_them_hang_muc(uuid, text, text, text, int, text, numeric, text, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- (8) resolve_de_xuat_congviec (+ p_ap_dung_ngay, + nhánh 'khoi_phuc').
-- ---------------------------------------------------------------------------
create function resolve_de_xuat_congviec(
  p_de_xuat_id uuid,
  p_hanh_dong text,
  p_ly_do_tu_choi text default null,
  p_ap_dung_ngay boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_de_xuat de_xuat_congviec;
  v_result jsonb;
  v_can_approve boolean;
begin
  if p_hanh_dong not in ('duyet', 'tu_choi') then
    raise exception 'Hành động không hợp lệ';
  end if;

  select * into v_de_xuat from de_xuat_congviec where id = p_de_xuat_id for update;
  if not found then
    raise exception 'Không tìm thấy đề xuất %', p_de_xuat_id;
  end if;

  if v_de_xuat.loai_de_xuat = 'them' then
    v_can_approve := can_approve_thietbi_change(v_de_xuat.thietbi_id);
  else
    v_can_approve := can_approve_congviec_change(v_de_xuat.congviec_id);
  end if;
  if not v_can_approve then
    raise exception 'Không có quyền duyệt đề xuất này (khác Nhóm phụ trách hoặc không phải Admin)';
  end if;

  if v_de_xuat.trang_thai <> 'Chờ duyệt' then
    raise exception 'Đề xuất đã được xử lý';
  end if;

  if p_hanh_dong = 'duyet' then
    if v_de_xuat.loai_de_xuat = 'them' then
      v_result := create_hang_muc_moi(
        v_de_xuat.thietbi_id, v_de_xuat.chitiet_id, v_de_xuat.ten_chi_tiet_moi,
        v_de_xuat.dieu_kien_co_ban_moi, v_de_xuat.stt_moi, v_de_xuat.loai_hoat_dong_moi,
        v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi, v_de_xuat.tan_suat_so_moi,
        v_de_xuat.ly_do, p_ap_dung_ngay
      );
    elsif v_de_xuat.loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(
        v_de_xuat.congviec_id, v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi,
        v_de_xuat.tan_suat_so_moi, v_de_xuat.ly_do, p_ap_dung_ngay
      );
    elsif v_de_xuat.loai_de_xuat = 'khoi_phuc' then
      v_result := restore_congviec_with_reason(v_de_xuat.congviec_id, v_de_xuat.ly_do);
    else
      v_result := remove_congviec_with_reason(v_de_xuat.congviec_id, v_de_xuat.ly_do, p_ap_dung_ngay);
    end if;

    update de_xuat_congviec
      set trang_thai = 'Đã duyệt', nguoi_duyet = current_msnv(), updated_at = now()
      where id = p_de_xuat_id;

    insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
    values (
      'de_xuat_congviec', p_de_xuat_id::text, 'UPDATE',
      to_jsonb(v_de_xuat), jsonb_build_object('trang_thai', 'Đã duyệt'), current_msnv(), v_de_xuat.ly_do
    );

    return jsonb_build_object('trang_thai', 'Đã duyệt', 'result', v_result);
  end if;

  if p_ly_do_tu_choi is null or trim(p_ly_do_tu_choi) = '' then
    raise exception 'Lý do từ chối là bắt buộc';
  end if;

  update de_xuat_congviec
    set trang_thai = 'Từ chối', nguoi_duyet = current_msnv(), ly_do_tu_choi = p_ly_do_tu_choi, updated_at = now()
    where id = p_de_xuat_id;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values (
    'de_xuat_congviec', p_de_xuat_id::text, 'UPDATE',
    to_jsonb(v_de_xuat), jsonb_build_object('trang_thai', 'Từ chối', 'ly_do_tu_choi', p_ly_do_tu_choi),
    current_msnv(), p_ly_do_tu_choi
  );

  return jsonb_build_object('trang_thai', 'Từ chối');
end;
$$;

grant execute on function resolve_de_xuat_congviec(uuid, text, text, boolean) to authenticated;
