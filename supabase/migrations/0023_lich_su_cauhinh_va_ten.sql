-- Đợt 5:
--  * #4 LỊCH SỬ CẤU HÌNH dễ đọc: dựng từ bảng `de_xuat_congviec` (nơi DUY NHẤT
--    có sẵn cả người đề xuất + người duyệt + loại + lý do + trạng thái). Để bao
--    cả Admin sửa/loại bỏ/thêm/khôi phục TRỰC TIẾP (không qua đề xuất), các RPC
--    apply-trực-tiếp nay ghi thêm 1 dòng `de_xuat_congviec` 'Đã duyệt' -> bảng
--    này thành sổ ghi ĐẦY ĐỦ mọi thay đổi cấu hình qua checksheet.
--      ceiling: thay đổi Admin-trực-tiếp TRƯỚC migration này không có dòng
--      de_xuat -> không hiện ở view Cấu hình mới (vẫn tra được ở audit_log thô).
--  * Thêm cột `ap_dung_tu` (thời gian áp dụng = hiệu lực từ), set khi được áp dụng.
--  * 2 RPC đọc lịch sử rõ kiểu: get_thietbi_cauhinh (từ de_xuat) +
--    get_thietbi_chamcong (từ audit_log thuc_hien, enrich tên chi tiết/công việc).
--  * #2b get_plan_stats + cột ho_ten (Thống kê hiện tên nhân viên).
--
-- Bài học hosted Supabase: hàm security-definer MỚI tự được cấp EXECUTE cho
-- anon/authenticated -> phải revoke anon tường minh cho hàm đọc dữ liệu.

-- ---------------------------------------------------------------------------
-- (0) Cột ap_dung_tu
-- ---------------------------------------------------------------------------
alter table de_xuat_congviec add column ap_dung_tu date;

