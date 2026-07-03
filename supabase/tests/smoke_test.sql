-- Smoke test thủ công (không dùng pgTAP) cho các hàm nghiệp vụ cốt lõi của
-- Pha 1. Chạy bằng:
--   docker exec -i supabase_db_AMStep3_Ver2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/smoke_test.sql
-- Mọi assert dùng RAISE EXCEPTION nếu sai để dừng ngay và báo rõ rule nào fail.
-- Test chạy trong 1 transaction rồi ROLLBACK, không để lại dữ liệu rác.

begin;

do $$
declare
  v_user1 uuid := gen_random_uuid();
  v_user2 uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_adminm uuid := gen_random_uuid();
  v_thietbi_id uuid;
  v_chitiet_id text;
  v_congviec_id text;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_this_month date := date_trunc('month', v_today)::date;
  v_next_month date := (date_trunc('month', v_today) + interval '1 month')::date;
  v_last_month date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_result boolean;
begin
  -- Fixtures: 4 auth.users giả lập user1 (chủ thiết bị), user2 (người khác), admin, adminm.
  insert into auth.users (id, email) values
    (v_user1, 'user1@test.local'),
    (v_user2, 'user2@test.local'),
    (v_admin, 'admin@test.local'),
    (v_adminm, 'adminm@test.local');

  -- Fixture v_adminm có vai_tro='adminm' ngay từ đầu, chạy dưới current_user
  -- 'postgres' (không phải service_role) và chưa có JWT context -- từ 0005,
  -- trigger INSERT guard sẽ chặn đúng như thiết kế. Tắt trigger tạm thời chỉ
  -- cho câu insert fixture này (tương đương seed data), bật lại ngay sau đó;
  -- không ảnh hưởng gì tới các assert thật sự kiểm tra guard bên dưới.
  alter table nguoidung disable trigger trg_guard_vai_tro_change;
  insert into nguoidung (id, msnv, ho_ten, vai_tro) values
    (v_user1, 'NV001', 'Nguyen Van A', 'user'),
    (v_user2, 'NV002', 'Tran Van B', 'user'),
    (v_admin, 'NV999', 'Admin Test', 'admin'),
    (v_adminm, 'NV998', 'AdminM Test', 'adminm');
  alter table nguoidung enable trigger trg_guard_vai_tro_change;

  insert into thietbi (ma_thiet_bi, ten_thiet_bi, nguoi_phu_trach)
  values ('TEST-001', 'May test', 'NV001')
  returning id into v_thietbi_id;

  insert into chitiet (thietbi_id, stt, ten_chi_tiet)
  values (v_thietbi_id, 1, 'Diem test')
  returning id into v_chitiet_id;

  insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian)
  values (v_chitiet_id, 'Kiểm tra', 5)
  returning id into v_congviec_id;

  -- Giả lập request.jwt.claim.sub để các hàm current_msnv()/current_role_is_admin() nhận đúng auth.uid().
  perform set_config('request.jwt.claims', json_build_object('sub', v_user1::text)::text, true);

  -- Rule 2: chủ thiết bị, tháng tương lai -> Plan editable, Actual không.
  if not can_edit_plan(v_congviec_id, v_next_month) then
    raise exception 'FAIL rule2: chủ thiết bị phải sửa được Plan tháng tương lai';
  end if;
  if can_edit_act_base(v_congviec_id, v_next_month) then
    raise exception 'FAIL rule2: chủ thiết bị KHÔNG được sửa Actual tháng tương lai';
  end if;

  -- Rule 2: chủ thiết bị, tháng hiện tại -> cả Plan (trước lock date) và Actual đều editable.
  if not can_edit_plan(v_congviec_id, v_this_month) then
    raise exception 'FAIL rule2: Plan tháng hiện tại phải sửa được (mặc định LOCK_DATE=5, trước ngày 5 hoặc ENABLE_LOCK_DATE tắt)';
  end if;
  if not can_edit_act_base(v_congviec_id, v_this_month) then
    raise exception 'FAIL rule2: Actual tháng hiện tại luôn sửa được';
  end if;

  -- Rule 2: tháng trước -> Plan luôn khoá.
  if can_edit_plan(v_congviec_id, v_last_month) then
    raise exception 'FAIL rule2: Plan tháng đã qua phải bị khoá';
  end if;

  -- Rule 2: không phải thiết bị của mình -> khoá cả hai (ENABLE_DEVICE_LOCK mặc định bật).
  perform set_config('request.jwt.claims', json_build_object('sub', v_user2::text)::text, true);
  if can_edit_plan(v_congviec_id, v_this_month) then
    raise exception 'FAIL rule2: người khác không được sửa Plan khi ENABLE_DEVICE_LOCK bật';
  end if;
  if can_edit_act_base(v_congviec_id, v_this_month) then
    raise exception 'FAIL rule2: người khác không được sửa Actual khi ENABLE_DEVICE_LOCK bật';
  end if;

  -- Rule 2: Admin bỏ qua mọi ràng buộc kể cả không phải thiết bị của mình.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  if not (can_edit_plan(v_congviec_id, v_last_month) and can_edit_act_base(v_congviec_id, v_last_month)) then
    raise exception 'FAIL rule2: Admin phải bỏ qua mọi ràng buộc thời gian/thiết bị';
  end if;

  -- Rule 3: cửa sổ +-4 ngày cho Actual (chủ thiết bị, giá trị đổi thật, ENABLE_TIME_LIMIT bật mặc định).
  perform set_config('request.jwt.claims', json_build_object('sub', v_user1::text)::text, true);
  if not can_edit_act(v_congviec_id, v_today, 'N', 'G') then
    raise exception 'FAIL rule3: sửa Actual đúng hôm nay phải luôn được phép';
  end if;
  if can_edit_act(v_congviec_id, v_today + 10, 'N', 'G') then
    raise exception 'FAIL rule3: sửa Actual cách hôm nay 10 ngày phải bị chặn (ngoài ±4 ngày)';
  end if;
  if not can_edit_act(v_congviec_id, v_today + 10, 'G', 'G') then
    raise exception 'FAIL rule3: giá trị không đổi phải luôn được phép bất kể cửa sổ ngày';
  end if;

  -- Rule 5: Admin thường không được cấp role adminm; AdminM thì được.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  begin
    update nguoidung set vai_tro = 'adminm' where id = v_user2;
    raise exception 'FAIL rule5: Admin thường không được cấp quyền AdminM (lẽ ra phải raise exception)';
  exception when others then
    if sqlerrm not like '%Chỉ AdminM%' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_adminm::text)::text, true);
  update nguoidung set vai_tro = 'adminm' where id = v_user2;
  if (select vai_tro from nguoidung where id = v_user2) <> 'adminm' then
    raise exception 'FAIL rule5: AdminM phải cấp được quyền AdminM cho người khác';
  end if;

  -- BAT_THUONG: insert bat_thuong khi thuc_hien cha không phải 'R' phải bị chặn.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user1::text)::text, true);
  declare
    v_th_id uuid;
  begin
    insert into thuc_hien (congviec_id, ngay, ke_hoach, ket_qua)
    values (v_congviec_id, v_today, true, 'G')
    returning id into v_th_id;

    begin
      insert into bat_thuong (thuchien_id, mo_ta) values (v_th_id, 'test');
      raise exception 'FAIL rule_bat_thuong: không được tạo BAT_THUONG khi THUC_HIEN không phải R';
    exception when others then
      if sqlerrm not like '%không ở trạng thái R%' then
        raise;
      end if;
    end;
  end;

  -- set_ket_qua_r_with_bat_thuong: đường hợp lệ phải tạo đồng thời cả hai, deferred trigger pass khi COMMIT.
  perform set_ket_qua_r_with_bat_thuong(v_congviec_id, v_today + 1, 'Rung bat thuong khi kiem tra');
  if (select ket_qua from thuc_hien where congviec_id = v_congviec_id and ngay = v_today + 1) <> 'R' then
    raise exception 'FAIL: set_ket_qua_r_with_bat_thuong phải set ket_qua=R';
  end if;
  if not exists (
    select 1 from bat_thuong bt join thuc_hien th on th.id = bt.thuchien_id
    where th.congviec_id = v_congviec_id and th.ngay = v_today + 1
  ) then
    raise exception 'FAIL: set_ket_qua_r_with_bat_thuong phải tạo BAT_THUONG tương ứng';
  end if;

  -- Pha 3 fix (0005): guard adminm phải chặn cả INSERT, không chỉ UPDATE.
  -- Trước 0005, trigger chỉ khai báo `before update` nên INSERT thẳng 1 dòng
  -- vai_tro='adminm' sẽ lọt qua (không có backstop DB nào, chỉ có app-level
  -- check trong createUser). Giả lập 1 Admin thường (không phải AdminM,
  -- current_user vẫn là 'postgres' trong test này chứ không phải
  -- 'service_role' nên guard adminm trong 0005 phải áp dụng).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  declare
    v_user3 uuid := gen_random_uuid();
  begin
    insert into auth.users (id, email) values (v_user3, 'user3@test.local');
    begin
      insert into nguoidung (id, msnv, ho_ten, vai_tro)
      values (v_user3, 'NV003', 'Le Van C', 'adminm');
      raise exception 'FAIL rule5b: Admin thường không được INSERT thẳng dòng vai_tro=adminm (lẽ ra phải raise exception)';
    exception when others then
      if sqlerrm not like '%Chỉ AdminM%' then
        raise;
      end if;
    end;
  end;

  raise notice 'TAT CA ASSERT PHA 1 DEU PASS';
end $$;

rollback;
