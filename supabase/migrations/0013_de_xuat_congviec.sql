-- Việc 2: luồng ĐỀ XUẤT -> DUYỆT cho sửa/xoá CONGVIEC, thay vì áp dụng ngay
-- lập tức như migration 0010 (update_congviec_with_reason/
-- remove_congviec_with_reason vẫn giữ nguyên logic cũ, chỉ không còn được
-- gọi trực tiếp bởi non-admin nữa -- nay được gọi lại từ bên trong 2 RPC
-- mới dưới đây).
--
-- Bối cảnh: Sếp muốn chỉ Admin (đóng vai Trưởng ca) mới được sửa checksheet,
-- nhưng làm cứng như vậy sẽ dồn việc lên Trưởng ca. Giải pháp: người phụ
-- trách thiết bị vẫn tự đề xuất (kèm lý do bắt buộc như cũ), nhưng thay đổi
-- CHỈ có hiệu lực sau khi 1 Admin/AdminM duyệt. Nếu chính Admin/AdminM là
-- người đề xuất thì áp dụng ngay (không tự duyệt cho mình).
--
-- Phạm vi duyệt giới hạn theo Nhóm (kip): Admin thuộc Nhóm nào chỉ duyệt
-- được đề xuất của thiết bị thuộc Nhóm đó (so nguoidung.kip với thietbi.kip
-- qua congviec->chitiet->thietbi) -- AdminM không bị giới hạn này.

