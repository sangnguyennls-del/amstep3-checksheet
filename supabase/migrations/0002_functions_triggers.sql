-- Pha 1: Các hàm/trigger triển khai đúng quy tắc nghiệp vụ đã trích xuất từ
-- Code.js/Javascript.html (xem plan). Đây là NGUỒN CHÂN LÝ DUY NHẤT, dùng
-- chung bởi cả RLS policy (0003) lẫn RPC mà UI gọi trực tiếp -- khác với hệ
-- cũ vốn cài đặt logic này lặp lại (và có thể lệch) ở cả client và server.

-- ---------------------------------------------------------------------------
-- Helpers xác định người dùng hiện tại
-- ---------------------------------------------------------------------------
create function current_msnv() returns text
language sql stable security definer
set search_path = public as $$
  select msnv from nguoidung where id = auth.uid();
$$;

create function current_role_is_admin() returns boolean
language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select vai_tro in ('admin', 'adminm') from nguoidung where id = auth.uid()),
    false
  );
$$;

create function current_role_is_adminm() returns boolean
language sql stable security definer
set search_path = public as $$
  select coalesce(
    (select vai_tro = 'adminm' from nguoidung where id = auth.uid()),
    false
  );
$$;

create function cai_dat_bool(p_key text) returns boolean
language sql stable security definer
set search_path = public as $$
  -- Đúng ngữ nghĩa hệ cũ: mặc định bật, chỉ literal 'false' mới tắt.
  select coalesce((select value <> 'false' from cai_dat where key = p_key), true);
$$;

create function today_vn() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

-- ---------------------------------------------------------------------------
-- Quy tắc 2: quyền sửa Plan theo diff tháng + khoá thiết bị + lock date.
-- Quy tắc 5 (đóng lỗ hổng): không có ràng buộc role ở đây, việc cấp quyền
-- ghi lên bảng do RLS ở 0003 đảm nhiệm; hàm này chỉ trả lời "có được sửa
-- Plan cho CONGVIEC này vào ngày này không".
-- ---------------------------------------------------------------------------
create function can_edit_plan(p_congviec_id text, p_target_date date) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_nguoi_phu_trach text;
  v_is_my_device boolean;
  v_diff int;
  v_today date := today_vn();
begin
  if current_role_is_admin() then
    return true;
  end if;

  select t.nguoi_phu_trach into v_nguoi_phu_trach
  from congviec cv
  join chitiet ct on ct.id = cv.chitiet_id
  join thietbi t on t.id = ct.thietbi_id
  where cv.id = p_congviec_id;

  v_is_my_device := (not cai_dat_bool('ENABLE_DEVICE_LOCK'))
    or (v_nguoi_phu_trach = current_msnv());

  if not v_is_my_device then
    return false;
  end if;

  v_diff := (extract(year from p_target_date)::int - extract(year from v_today)::int) * 12
    + (extract(month from p_target_date)::int - extract(month from v_today)::int);

  if v_diff > 0 then
    return true;
  elsif v_diff = 0 then
    return (not cai_dat_bool('ENABLE_LOCK_DATE'))
      or extract(day from v_today)::int <= coalesce((select value::int from cai_dat where key = 'LOCK_DATE'), 5);
  else
    return false; -- Plan không bao giờ sửa được cho tháng đã qua.
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quy tắc 2 (nhánh Actual, chỉ xét diff/lock date, CHƯA áp cửa sổ ±4 ngày).
-- Tách riêng để get_editability() dùng cho gợi ý UI mà không cần biết giá
-- trị cũ/mới của từng ô (điều mà mức UI/row chưa có).
-- ---------------------------------------------------------------------------
create function can_edit_act_base(p_congviec_id text, p_target_date date) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_nguoi_phu_trach text;
  v_is_my_device boolean;
  v_diff int;
  v_today date := today_vn();
begin
  if current_role_is_admin() then
    return true;
  end if;

  select t.nguoi_phu_trach into v_nguoi_phu_trach
  from congviec cv
  join chitiet ct on ct.id = cv.chitiet_id
  join thietbi t on t.id = ct.thietbi_id
  where cv.id = p_congviec_id;

  v_is_my_device := (not cai_dat_bool('ENABLE_DEVICE_LOCK'))
    or (v_nguoi_phu_trach = current_msnv());

  if not v_is_my_device then
    return false;
  end if;

  v_diff := (extract(year from p_target_date)::int - extract(year from v_today)::int) * 12
    + (extract(month from p_target_date)::int - extract(month from v_today)::int);

  if v_diff = 0 then
    return true;
  elsif v_diff = -1 then
    return (not cai_dat_bool('ENABLE_LOCK_DATE'))
      or extract(day from v_today)::int <= coalesce((select value::int from cai_dat where key = 'LOCK_DATE'), 5);
  else
    return false;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quy tắc 3: cửa sổ ±4 ngày cho Actual, cộng thêm vào can_edit_act_base.
