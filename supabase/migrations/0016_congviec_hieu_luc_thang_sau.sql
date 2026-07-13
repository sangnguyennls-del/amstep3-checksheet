-- Mục 1 (docs/QUYET-DINH.md 2026-07-13): thay đổi công việc qua luồng đề
-- xuất -> duyệt trên checksheet có hiệu lực từ ĐẦU THÁNG SAU thời điểm áp
-- dụng; checksheet các tháng cũ giữ nguyên dòng + dữ liệu đã chấm.
--
-- Trước migration này, resolve_de_xuat_congviec/propose_congviec_change gọi
-- update_congviec_with_reason (UPDATE tại chỗ -> đổi lịch sử mọi tháng) và
-- remove_congviec_with_reason (active=false -> biến mất khỏi MỌI tháng, kể
-- cả quá khứ) -- trái với lời hứa "từ tháng sau" đã có sẵn trên UI
-- (EditCongViecModal). Cơ chế mới:
--
--   * Loại bỏ:  giữ active=true, đặt hieu_luc_den = cuối tháng hiện tại (VN).
--               ngay_loai_bo vẫn là NGÀY QUYẾT ĐỊNH (today_vn) -- mốc hiệu
--               lực luôn suy ra được = hieu_luc_den + 1.
--   * Sửa:      đóng dòng cũ (hieu_luc_den = cuối tháng) + INSERT dòng kế
--               nhiệm (giá trị mới, hieu_luc_tu = đầu tháng sau), liên kết
--               qua cột mới thay_the_boi. Sửa lặp trong cùng tháng cập nhật
--               dòng kế nhiệm tại chỗ (không sinh chuỗi dòng trùng).
--   * Đề xuất treo qua tháng: tháng hiệu lực tính tại THỜI ĐIỂM DUYỆT + 1
--               (đề xuất 30/07, duyệt 02/08 -> hiệu lực 01/09) -- bất biến
--               "không bao giờ sửa tháng đã bắt đầu".
--
-- LƯU Ý (docs/VIEC-KHONG-DUOC-LAM.md): active=false từ nay = "ẩn hẳn khỏi
-- mọi tháng" (chỉ dành cho đường admin thủ công /admin/equipment hoặc dòng
-- kế nhiệm chưa từng hiển thị) -- KHÔNG dùng lại cho nghiệp vụ loại bỏ.
-- Trang /admin/equipment (equipment.ts ghi thẳng bảng) giữ nguyên hành vi
-- sửa-ngay làm đường sửa lỗi nhập liệu.

-- ---------------------------------------------------------------------------
-- (1) Liên kết phiên bản: dòng cũ trỏ tới dòng kế nhiệm. on delete set null
-- vì deleteCongViec (equipment.ts) vẫn được phép xoá cứng 1 dòng kế nhiệm
-- tạo nhầm -- không được làm gãy dòng cũ.
-- ---------------------------------------------------------------------------
alter table congviec add column thay_the_boi text references congviec (id) on delete set null;
create index idx_congviec_thay_the_boi on congviec (thay_the_boi);

-- ---------------------------------------------------------------------------
-- (2) latest_congviec_version: lần theo chuỗi thay_the_boi tới phiên bản mới
-- nhất. Cần cho: đề xuất tạo trên lưới tháng cũ (id cũ) phải quy về đúng
-- phiên bản hiện hành trước khi ghi/duyệt -- nếu không, unique index
-- uq_de_xuat_congviec_pending (0013) có thể bị lách bằng 2 đề xuất trên 2
-- phiên bản của CÙNG 1 công việc.
-- ---------------------------------------------------------------------------
create function latest_congviec_version(p_congviec_id text) returns text
language plpgsql stable security definer
set search_path = public as $$
declare
  v_id text := p_congviec_id;
  v_next text;
  v_hops int := 0;
