-- Việc 2 (mở rộng): luồng ĐỀ XUẤT -> DUYỆT cho THÊM hạng mục (công việc mới
-- vào chi tiết có sẵn, hoặc chi tiết mới kèm công việc đầu tiên), song song
-- với 'sua'/'loai_bo' của 0013. Tái dùng bảng de_xuat_congviec + hàng đợi
-- /admin/de-xuat + resolve_de_xuat_congviec (phương án ① trong spec
-- docs/superpowers/specs/2026-07-18-them-hang-muc-de-xuat-design.md).
--
-- Hiệu lực: hạng mục mới hieu_luc_tu = đầu tháng sau (nhất quán 0016). ID
-- chitiet/congviec tự sinh từ sequence (CTxxxxx/CVxxxxx), không khoá ghép.

-- ---------------------------------------------------------------------------
-- (1) Mở rộng bảng de_xuat_congviec cho loại 'them'
-- ---------------------------------------------------------------------------
alter table de_xuat_congviec alter column congviec_id drop not null;

-- Nới ràng buộc loai_de_xuat để nhận 'them'. Ràng buộc CHECK cũ do 0013 tạo
-- inline (không đặt tên) -> tìm và bỏ theo tên hệ thống rồi thêm lại có tên.
alter table de_xuat_congviec drop constraint de_xuat_congviec_loai_de_xuat_check;
alter table de_xuat_congviec add constraint de_xuat_congviec_loai_de_xuat_check
  check (loai_de_xuat in ('sua', 'loai_bo', 'them'));

alter table de_xuat_congviec
  add column thietbi_id uuid references thietbi (id) on delete cascade,
  add column chitiet_id text references chitiet (id) on delete cascade,
  add column ten_chi_tiet_moi text,
  add column dieu_kien_co_ban_moi text,
  add column stt_moi int,
  add column loai_hoat_dong_moi text;

-- Toàn vẹn theo loại: 'them' cần thietbi_id + loai_hoat_dong_moi, và ĐÚNG MỘT
-- trong (chitiet_id | ten_chi_tiet_moi) (num_nonnulls = 1); 'sua'/'loai_bo'
-- giữ nguyên hình dạng cũ (congviec_id not null, các cột 'them' để null).
alter table de_xuat_congviec add constraint chk_de_xuat_loai check (
  case
    when loai_de_xuat = 'them' then
      congviec_id is null
      and thietbi_id is not null
      and loai_hoat_dong_moi is not null
      and num_nonnulls(chitiet_id, ten_chi_tiet_moi) = 1
    else
      congviec_id is not null
      and thietbi_id is null
      and chitiet_id is null
      and ten_chi_tiet_moi is null
      and loai_hoat_dong_moi is null
  end
);

-- Chống 2 đề xuất 'them công việc vào chi tiết có sẵn' trùng đang chờ duyệt.
-- Kiểu 'chi tiết mới' không có khoá tự nhiên -> không chặn (admin từ chối bản dư).
create unique index uq_de_xuat_them_pending
  on de_xuat_congviec (chitiet_id, loai_hoat_dong_moi)
  where loai_de_xuat = 'them' and chitiet_id is not null and trang_thai = 'Chờ duyệt';

create index idx_de_xuat_congviec_thietbi on de_xuat_congviec (thietbi_id);