-- ---------------------------------------------------------------------------
-- DE_XUAT_CONGVIEC
-- ---------------------------------------------------------------------------
create table de_xuat_congviec (
  id uuid primary key default gen_random_uuid(),
  congviec_id text not null references congviec (id) on delete cascade,
  loai_de_xuat text not null check (loai_de_xuat in ('sua', 'loai_bo')),
  thoi_gian_moi numeric,
  tan_suat_chu_moi text,
  tan_suat_so_moi numeric,
  ly_do text not null,
  trang_thai text not null default 'Chờ duyệt'
    check (trang_thai in ('Chờ duyệt', 'Đã duyệt', 'Từ chối')),
  nguoi_de_xuat text not null references nguoidung (msnv),
  nguoi_duyet text references nguoidung (msnv),
  ly_do_tu_choi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_de_xuat_congviec_congviec on de_xuat_congviec (congviec_id);
create index idx_de_xuat_congviec_trang_thai on de_xuat_congviec (trang_thai);

-- Chặn 2 đề xuất "Chờ duyệt" cùng lúc trên 1 công việc -- Postgres tự đảm
-- bảo qua unique partial index, không cần khoá app-side.
create unique index uq_de_xuat_congviec_pending
  on de_xuat_congviec (congviec_id) where trang_thai = 'Chờ duyệt';

alter table de_xuat_congviec enable row level security;

-- ---------------------------------------------------------------------------
-- can_approve_congviec_change: AdminM duyệt được mọi Nhóm; Admin thường chỉ
-- duyệt được đề xuất của thiết bị CÙNG Nhóm (nguoidung.kip) với tài khoản
-- mình. Admin chưa điền kip (null) sẽ không duyệt được gì -- an toàn hơn
-- mặc định cho qua. Dùng chung cho cả RLS select lẫn RPC duyệt bên dưới.
-- ---------------------------------------------------------------------------
create function can_approve_congviec_change(p_congviec_id text) returns boolean
language plpgsql stable security definer
set search_path = public as $$
declare
  v_vai_tro vai_tro_enum;
  v_kip_nguoi_duyet text;
  v_kip_thiet_bi text;
begin
  select vai_tro, kip into v_vai_tro, v_kip_nguoi_duyet from nguoidung where id = auth.uid();

  if v_vai_tro = 'adminm' then
    return true;
  end if;

  if v_vai_tro <> 'admin' then
    return false;
  end if;

  select t.kip into v_kip_thiet_bi
  from congviec cv
  join chitiet ct on ct.id = cv.chitiet_id
  join thietbi t on t.id = ct.thietbi_id
  where cv.id = p_congviec_id;

  return v_kip_nguoi_duyet is not null and v_kip_nguoi_duyet = v_kip_thiet_bi;
end;
$$;

grant execute on function can_approve_congviec_change(text) to authenticated;

-- SELECT: người đề xuất thấy đề xuất của chính mình (để hiện badge "Chờ
-- duyệt" trên checksheet); Admin/AdminM có quyền duyệt thấy được để xử lý
-- hàng đợi. Không có insert/update policy trực tiếp -- mọi ghi qua RPC.
create policy de_xuat_congviec_select on de_xuat_congviec
  for select to authenticated
  using (nguoi_de_xuat = current_msnv() or can_approve_congviec_change(congviec_id));

-- ---------------------------------------------------------------------------
-- propose_congviec_change: 1 điểm gọi duy nhất cho mọi role -- frontend
-- không cần biết trước ai đang gọi. Admin/AdminM: áp dụng ngay (gọi lại
-- update_congviec_with_reason/remove_congviec_with_reason của 0010).
-- Người phụ trách (không phải admin): tạo 1 dòng "Chờ duyệt".
-- ---------------------------------------------------------------------------
create function propose_congviec_change(
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
  -- hạn theo Nhóm (giới hạn Nhóm chỉ áp dụng cho bước DUYỆT).
  if not can_manage_congviec(p_congviec_id) then
    raise exception 'Không có quyền đề xuất thay đổi công việc này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  if current_role_is_admin() then
    if p_loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(p_congviec_id, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do);
    else
      v_result := remove_congviec_with_reason(p_congviec_id, p_ly_do);
    end if;
    return jsonb_build_object('applied', true, 'result', v_result);
  end if;

  begin
    insert into de_xuat_congviec (
      congviec_id, loai_de_xuat, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi, ly_do, nguoi_de_xuat
    ) values (
      p_congviec_id, p_loai_de_xuat, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, current_msnv()
    ) returning id into v_de_xuat_id;
  exception when unique_violation then
    raise exception 'Công việc này đang có đề xuất chờ duyệt';
  end;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values (
    'de_xuat_congviec', v_de_xuat_id::text, 'INSERT', null,
    jsonb_build_object(
      'congviec_id', p_congviec_id, 'loai_de_xuat', p_loai_de_xuat,
      'thoi_gian_moi', p_thoi_gian, 'tan_suat_chu_moi', p_tan_suat_chu, 'tan_suat_so_moi', p_tan_suat_so
    ),
    current_msnv(), p_ly_do
  );

  return jsonb_build_object('applied', false, 'de_xuat_id', v_de_xuat_id);
end;
$$;

grant execute on function propose_congviec_change(text, text, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_de_xuat_congviec: Admin/AdminM duyệt hoặc từ chối 1 đề xuất đang
-- "Chờ duyệt". Gate bằng can_approve_congviec_change (giới hạn theo Nhóm).
-- ---------------------------------------------------------------------------
create function resolve_de_xuat_congviec(
  p_de_xuat_id uuid,
  p_hanh_dong text,
  p_ly_do_tu_choi text default null
) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_de_xuat de_xuat_congviec;
  v_result jsonb;
begin
  if p_hanh_dong not in ('duyet', 'tu_choi') then
    raise exception 'Hành động không hợp lệ';
  end if;

  select * into v_de_xuat from de_xuat_congviec where id = p_de_xuat_id for update;
  if not found then
    raise exception 'Không tìm thấy đề xuất %', p_de_xuat_id;
  end if;

  if not can_approve_congviec_change(v_de_xuat.congviec_id) then
    raise exception 'Không có quyền duyệt đề xuất này (khác Nhóm phụ trách hoặc không phải Admin)';
  end if;

  if v_de_xuat.trang_thai <> 'Chờ duyệt' then
    raise exception 'Đề xuất đã được xử lý';
  end if;

  if p_hanh_dong = 'duyet' then
    if v_de_xuat.loai_de_xuat = 'sua' then
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

grant execute on function resolve_de_xuat_congviec(uuid, text, text) to authenticated;