begin
  loop
    select thay_the_boi into v_next from congviec where id = v_id;
    if v_next is null then
      return v_id;
    end if;
    v_id := v_next;
    v_hops := v_hops + 1;
    if v_hops > 24 then
      raise exception 'Chuỗi phiên bản của công việc % quá dài (nghi vòng lặp)', p_congviec_id;
    end if;
  end loop;
end;
$$;

grant execute on function latest_congviec_version(text) to authenticated;

-- ---------------------------------------------------------------------------
-- (3) can_edit_plan / can_edit_act_base: thêm cổng "công việc phải còn hiệu
-- lực trong THÁNG của ngày đích" -- đặt TRƯỚC nhánh admin (chặn cả admin ghi
-- vào dòng đã bị thay thế/loại bỏ từ 1 lưới stale còn mở trên máy khác; RLS
-- thuc_hien_insert/update (0003) uỷ quyền cho đúng 2 hàm này nên PostgREST
-- trực tiếp cũng bị chặn). Ô của tháng mà dòng CÒN hiệu lực (vd tháng 7 của
-- dòng bị loại từ 01/08) vẫn sửa được bình thường theo các quy tắc cũ.
-- ---------------------------------------------------------------------------
create or replace function can_edit_plan(p_congviec_id text, p_target_date date) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_nguoi_phu_trach text;
  v_active boolean;
  v_hieu_luc_tu date;
  v_hieu_luc_den date;
  v_is_my_device boolean;
  v_diff int;
  v_today date := today_vn();
begin
  select t.nguoi_phu_trach, cv.active, cv.hieu_luc_tu, cv.hieu_luc_den
    into v_nguoi_phu_trach, v_active, v_hieu_luc_tu, v_hieu_luc_den
  from congviec cv
  join chitiet ct on ct.id = cv.chitiet_id
  join thietbi t on t.id = ct.thietbi_id
  where cv.id = p_congviec_id;

  -- 0016: dòng phải còn hiệu lực trong tháng chứa p_target_date (so theo
  -- THÁNG, không theo ngày -- get_editability truyền ngày đầu tháng, và dữ
  -- liệu cũ có thể có hieu_luc_tu giữa tháng).
  if not found or not v_active
    or (v_hieu_luc_tu is not null
        and v_hieu_luc_tu > (date_trunc('month', p_target_date) + interval '1 month - 1 day')::date)
    or (v_hieu_luc_den is not null
        and v_hieu_luc_den < date_trunc('month', p_target_date)::date)
  then
    return false;
  end if;

  if current_role_is_admin() then
    return true;
  end if;

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

create or replace function can_edit_act_base(p_congviec_id text, p_target_date date) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_nguoi_phu_trach text;
  v_active boolean;
  v_hieu_luc_tu date;
  v_hieu_luc_den date;
  v_is_my_device boolean;
  v_diff int;
  v_today date := today_vn();
begin
  select t.nguoi_phu_trach, cv.active, cv.hieu_luc_tu, cv.hieu_luc_den
    into v_nguoi_phu_trach, v_active, v_hieu_luc_tu, v_hieu_luc_den
  from congviec cv
  join chitiet ct on ct.id = cv.chitiet_id
  join thietbi t on t.id = ct.thietbi_id
  where cv.id = p_congviec_id;

  -- 0016: cùng cổng hiệu lực theo tháng như can_edit_plan.
  if not found or not v_active
    or (v_hieu_luc_tu is not null
        and v_hieu_luc_tu > (date_trunc('month', p_target_date) + interval '1 month - 1 day')::date)
    or (v_hieu_luc_den is not null
        and v_hieu_luc_den < date_trunc('month', p_target_date)::date)
  then
    return false;
  end if;

  if current_role_is_admin() then
    return true;
  end if;

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
-- (4a) get_plan_stats: join congviec trước đây KHÔNG có điều kiện nào -- vừa
-- đếm cả dòng active=false (bug tiềm ẩn sẵn có), vừa sẽ đếm trùng dòng
-- cũ + dòng kế nhiệm sau 0016. Thêm điều kiện "hiệu lực giao tháng
-- p_target_month" đồng bộ với predicate của getCongViecRows (queries.ts).
-- Hệ quả chủ đích: thiết bị không còn công việc hiệu lực trong tháng sẽ
-- biến khỏi bảng thống kê tháng đó.
-- ---------------------------------------------------------------------------
create or replace function get_plan_stats(p_target_month date)
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
    and cv.active
    and (cv.hieu_luc_tu is null
         or cv.hieu_luc_tu <= (date_trunc('month', p_target_month) + interval '1 month - 1 day')::date)
    and (cv.hieu_luc_den is null
         or cv.hieu_luc_den >= date_trunc('month', p_target_month)::date)
  group by t.id, t.xuong, t.kip, t.nguoi_phu_trach, t.ten_thiet_bi;
