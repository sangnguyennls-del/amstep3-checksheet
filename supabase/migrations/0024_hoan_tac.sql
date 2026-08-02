-- Đợt 6: HOÀN TÁC / ROLLBACK
--  * huy_de_xuat: người gửi tự hủy đề xuất của mình khi còn 'Chờ duyệt'
--    (chưa áp dụng gì -> chỉ xóa bản ghi).
--  * hoan_tac_duyet: Trưởng ca hoàn tác 1 đề xuất ĐÃ DUYỆT về "như chưa từng có".
--    Cơ chế GENERIC dựa trên audit_log: mọi bản ghi audit của CÙNG 1 transaction
--    duyệt có thoi_gian == de_xuat.updated_at (now() là hằng trong 1 txn) và
--    nguoi_thuc_hien == nguoi_duyet -> gom đúng lần duyệt đó rồi ĐẢO NGƯỢC:
--      - UPDATE  -> khôi phục gia_tri_cu (kể cả move thuc_hien.congviec_id về cũ,
--        xóa hieu_luc_den/thay_the_boi, phục hồi thoi_gian/tần suất...).
--      - DELETE  -> tái tạo dòng đã xóa (KHÔI PHỤC được chấm công bị xóa khi loại bỏ).
--      - INSERT  -> xóa dòng vừa tạo (congviec kế nhiệm của 'sửa'; congviec/chitiet
--        của 'thêm'). Áp dụng SAU khi đã đảo UPDATE/DELETE nên không còn ref
--        (thay_the_boi là on-delete-set-null; thuc_hien đã move về cũ) -> không
--        cascade mất chấm công.
--    Ngoại lệ lằn ranh "không hard-delete congviec": đây là SỬA LỖI CÓ CHỦ ĐÍCH
--    (guard chặn khi đã có dữ liệu mới; thuc_hien bảo toàn; ghi audit việc hoàn tác).
--
-- Cả 2 hàm security definer + có kiểm tra quyền nội bộ (current_msnv / can_approve)
-- nên anon gọi sẽ fail an toàn; chỉ grant authenticated.