-- Bỏ qua cửa sổ nếu admin, giá trị không đổi, hoặc ENABLE_TIME_LIMIT tắt --
-- đúng ngữ nghĩa hệ cũ (silently keep old value nếu vi phạm, xử lý ở RPC
-- upsert_thuc_hien, không phải ở đây).
-- ---------------------------------------------------------------------------
create function can_edit_act(
  p_congviec_id text,
  p_target_date date,
  p_old_act text,
  p_new_act text
) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_diff_days int;
begin
  if not can_edit_act_base(p_congviec_id, p_target_date) then
    return false;
  end if;

  if current_role_is_admin()
    or p_old_act = p_new_act
    or not cai_dat_bool('ENABLE_TIME_LIMIT') then
    return true;
  end if;

  v_diff_days := p_target_date - today_vn();
  return v_diff_days between -4 and 4;
end;
$$;

grant execute on function can_edit_plan(text, date) to authenticated;
grant execute on function can_edit_act_base(text, date) to authenticated;
grant execute on function can_edit_act(text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_editability: batch 1 lần cho cả lưới đang xem thay vì tính lại ở
-- client (điểm mấu chốt để hết trùng lặp logic client/server của hệ cũ).
-- Chỉ trả về gate ở mức diff/lock-date (không áp cửa sổ ±4 ngày -- đó là
-- toán ngày thuần tuý, không nhạy cảm, client tự tính để tô UI, quyền quyết
-- định thật vẫn nằm ở can_edit_act khi gọi upsert_thuc_hien).
-- ---------------------------------------------------------------------------
create function get_editability(p_congviec_ids text[], p_target_month date)
returns table (congviec_id text, is_plan_editable boolean, is_act_editable boolean)
language sql stable security definer
set search_path = public as $$
  select
    cv_id,
    can_edit_plan(cv_id, p_target_month),
    can_edit_act_base(cv_id, p_target_month)
  from unnest(p_congviec_ids) as cv_id;
$$;

grant execute on function get_editability(text[], date) to authenticated;

-- ---------------------------------------------------------------------------
-- Quy tắc 5: chỉ AdminM được cấp/giữ role adminm; Admin thường không được
-- tự nâng quyền mình hoặc người khác lên adminm. Cài bằng trigger (không
-- chỉ RLS) để áp dụng cả khi update qua service-role trong Server Action.
-- ---------------------------------------------------------------------------
create function fn_guard_vai_tro_change() returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.vai_tro is distinct from old.vai_tro then
    if not current_role_is_admin() then
      raise exception 'Không có quyền đổi vai trò người dùng';
    end if;
    if new.vai_tro = 'adminm' and not current_role_is_adminm() then
      raise exception 'Chỉ AdminM mới được cấp quyền AdminM';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_guard_vai_tro_change
before update on nguoidung
for each row execute function fn_guard_vai_tro_change();

-- ---------------------------------------------------------------------------
-- Chuẩn hoá ma_thiet_bi (trim + upper) để giảm lỗi gõ kiểu "E06109" vs
-- "E006109" mà CLAUDE.md mục B đã cảnh báo.
-- ---------------------------------------------------------------------------
create function fn_normalize_ma_thiet_bi() returns trigger
language plpgsql as $$
begin
  new.ma_thiet_bi := upper(trim(new.ma_thiet_bi));
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_normalize_ma_thiet_bi
before insert or update on thietbi
for each row execute function fn_normalize_ma_thiet_bi();

-- ---------------------------------------------------------------------------
-- updated_at tự động cho các bảng còn lại.
-- ---------------------------------------------------------------------------
create function fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_chitiet_updated_at before update on chitiet
  for each row execute function fn_set_updated_at();
create trigger trg_congviec_updated_at before update on congviec
  for each row execute function fn_set_updated_at();
create trigger trg_thuc_hien_updated_at before update on thuc_hien
  for each row execute function fn_set_updated_at();
create trigger trg_bat_thuong_updated_at before update on bat_thuong
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- Ràng buộc BAT_THUONG <-> THUC_HIEN (mục E CLAUDE.md):
-- ket_qua='R' <=> có đúng 1 BAT_THUONG. Constraint trigger DEFERRABLE để
-- RPC set_ket_qua_r_with_bat_thuong() có thể update THUC_HIEN rồi insert
-- BAT_THUONG theo thứ tự tự nhiên trong cùng transaction.
-- ---------------------------------------------------------------------------
create function fn_check_thuc_hien_bat_thuong() returns trigger
language plpgsql as $$
begin
  if new.ket_qua = 'R' and not exists (
    select 1 from bat_thuong where thuchien_id = new.id
  ) then
    raise exception 'THUC_HIEN % có ket_qua=R nhưng chưa có BAT_THUONG tương ứng', new.id;
  end if;
  return new;
end;
$$;

create constraint trigger trg_thuc_hien_requires_bat_thuong
after insert or update on thuc_hien
deferrable initially deferred
for each row execute function fn_check_thuc_hien_bat_thuong();

create function fn_check_bat_thuong_parent() returns trigger
language plpgsql as $$
begin
  if (select ket_qua from thuc_hien where id = new.thuchien_id) <> 'R' then
    raise exception 'Không thể tạo BAT_THUONG khi THUC_HIEN tương ứng không ở trạng thái R';
  end if;
  return new;
end;
$$;

create trigger trg_bat_thuong_parent
before insert on bat_thuong
for each row execute function fn_check_bat_thuong_parent();

-- Lịch sử bất thường không bị xoá khi ket_qua đổi khỏi 'R' (mục E) -- chỉ
-- chặn đổi thuchien_id/mo_ta sau khi tạo, cho phép đổi trang_thai/ngay_khac_phuc.
create function fn_guard_bat_thuong_update() returns trigger
language plpgsql as $$
begin
  if new.thuchien_id is distinct from old.thuchien_id then
    raise exception 'Không được đổi thuchien_id của một BAT_THUONG đã tạo';
  end if;
  if new.mo_ta is distinct from old.mo_ta and not current_role_is_admin() then
    raise exception 'Chỉ Admin/AdminM được sửa mô tả bất thường đã ghi nhận';
  end if;
  return new;
end;
$$;

create trigger trg_guard_bat_thuong_update
before update on bat_thuong
for each row execute function fn_guard_bat_thuong_update();

-- ---------------------------------------------------------------------------
-- Quy tắc 4 (thay thế): optimistic concurrency dựa trên updated_at thay vì
-- so initialData như hệ cũ -- chặt hơn vì bắt được cả xung đột ghi đồng thời
-- giữa 2 người, không chỉ tránh tự ghi đè Plan không đổi.
--
-- upsert_thuc_hien(payload): payload là mảng jsonb, mỗi phần tử:
--   { congviec_id, ngay, ke_hoach (nullable), ket_qua (nullable, không được
--     là 'R' -- phải dùng set_ket_qua_r_with_bat_thuong), expected_updated_at (nullable) }
-- Trả về mảng kết quả { congviec_id, ngay, status: 'applied'|'skipped'|'conflict', reason }
-- -- cải tiến so với hệ cũ vốn bỏ qua âm thầm hoàn toàn, không phản hồi gì.
-- ---------------------------------------------------------------------------
create function upsert_thuc_hien(payload jsonb) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_item jsonb;
  v_congviec_id text;
  v_ngay date;
  v_req_ke_hoach boolean;
  v_req_ket_qua text;
  v_expected_updated_at timestamptz;
  v_row thuc_hien;
  v_new_ke_hoach boolean;
  v_new_ket_qua ket_qua_enum;
  v_changed boolean;
  v_results jsonb := '[]'::jsonb;
  v_status text;
  v_reason text;
begin
  for v_item in select * from jsonb_array_elements(payload)
  loop
    v_congviec_id := v_item ->> 'congviec_id';
    v_ngay := (v_item ->> 'ngay')::date;
    v_req_ke_hoach := case when v_item ? 'ke_hoach' and v_item -> 'ke_hoach' is not null
      then (v_item ->> 'ke_hoach')::boolean else null end;
    v_req_ket_qua := v_item ->> 'ket_qua';
    v_expected_updated_at := case when v_item ? 'expected_updated_at' and v_item -> 'expected_updated_at' is not null
      then (v_item ->> 'expected_updated_at')::timestamptz else null end;
    v_status := 'skipped';
    v_reason := null;

    if v_req_ket_qua = 'R' then
      raise exception 'Dùng set_ket_qua_r_with_bat_thuong() để đặt ket_qua=R (cần mô tả bất thường)';
    end if;

    select * into v_row from thuc_hien where congviec_id = v_congviec_id and ngay = v_ngay;

    if found then
      if v_expected_updated_at is not null and v_expected_updated_at <> v_row.updated_at then
        v_status := 'conflict';
        v_reason := 'Dữ liệu đã bị người khác cập nhật, vui lòng tải lại';
      else
        v_new_ke_hoach := v_row.ke_hoach;
        v_new_ket_qua := v_row.ket_qua;
        v_changed := false;

        if v_req_ke_hoach is not null and v_req_ke_hoach is distinct from v_row.ke_hoach then
          if can_edit_plan(v_congviec_id, v_ngay) then
            v_new_ke_hoach := v_req_ke_hoach;
            v_changed := true;
          else
            v_reason := coalesce(v_reason, 'Không có quyền sửa Plan');
          end if;
        end if;

        if v_req_ket_qua is not null and v_req_ket_qua <> v_row.ket_qua::text then
          if can_edit_act(v_congviec_id, v_ngay, v_row.ket_qua::text, v_req_ket_qua) then
            v_new_ket_qua := v_req_ket_qua::ket_qua_enum;
            v_changed := true;
          else
            v_reason := coalesce(v_reason, 'Không có quyền sửa Actual (ngoài cửa sổ cho phép hoặc bị khoá)');
          end if;
        end if;

        if v_changed then
          update thuc_hien
            set ke_hoach = v_new_ke_hoach,
                ket_qua = v_new_ket_qua,
                nguoi_thuc_hien = current_msnv()
            where id = v_row.id;
          v_status := 'applied';
        end if;
      end if;
    else
      v_new_ke_hoach := false;
      v_new_ket_qua := 'N';
      v_changed := false;

      if v_req_ke_hoach is not null and can_edit_plan(v_congviec_id, v_ngay) then
        v_new_ke_hoach := v_req_ke_hoach;
        v_changed := true;
      end if;

      if v_req_ket_qua is not null and can_edit_act(v_congviec_id, v_ngay, 'N', v_req_ket_qua) then
        v_new_ket_qua := v_req_ket_qua::ket_qua_enum;
        v_changed := true;
      end if;

      if v_changed then
        insert into thuc_hien (congviec_id, ngay, ke_hoach, ket_qua, nguoi_thuc_hien)
        values (v_congviec_id, v_ngay, v_new_ke_hoach, v_new_ket_qua, current_msnv());
        v_status := 'applied';
      else
        v_reason := 'Không có quyền sửa ô này';
      end if;
    end if;

    v_results := v_results || jsonb_build_object(
      'congviec_id', v_congviec_id,
      'ngay', v_ngay,
      'status', v_status,
      'reason', v_reason
    );
  end loop;

  return v_results;
end;
$$;

grant execute on function upsert_thuc_hien(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- set_ket_qua_r_with_bat_thuong: gộp cập nhật THUC_HIEN.ket_qua='R' và tạo
-- BAT_THUONG trong cùng transaction, để deferred trigger luôn thấy đủ dữ liệu
-- lúc COMMIT bất kể thứ tự.
-- ---------------------------------------------------------------------------
create function set_ket_qua_r_with_bat_thuong(
  p_congviec_id text,
  p_ngay date,
  p_mo_ta text,
  p_anh_url text default null,
  p_ngay_phat_hien date default null
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_row thuc_hien;
  v_old_act text;
  v_thuchien_id uuid;
  v_bat_thuong_id uuid;
begin
  if p_mo_ta is null or trim(p_mo_ta) = '' then
    raise exception 'Mô tả bất thường là bắt buộc';
  end if;

  select * into v_row from thuc_hien where congviec_id = p_congviec_id and ngay = p_ngay;
  v_old_act := coalesce(v_row.ket_qua::text, 'N');

  if not can_edit_act(p_congviec_id, p_ngay, v_old_act, 'R') then
    raise exception 'Không có quyền ghi nhận bất thường cho ô này';
  end if;

  if v_row.id is null then
    insert into thuc_hien (congviec_id, ngay, ke_hoach, ket_qua, nguoi_thuc_hien)
    values (p_congviec_id, p_ngay, false, 'R', current_msnv())
    returning id into v_thuchien_id;
  else
    update thuc_hien
      set ket_qua = 'R', nguoi_thuc_hien = current_msnv()
      where id = v_row.id
      returning id into v_thuchien_id;
  end if;

  insert into bat_thuong (thuchien_id, mo_ta, anh_url, ngay_phat_hien, nguoi_ghi)
  values (v_thuchien_id, p_mo_ta, p_anh_url, coalesce(p_ngay_phat_hien, today_vn()), current_msnv())
  returning id into v_bat_thuong_id;

  return jsonb_build_object('thuchien_id', v_thuchien_id, 'bat_thuong_id', v_bat_thuong_id);
end;
$$;

grant execute on function set_ket_qua_r_with_bat_thuong(text, date, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Quy tắc 6: v_plan_stats -- "Đã cập nhật" nếu BẤT KỲ task nào có Plan trong
-- tháng, không phải tất cả (giữ đúng ngữ nghĩa getPlanStats cũ).
-- ---------------------------------------------------------------------------
create function get_plan_stats(p_target_month date)
returns table (
  thietbi_id uuid,
  xuong text,
  kip text,
  nguoi_phu_trach text,
  ten_thiet_bi text,
  total_tasks bigint,
  planned_tasks bigint,
  status text
)
language sql stable security definer
set search_path = public as $$
  select
    t.id,
    t.xuong,
    t.kip,
    t.nguoi_phu_trach,
    t.ten_thiet_bi,
    count(distinct cv.id) as total_tasks,
    count(distinct cv.id) filter (
      where exists (
        select 1 from thuc_hien th
        where th.congviec_id = cv.id
          and th.ke_hoach
          and date_trunc('month', th.ngay) = date_trunc('month', p_target_month)
      )
    ) as planned_tasks,
    case when count(distinct cv.id) filter (
      where exists (
        select 1 from thuc_hien th
        where th.congviec_id = cv.id
          and th.ke_hoach
          and date_trunc('month', th.ngay) = date_trunc('month', p_target_month)
      )
    ) > 0 then 'Đã cập nhật' else 'Chưa cập nhật' end as status
  from thietbi t
  join chitiet ct on ct.thietbi_id = t.id
  join congviec cv on cv.chitiet_id = ct.id
  group by t.id, t.xuong, t.kip, t.nguoi_phu_trach, t.ten_thiet_bi;
$$;

grant execute on function get_plan_stats(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Quy tắc 7: get_notifications -- nhắc lập Plan chỉ ngày 1-6, nhắc thiếu
-- Actual không giới hạn ngày.
-- ---------------------------------------------------------------------------
create function get_notifications(p_msnv text)
returns table (loai text, thiet_bi text, noi_dung text)
language plpgsql stable security definer
set search_path = public as $$
declare
  v_today date := today_vn();
  v_month_start date := date_trunc('month', v_today)::date;
begin
  -- Nhắc lập Plan: thiết bị của người này chưa có Plan tháng này, chỉ hiện ngày 1-6.
  if extract(day from v_today) between 1 and 6 then
    return query
    select 'plan'::text, t.ten_thiet_bi, null::text
    from thietbi t
    where t.nguoi_phu_trach = p_msnv
      and not exists (
        select 1 from congviec cv
        join chitiet ct on ct.id = cv.chitiet_id
        join thuc_hien th on th.congviec_id = cv.id
        where ct.thietbi_id = t.id
          and th.ke_hoach
          and date_trunc('month', th.ngay) = v_month_start
      );
  end if;

  -- Nhắc thiếu Actual: đã có Plan qua ngày nhưng Actual chưa đủ, không giới hạn ngày.
  return query
  select 'act'::text, t.ten_thiet_bi, ct.ten_chi_tiet
  from thietbi t
  join chitiet ct on ct.thietbi_id = t.id
  join congviec cv on cv.chitiet_id = ct.id
  join thuc_hien th on th.congviec_id = cv.id
  where t.nguoi_phu_trach = p_msnv
    and date_trunc('month', th.ngay) = v_month_start
    and th.ngay < v_today
    and th.ke_hoach
    and th.ket_qua = 'N';
end;
$$;

grant execute on function get_notifications(text) to authenticated;