$$;

-- ---------------------------------------------------------------------------
-- (4b) get_notifications: cùng lý do -- cả 2 nhánh nhắc phải chỉ xét công
-- việc còn hiệu lực trong tháng hiện tại. Nhánh nhắc Plan thêm cổng "thiết
-- bị còn ít nhất 1 công việc hiệu lực" để thiết bị đã nghỉ hẳn không nhắc
-- chủ thiết bị vô hạn.
-- ---------------------------------------------------------------------------
create or replace function get_notifications(p_msnv text)
returns table (loai text, thiet_bi text, noi_dung text)
language plpgsql stable security definer
set search_path = public as $$
declare
  v_today date := today_vn();
  v_month_start date := date_trunc('month', v_today)::date;
  v_month_end date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
begin
  -- Nhắc lập Plan: thiết bị của người này chưa có Plan tháng này, chỉ hiện ngày 1-6.
  if extract(day from v_today) between 1 and 6 then
    return query
    select 'plan'::text, t.ten_thiet_bi, null::text
    from thietbi t
    where t.nguoi_phu_trach = p_msnv
      and exists (
        select 1 from congviec cv
        join chitiet ct on ct.id = cv.chitiet_id
        where ct.thietbi_id = t.id
          and cv.active
          and (cv.hieu_luc_tu is null or cv.hieu_luc_tu <= v_month_end)
          and (cv.hieu_luc_den is null or cv.hieu_luc_den >= v_month_start)
      )
      and not exists (
        select 1 from congviec cv
        join chitiet ct on ct.id = cv.chitiet_id
        join thuc_hien th on th.congviec_id = cv.id
        where ct.thietbi_id = t.id
          and cv.active
          and (cv.hieu_luc_tu is null or cv.hieu_luc_tu <= v_month_end)
          and (cv.hieu_luc_den is null or cv.hieu_luc_den >= v_month_start)
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
    and cv.active
    and (cv.hieu_luc_tu is null or cv.hieu_luc_tu <= v_month_end)
    and (cv.hieu_luc_den is null or cv.hieu_luc_den >= v_month_start)
  join thuc_hien th on th.congviec_id = cv.id
  where t.nguoi_phu_trach = p_msnv
    and date_trunc('month', th.ngay) = v_month_start
    and th.ngay < v_today
    and th.ke_hoach
    and th.ket_qua = 'N';
end;
$$;

-- ---------------------------------------------------------------------------
-- (5) update_congviec_with_reason: version hoá thay vì UPDATE tại chỗ.
-- Được gọi từ propose_congviec_change (admin áp ngay) và
-- resolve_de_xuat_congviec (duyệt) -- cả 2 đường tự nhận ngữ nghĩa mới,
-- không cần sửa RPC gọi.
-- ---------------------------------------------------------------------------
create or replace function update_congviec_with_reason(
  p_congviec_id text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_id text;
  v_old congviec;
  v_new congviec;
  v_succ congviec;
  -- Mốc hiệu lực: đầu tháng sau theo giờ VN, tính tại thời điểm ÁP DỤNG
  -- (admin sửa ngay hoặc lúc duyệt) -- đề xuất treo qua tháng lấy tháng duyệt + 1.
  v_effect date := (date_trunc('month', today_vn()) + interval '1 month')::date;
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do thay đổi là bắt buộc';
  end if;

  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền sửa công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  -- Đề xuất có thể được tạo trên lưới tháng cũ (id phiên bản cũ) -- luôn quy
  -- về phiên bản mới nhất trước khi đụng dữ liệu.
  v_id := latest_congviec_version(p_congviec_id);
  select * into v_old from congviec where id = v_id for update;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;
  if not v_old.active or (v_old.hieu_luc_den is not null and v_old.hieu_luc_den < v_effect) then
    raise exception 'Công việc % đã bị loại bỏ/hết hiệu lực -- không thể sửa (Admin có thể khôi phục ở Quản lý thiết bị)', v_id;
  end if;

  if v_old.hieu_luc_tu is not null and v_old.hieu_luc_tu >= v_effect then
    -- Phiên bản này CHƯA hiệu lực ở bất kỳ tháng đã/đang diễn ra nào (dòng
    -- kế nhiệm vừa tạo trong tháng, hoặc dòng admin hẹn hiệu lực tương lai)
    -- -> sửa giá trị tại chỗ, không sinh thêm phiên bản. Nhánh này cũng
    -- chính là cách "sửa 2 lần trong cùng tháng" không tạo dòng trùng.
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

  -- Version hoá: tạo dòng kế nhiệm TRƯỚC (FK thay_the_boi cần id tồn tại),
  -- thừa kế hieu_luc_den tương lai (nếu admin từng hẹn) của dòng cũ.
  insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu, hieu_luc_den)
  values (v_old.chitiet_id, v_old.loai_hoat_dong, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, true, v_effect, v_old.hieu_luc_den)
  returning * into v_succ;

  update congviec
    set hieu_luc_den = v_effect - 1,
        thay_the_boi = v_succ.id
    where id = v_id
    returning * into v_new;

  -- Ô đã tick sẵn cho các tháng tương lai trên dòng cũ (vd Plan tháng sau
  -- đã lập trước khi duyệt) vẫn là kế hoạch của CÙNG công việc -> dời sang
  -- dòng kế nhiệm, không để mồ côi vô hình. Dòng kế nhiệm vừa tạo chưa có ô
  -- nào nên không thể đụng unique(congviec_id, ngay); guard not exists +
  -- delete phần dư chỉ là phòng thủ (ô có bất thường thì giữ nguyên trên
  -- dòng cũ -- FK bat_thuong on delete restrict).
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

-- ---------------------------------------------------------------------------
-- (6) remove_congviec_with_reason: đóng cửa sổ hiệu lực thay vì active=false.
-- ---------------------------------------------------------------------------
create or replace function remove_congviec_with_reason(
  p_congviec_id text,
  p_ly_do text
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_id text;
  v_old congviec;
  v_new congviec;
  v_effect date := (date_trunc('month', today_vn()) + interval '1 month')::date;
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
    -- Phiên bản chưa từng hiển thị ở tháng nào đã/đang diễn ra (vd dòng kế
    -- nhiệm của 1 lần sửa trong tháng, nay đổi ý loại bỏ luôn) -> ẩn hẳn.
    -- Dòng cũ (nếu có) đã đóng hieu_luc_den = cuối tháng từ lần sửa -> tổng
    -- thể vẫn đúng: hiện hết tháng này, biến mất từ tháng sau.
    update congviec
      set active = false,
          ngay_loai_bo = today_vn()
      where id = v_id
      returning * into v_new;
  else
    -- Guard phía trên đảm bảo hieu_luc_den (nếu có) >= v_effect > cuối tháng
    -- hiện tại -> gán thẳng chính là least().
    update congviec
      set hieu_luc_den = v_effect - 1,
          ngay_loai_bo = today_vn()
      where id = v_id
      returning * into v_new;
  end if;

  -- Kế hoạch đã tick sẵn cho các tháng tương lai của công việc bị loại bỏ
  -- không còn ý nghĩa -> xoá (trừ ô có bất thường -- giữ làm dấu vết, FK
  -- bat_thuong on delete restrict cũng không cho xoá).
  delete from thuc_hien th
    where th.congviec_id = v_id
      and th.ngay >= v_effect
      and not exists (select 1 from bat_thuong bt where bt.thuchien_id = th.id);

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), current_msnv(), p_ly_do);

  return to_jsonb(v_new) || jsonb_build_object('an_tu', v_effect);