-- ---------------------------------------------------------------------------
-- huy_de_xuat: người gửi hủy đề xuất 'Chờ duyệt' của chính mình.
-- ---------------------------------------------------------------------------
create function huy_de_xuat(p_de_xuat_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dx de_xuat_congviec;
  v_msnv text := current_msnv();
begin
  if v_msnv is null then
    raise exception 'Chưa đăng nhập';
  end if;

  select * into v_dx from de_xuat_congviec where id = p_de_xuat_id for update;
  if not found then
    raise exception 'Không tìm thấy đề xuất %', p_de_xuat_id;
  end if;
  -- is distinct from: null-safe (tránh fail-open khi msnv/nguoi_de_xuat null).
  if v_dx.nguoi_de_xuat is distinct from v_msnv then
    raise exception 'Chỉ người gửi mới hủy được đề xuất của mình';
  end if;
  if v_dx.trang_thai <> 'Chờ duyệt' then
    raise exception 'Chỉ hủy được đề xuất đang Chờ duyệt';
  end if;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('de_xuat_congviec', p_de_xuat_id::text, 'DELETE', to_jsonb(v_dx), null, v_msnv, 'Người gửi tự hủy');
  delete from de_xuat_congviec where id = p_de_xuat_id;

  return jsonb_build_object('huy', true);
end;
$$;

grant execute on function huy_de_xuat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- hoan_tac_duyet: rollback 1 đề xuất ĐÃ DUYỆT (mọi loại) về trạng thái trước
-- khi duyệt, rồi xóa hẳn đề xuất.
-- ---------------------------------------------------------------------------
create function hoan_tac_duyet(p_de_xuat_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dx de_xuat_congviec;
  v_can boolean;
  v_a audit_log;
  v_reverted int := 0;
begin
  select * into v_dx from de_xuat_congviec where id = p_de_xuat_id for update;
  if not found then
    raise exception 'Không tìm thấy đề xuất %', p_de_xuat_id;
  end if;
  if v_dx.trang_thai <> 'Đã duyệt' then
    raise exception 'Chỉ hoàn tác được đề xuất ĐÃ DUYỆT (hiện: %)', v_dx.trang_thai;
  end if;

  -- Quyền hoàn tác = quyền duyệt.
  if v_dx.loai_de_xuat = 'them' then
    v_can := can_approve_thietbi_change(v_dx.thietbi_id);
  else
    v_can := can_approve_congviec_change(v_dx.congviec_id);
  end if;
  if not coalesce(v_can, false) then
    raise exception 'Không có quyền hoàn tác đề xuất này (khác Nhóm phụ trách hoặc không phải Admin)';
  end if;

  -- Không có dấu vết áp dụng (đề xuất cũ trước cơ chế này) -> không tự hoàn tác.
  if not exists (
    select 1 from audit_log a
    where a.thoi_gian = v_dx.updated_at and a.nguoi_thuc_hien = v_dx.nguoi_duyet
      and a.bang in ('congviec', 'chitiet', 'thuc_hien')
  ) then
    raise exception 'Không tìm thấy dấu vết áp dụng để hoàn tác (đề xuất cũ trước cơ chế này?)';
  end if;

  -- Guard (a): có thay đổi MUỘN HƠN trên chính các dòng bị đụng?
  if exists (
    select 1 from audit_log later
    where later.thoi_gian > v_dx.updated_at
      and (later.bang, later.ban_ghi_id) in (
        select a.bang, a.ban_ghi_id from audit_log a
        where a.thoi_gian = v_dx.updated_at and a.nguoi_thuc_hien = v_dx.nguoi_duyet
          and a.bang in ('congviec', 'chitiet', 'thuc_hien')
      )
  ) then
    raise exception 'Đã có thay đổi sau khi duyệt trên hạng mục này -- không thể hoàn tác tự động';
  end if;

  -- Guard (b): chấm công MỚI (updated_at muộn hơn) trên các congviec liên quan?
  if exists (
    select 1 from thuc_hien th
    where th.congviec_id in (
        select a.ban_ghi_id from audit_log a
        where a.thoi_gian = v_dx.updated_at and a.nguoi_thuc_hien = v_dx.nguoi_duyet and a.bang = 'congviec'
      )
      and th.updated_at > v_dx.updated_at
  ) then
    raise exception 'Đã có chấm công mới trên công việc liên quan -- không thể hoàn tác tự động';
  end if;

  -- PASS A: đảo UPDATE (khôi phục gia_tri_cu) + DELETE (tái tạo dòng đã xóa).
  for v_a in
    select * from audit_log a
    where a.thoi_gian = v_dx.updated_at and a.nguoi_thuc_hien = v_dx.nguoi_duyet
      and a.bang in ('congviec', 'chitiet', 'thuc_hien') and a.hanh_dong in ('UPDATE', 'DELETE')
    order by a.id asc
  loop
    if v_a.hanh_dong = 'UPDATE' then
      if v_a.bang = 'congviec' then
        update congviec c set
          chitiet_id = o.chitiet_id, loai_hoat_dong = o.loai_hoat_dong, thoi_gian = o.thoi_gian,
          tan_suat_chu = o.tan_suat_chu, tan_suat_so = o.tan_suat_so, active = o.active,
          hieu_luc_tu = o.hieu_luc_tu, hieu_luc_den = o.hieu_luc_den, ngay_loai_bo = o.ngay_loai_bo,
          thay_the_boi = o.thay_the_boi, updated_at = o.updated_at
        from jsonb_populate_record(null::congviec, v_a.gia_tri_cu) o
        where c.id = v_a.ban_ghi_id;
      elsif v_a.bang = 'chitiet' then
        update chitiet c set
          thietbi_id = o.thietbi_id, stt = o.stt, ten_chi_tiet = o.ten_chi_tiet,
          dieu_kien_co_ban = o.dieu_kien_co_ban, updated_at = o.updated_at
        from jsonb_populate_record(null::chitiet, v_a.gia_tri_cu) o
        where c.id = v_a.ban_ghi_id;
      elsif v_a.bang = 'thuc_hien' then
        update thuc_hien t set
          congviec_id = o.congviec_id, ngay = o.ngay, ke_hoach = o.ke_hoach, ket_qua = o.ket_qua,
          nguoi_thuc_hien = o.nguoi_thuc_hien, updated_at = o.updated_at
        from jsonb_populate_record(null::thuc_hien, v_a.gia_tri_cu) o
        where t.id = v_a.ban_ghi_id::uuid;
      end if;
    else -- DELETE -> tái tạo dòng (giữ nguyên id từ gia_tri_cu)
      if v_a.bang = 'thuc_hien' then
        insert into thuc_hien select * from jsonb_populate_record(null::thuc_hien, v_a.gia_tri_cu);
      elsif v_a.bang = 'congviec' then
        insert into congviec select * from jsonb_populate_record(null::congviec, v_a.gia_tri_cu);
      elsif v_a.bang = 'chitiet' then
        insert into chitiet select * from jsonb_populate_record(null::chitiet, v_a.gia_tri_cu);
      end if;
    end if;
    v_reverted := v_reverted + 1;
  end loop;

  -- PASS B: đảo INSERT (xóa dòng vừa tạo), id DESC để xóa con trước cha.
  for v_a in
    select * from audit_log a
    where a.thoi_gian = v_dx.updated_at and a.nguoi_thuc_hien = v_dx.nguoi_duyet
      and a.bang in ('congviec', 'chitiet', 'thuc_hien') and a.hanh_dong = 'INSERT'
    order by a.id desc
  loop
    if v_a.bang = 'thuc_hien' then
      delete from thuc_hien where id = v_a.ban_ghi_id::uuid;
    elsif v_a.bang = 'congviec' then
      delete from congviec where id = v_a.ban_ghi_id;
    elsif v_a.bang = 'chitiet' then
      delete from chitiet where id = v_a.ban_ghi_id;
    end if;
    v_reverted := v_reverted + 1;
  end loop;

  -- Xóa hẳn đề xuất + ghi audit việc hoàn tác (giữ vết theo mô hình append-only).
  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('de_xuat_congviec', p_de_xuat_id::text, 'DELETE', to_jsonb(v_dx), null, current_msnv(),
          format('Hoàn tác duyệt (%s dòng đảo ngược)', v_reverted));
  delete from de_xuat_congviec where id = p_de_xuat_id;

  return jsonb_build_object('hoan_tac', true, 'so_dong', v_reverted);
end;
$$;

grant execute on function hoan_tac_duyet(uuid) to authenticated;