-- ---------------------------------------------------------------------------
-- (2) Hàm quyền soi theo THIẾT BỊ (đề xuất 'them' chưa có congviec_id) —
-- mirror can_manage_congviec / can_approve_congviec_change của 0010/0013.
-- ---------------------------------------------------------------------------
create function can_manage_thietbi(p_thietbi_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_npt text;
begin
  if current_role_is_admin() then
    return true;
  end if;
  select nguoi_phu_trach into v_npt from thietbi where id = p_thietbi_id;
  -- coalesce(..., false): v_npt is not null AND v_npt = current_msnv() cho ra
  -- NULL (không phải false) khi current_msnv() là null (không có auth.uid()
  -- hợp lệ) -- nếu không chặn, "if not can_manage_thietbi(...)" ở nơi gọi sẽ
  -- coi NULL như false và BỎ QUA việc raise exception (fail-open). Hàm quyền
  -- không bao giờ được trả NULL.
  return coalesce(v_npt is not null and v_npt = current_msnv(), false);
end;
$$;

grant execute on function can_manage_thietbi(uuid) to authenticated;

create function can_approve_thietbi_change(p_thietbi_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_vai_tro vai_tro_enum;
  v_kip_duyet text;
  v_kip_tb text;
begin
  select vai_tro, kip into v_vai_tro, v_kip_duyet from nguoidung where id = auth.uid();
  if v_vai_tro = 'adminm' then
    return true;
  end if;
  if v_vai_tro <> 'admin' then
    return false;
  end if;
  select kip into v_kip_tb from thietbi where id = p_thietbi_id;
  return v_kip_duyet is not null and v_kip_duyet = v_kip_tb;
end;
$$;

grant execute on function can_approve_thietbi_change(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (3) create_hang_muc_moi: tạo hạng mục THẬT. Dùng chung cho admin-áp-ngay và
-- resolve-duyệt (giống update_congviec_with_reason được chia sẻ). Tạo chitiet
-- mới nếu p_chitiet_id null (kiểu b), rồi tạo congviec hieu_luc_tu đầu tháng
-- sau. KHÔNG tạo sẵn thuc_hien. Ghi audit_log cho từng dòng mới.
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
  p_ly_do text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_chitiet_id text := p_chitiet_id;
  v_new_ct chitiet;
  v_new_cv congviec;
  v_tb_id uuid;
  v_effect date := (date_trunc('month', today_vn()) + interval '1 month')::date;
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

grant execute on function create_hang_muc_moi(uuid, text, text, text, int, text, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- (4) propose_them_hang_muc: checksheet gọi 1 điểm cho mọi role. Người phụ
-- trách -> tạo dòng 'Chờ duyệt'; Admin/AdminM -> áp dụng ngay (create_hang_muc_moi).
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
  p_ly_do text
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
  -- đúng MỘT kiểu: chi tiết có sẵn XOR chi tiết mới
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
      p_stt, p_loai_hoat_dong, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do);
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

grant execute on function propose_them_hang_muc(uuid, text, text, text, int, text, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- (5) RLS select: đề xuất 'them' có congviec_id null -> can_approve_congviec_change
-- trả false cho admin, họ sẽ KHÔNG thấy trong hàng đợi. Bổ sung nhánh duyệt
-- theo thiết bị. (drop + create lại vì thay USING.)
-- ---------------------------------------------------------------------------
drop policy de_xuat_congviec_select on de_xuat_congviec;
create policy de_xuat_congviec_select on de_xuat_congviec
  for select to authenticated
  using (
    nguoi_de_xuat = current_msnv()
    or (congviec_id is not null and can_approve_congviec_change(congviec_id))
    or (thietbi_id is not null and can_approve_thietbi_change(thietbi_id))
  );

-- ---------------------------------------------------------------------------
-- (6) resolve_de_xuat_congviec: thêm nhánh 'them'. Giữ nguyên logic 'sua'/
-- 'loai_bo'; gate 'them' bằng can_approve_thietbi_change; duyệt -> create_hang_muc_moi.
-- ---------------------------------------------------------------------------
create or replace function resolve_de_xuat_congviec(
  p_de_xuat_id uuid,
  p_hanh_dong text,
  p_ly_do_tu_choi text default null
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
        v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi, v_de_xuat.tan_suat_so_moi, v_de_xuat.ly_do
      );
    elsif v_de_xuat.loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(
        v_de_xuat.congviec_id, v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi,
        v_de_xuat.tan_suat_so_moi, v_de_xuat.ly_do
      );
    else
      v_result := remove_congviec_with_reason(v_de_xuat.congviec_id, v_de_xuat.ly_do);
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

  -- 'tu_choi'
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