-- ---------------------------------------------------------------------------
-- (1) propose_congviec_change: thêm ghi dòng de_xuat auto-duyệt + ap_dung_tu
-- cho nhánh Admin-trực-tiếp. Giữ nguyên chữ ký 0021 (create or replace).
-- ---------------------------------------------------------------------------
create or replace function propose_congviec_change(
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
  v_ap_dung date;
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
  if p_loai_de_xuat in ('sua', 'loai_bo')
     and (not v_row.active or (v_row.hieu_luc_den is not null and v_row.hieu_luc_den < v_effect)) then
    raise exception 'Công việc này đã được loại bỏ/hết hiệu lực -- không thể đề xuất thay đổi';
  end if;

  if current_role_is_admin() then
    if p_loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(v_canonical, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, p_ap_dung_ngay);
      v_ap_dung := nullif(v_result->>'hieu_luc_tu', '')::date;
    elsif p_loai_de_xuat = 'loai_bo' then
      v_result := remove_congviec_with_reason(v_canonical, p_ly_do, p_ap_dung_ngay);
      v_ap_dung := nullif(v_result->>'an_tu', '')::date;
    else
      v_result := restore_congviec_with_reason(v_canonical, p_ly_do);
      v_ap_dung := date_trunc('month', today_vn())::date;
    end if;

    -- Ghi 1 dòng de_xuat auto-duyệt (người đề xuất = người duyệt = admin) để
    -- lịch sử cấu hình đầy đủ. congviec_id = v_canonical (dòng bị tác động).
    insert into de_xuat_congviec (
      congviec_id, loai_de_xuat, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi,
      ly_do, nguoi_de_xuat, nguoi_duyet, trang_thai, ap_dung_tu, updated_at
    ) values (
      v_canonical, p_loai_de_xuat, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so,
      p_ly_do, current_msnv(), current_msnv(), 'Đã duyệt', v_ap_dung, now()
    );

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
-- (2) propose_them_hang_muc: tương tự -- ghi dòng de_xuat 'them' auto-duyệt.
-- ---------------------------------------------------------------------------
create or replace function propose_them_hang_muc(
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
  v_ap_dung date;
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
    v_ap_dung := nullif(v_result->>'hieu_luc_tu', '')::date;

    insert into de_xuat_congviec (
      loai_de_xuat, thietbi_id, chitiet_id, ten_chi_tiet_moi, dieu_kien_co_ban_moi, stt_moi,
      loai_hoat_dong_moi, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi,
      ly_do, nguoi_de_xuat, nguoi_duyet, trang_thai, ap_dung_tu, updated_at
    ) values (
      'them', p_thietbi_id, p_chitiet_id, v_ten, p_dieu_kien_co_ban, p_stt,
      trim(p_loai_hoat_dong), p_thoi_gian, p_tan_suat_chu, p_tan_suat_so,
      p_ly_do, current_msnv(), current_msnv(), 'Đã duyệt', v_ap_dung, now()
    );

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

-- ---------------------------------------------------------------------------
-- (3) resolve_de_xuat_congviec: khi duyệt, set thêm ap_dung_tu. Giữ chữ ký 0021.
-- ---------------------------------------------------------------------------
create or replace function resolve_de_xuat_congviec(
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
  v_ap_dung date;
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
      v_ap_dung := nullif(v_result->>'hieu_luc_tu', '')::date;
    elsif v_de_xuat.loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(
        v_de_xuat.congviec_id, v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi,
        v_de_xuat.tan_suat_so_moi, v_de_xuat.ly_do, p_ap_dung_ngay
      );
      v_ap_dung := nullif(v_result->>'hieu_luc_tu', '')::date;
    elsif v_de_xuat.loai_de_xuat = 'khoi_phuc' then
      v_result := restore_congviec_with_reason(v_de_xuat.congviec_id, v_de_xuat.ly_do);
      v_ap_dung := date_trunc('month', today_vn())::date;
    else
      v_result := remove_congviec_with_reason(v_de_xuat.congviec_id, v_de_xuat.ly_do, p_ap_dung_ngay);
      v_ap_dung := nullif(v_result->>'an_tu', '')::date;
    end if;

    update de_xuat_congviec
      set trang_thai = 'Đã duyệt', nguoi_duyet = current_msnv(), ap_dung_tu = v_ap_dung, updated_at = now()
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

-- ---------------------------------------------------------------------------
-- (4) get_plan_stats + ho_ten (đổi RETURNS TABLE -> phải drop + create + grant).
-- ---------------------------------------------------------------------------
drop function get_plan_stats(date);
create function get_plan_stats(p_target_month date)
returns table (
  thietbi_id uuid,
  xuong text,
  kip text,
  nguoi_phu_trach text,
  ho_ten text,
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
    nd.ho_ten,
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
  left join nguoidung nd on nd.msnv = t.nguoi_phu_trach
  group by t.id, t.xuong, t.kip, t.nguoi_phu_trach, nd.ho_ten, t.ten_thiet_bi;
$$;

revoke execute on function get_plan_stats(date) from public, anon;
grant execute on function get_plan_stats(date) to authenticated;

-- ---------------------------------------------------------------------------
-- (5) get_thietbi_cauhinh: lịch sử CẤU HÌNH dễ đọc, từ de_xuat_congviec. Đủ mọi
-- trạng thái (Chờ duyệt / Đã duyệt / Từ chối) + Admin trực tiếp (dòng auto-duyệt).
-- security definer (đọc mở như lưới checksheet) -> chỉ authenticated.
--
-- KHÔNG drop get_thietbi_lich_su (0022) ở đây: giữ nó sống để code CŨ trên
-- prod vẫn chạy trong lúc Vercel build code mới (migration này backward-compat
-- hoàn toàn -> db push trước, deploy code sau, không gián đoạn). Có thể drop
-- hàm chết này ở một migration dọn dẹp về sau.
-- ---------------------------------------------------------------------------
create function get_thietbi_cauhinh(p_thietbi_id uuid)
returns table (
  id uuid,
  loai_de_xuat text,
  trang_thai text,
  ten_chi_tiet text,
  loai_hoat_dong text,
  thoi_gian_cu numeric,
  tan_suat_chu_cu text,
  tan_suat_so_cu numeric,
  thoi_gian_moi numeric,
  tan_suat_chu_moi text,
  tan_suat_so_moi numeric,
  ly_do text,
  ly_do_tu_choi text,
  nguoi_de_xuat text,
  nguoi_de_xuat_ten text,
  nguoi_duyet text,
  nguoi_duyet_ten text,
  created_at timestamptz,
  updated_at timestamptz,
  ap_dung_tu date
)
language sql stable security definer set search_path = public as $$
  select
    dx.id,
    dx.loai_de_xuat,
    dx.trang_thai,
    coalesce(ct.ten_chi_tiet, ct2.ten_chi_tiet, dx.ten_chi_tiet_moi) as ten_chi_tiet,
    coalesce(cv.loai_hoat_dong, dx.loai_hoat_dong_moi) as loai_hoat_dong,
    cv.thoi_gian as thoi_gian_cu,
    cv.tan_suat_chu as tan_suat_chu_cu,
    cv.tan_suat_so as tan_suat_so_cu,
    dx.thoi_gian_moi,
    dx.tan_suat_chu_moi,
    dx.tan_suat_so_moi,
    dx.ly_do,
    dx.ly_do_tu_choi,
    dx.nguoi_de_xuat,
    nd1.ho_ten as nguoi_de_xuat_ten,
    dx.nguoi_duyet,
    nd2.ho_ten as nguoi_duyet_ten,
    dx.created_at,
    dx.updated_at,
    dx.ap_dung_tu
  from de_xuat_congviec dx
  left join congviec cv on cv.id = dx.congviec_id
  left join chitiet ct on ct.id = cv.chitiet_id
  left join chitiet ct2 on ct2.id = dx.chitiet_id
  left join nguoidung nd1 on nd1.msnv = dx.nguoi_de_xuat
  left join nguoidung nd2 on nd2.msnv = dx.nguoi_duyet
  where
    (dx.congviec_id is not null and ct.thietbi_id = p_thietbi_id)
    or dx.thietbi_id = p_thietbi_id
  order by dx.created_at desc;
$$;

revoke execute on function get_thietbi_cauhinh(uuid) from public, anon;
grant execute on function get_thietbi_cauhinh(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (6) get_thietbi_chamcong: nhật ký chấm công (audit_log thuc_hien), enrich tên
-- chi tiết + loại hoạt động + stt (resolve gia_tri->>'congviec_id') để "biết
-- thuộc chi tiết nào". Join qua jsonb -> bao cả dòng thuc_hien đã DELETE.
-- ---------------------------------------------------------------------------
create function get_thietbi_chamcong(p_thietbi_id uuid, p_limit int default 200)
returns table (
  thoi_gian timestamptz,
  hanh_dong text,
  gia_tri_cu jsonb,
  gia_tri_moi jsonb,
  nguoi_msnv text,
  nguoi_ten text,
  ten_chi_tiet text,
  loai_hoat_dong text,
  stt int
)
language sql stable security definer set search_path = public as $$
  with cvs as (
    select cv.id, cv.loai_hoat_dong, ct.ten_chi_tiet, ct.stt
    from congviec cv
    join chitiet ct on ct.id = cv.chitiet_id
    where ct.thietbi_id = p_thietbi_id
  )
  select
    a.thoi_gian,
    a.hanh_dong,
    a.gia_tri_cu,
    a.gia_tri_moi,
    a.nguoi_thuc_hien as nguoi_msnv,
    nd.ho_ten as nguoi_ten,
    cvs.ten_chi_tiet,
    cvs.loai_hoat_dong,
    cvs.stt
  from audit_log a
  join cvs on cvs.id = coalesce(a.gia_tri_moi->>'congviec_id', a.gia_tri_cu->>'congviec_id')
  left join nguoidung nd on nd.msnv = a.nguoi_thuc_hien
  where a.bang = 'thuc_hien'
  order by a.thoi_gian desc
  limit greatest(1, coalesce(p_limit, 200));
$$;

revoke execute on function get_thietbi_chamcong(uuid, int) from public, anon;
grant execute on function get_thietbi_chamcong(uuid, int) to authenticated;