end;
$$;

-- ---------------------------------------------------------------------------
-- (7) propose_congviec_change: quy id về phiên bản mới nhất TRƯỚC khi kiểm
-- tra/ghi đề xuất -- để uq_de_xuat_congviec_pending chặn đúng "1 đề xuất
-- chờ duyệt cho 1 công việc" kể cả khi 2 người thao tác trên 2 lưới tháng
-- khác nhau (2 phiên bản id khác nhau của cùng công việc). Đồng thời chặn
-- sớm đề xuất trên công việc đã bị loại bỏ (thay vì để treo tới lúc duyệt
-- mới lỗi). resolve_de_xuat_congviec (0013) KHÔNG cần sửa: 2 RPC (5)/(6) tự
-- resolve-latest lần nữa lúc duyệt.
-- ---------------------------------------------------------------------------
create or replace function propose_congviec_change(
  p_congviec_id text,
  p_loai_de_xuat text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text
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

  if p_loai_de_xuat not in ('sua', 'loai_bo') then
    raise exception 'Loại đề xuất không hợp lệ';
  end if;

  -- Quyền ĐỀ XUẤT: chủ thiết bị hoặc bất kỳ Admin/AdminM nào -- KHÔNG giới
  -- hạn theo Kíp (giới hạn Kíp chỉ áp dụng cho bước DUYỆT).
  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền đề xuất thay đổi công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  v_canonical := latest_congviec_version(p_congviec_id);
  select * into v_row from congviec where id = v_canonical;
  if not found then
    raise exception 'Không tìm thấy công việc %', p_congviec_id;
  end if;
  if not v_row.active or (v_row.hieu_luc_den is not null and v_row.hieu_luc_den < v_effect) then
    raise exception 'Công việc này đã được loại bỏ/hết hiệu lực -- không thể đề xuất thay đổi';
  end if;

  if current_role_is_admin() then
    if p_loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(v_canonical, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do);
    else
      v_result := remove_congviec_with_reason(v_canonical, p_ly_do);
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

-- ---------------------------------------------------------------------------
-- (8) Phục hồi dữ liệu lịch sử: các công việc đã bị loại bỏ theo cơ chế cũ
-- (active=false + ngay_loai_bo) được đưa về mô hình mới -- hiển thị lại tới
-- hết THÁNG bị loại bỏ (dòng xoá 10/07 hiện lại tới 31/07, mất từ 01/08).
-- Đây chính là yêu cầu "load lại checksheet tháng 6/7 phải thấy dữ liệu chưa
-- xóa". Dòng active=false KHÔNG có ngay_loai_bo = admin ẩn thủ công, giữ
-- nguyên. Ghi audit_log trước khi sửa để truy vết được migration này.
-- ---------------------------------------------------------------------------
insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
select
  'congviec', cv.id, 'UPDATE', to_jsonb(cv),
  to_jsonb(cv) || jsonb_build_object(
    'active', true,
    'hieu_luc_den', least(
      coalesce(cv.hieu_luc_den, 'infinity'::date),
      (date_trunc('month', cv.ngay_loai_bo) + interval '1 month - 1 day')::date
    )
  ),
  null, 'Migration 0016: phục hồi hiển thị lịch sử cho công việc đã loại bỏ theo cơ chế cũ'
from congviec cv
where cv.active = false and cv.ngay_loai_bo is not null;

update congviec
set active = true,
    hieu_luc_den = least(
      coalesce(hieu_luc_den, 'infinity'::date),
      (date_trunc('month', ngay_loai_bo) + interval '1 month - 1 day')::date
    )
where active = false and ngay_loai_bo is not null;
