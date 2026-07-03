-- Smoke test RLS thực sự dưới role `authenticated` (postgres superuser bỏ
-- qua RLS nên test business-rule ở smoke_test.sql không phát hiện được lỗ
-- hổng policy). Chạy:
--   docker exec -i supabase_db_AMStep3_Ver2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_smoke_test.sql

begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_thietbi_id uuid;
  v_chitiet_id text;
  v_congviec_id text;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner@test.local'),
    (v_other, 'other@test.local');

  insert into nguoidung (id, msnv, ho_ten, vai_tro) values
    (v_owner, 'RLS001', 'Chu thiet bi', 'user'),
    (v_other, 'RLS002', 'Nguoi khac', 'user');

  insert into thietbi (ma_thiet_bi, ten_thiet_bi, nguoi_phu_trach)
  values ('RLS-TEST-001', 'May test RLS', 'RLS001')
  returning id into v_thietbi_id;

  insert into chitiet (thietbi_id, stt, ten_chi_tiet)
  values (v_thietbi_id, 1, 'Diem test RLS')
  returning id into v_chitiet_id;

  insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian)
  values (v_chitiet_id, 'Kiểm tra', 5)
  returning id into v_congviec_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other::text)::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into thuc_hien (congviec_id, ngay, ke_hoach) values (v_congviec_id, v_today, true);
    raise exception 'FAIL RLS: nguoi khong phu trach thiet bi khong duoc INSERT thuc_hien';
  exception when insufficient_privilege or others then
    if sqlerrm not like '%row-level security%' and sqlerrm not like '%FAIL RLS%' then
      raise;
    end if;
    if sqlerrm like '%FAIL RLS%' then
      raise;
    end if;
  end;

  -- RLS USING clause trên UPDATE không raise lỗi khi không khớp -- nó chỉ
  -- khiến câu lệnh cập nhật 0 dòng (không phải exception), nên phải kiểm
  -- tra lại giá trị sau đó thay vì trông chờ exception.
  update thietbi set ten_thiet_bi = 'Hacked' where id = v_thietbi_id;
  if (select ten_thiet_bi from thietbi where id = v_thietbi_id) = 'Hacked' then
    raise exception 'FAIL RLS: user thuong khong duoc sua THIETBI nhung da sua duoc';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  insert into thuc_hien (congviec_id, ngay, ke_hoach) values (v_congviec_id, v_today, true);
  if not exists (select 1 from thuc_hien where congviec_id = v_congviec_id and ngay = v_today) then
    raise exception 'FAIL RLS: chu thiet bi phai INSERT thuc_hien duoc qua policy';
  end if;

  raise notice 'TAT CA ASSERT RLS DEU PASS';

  perform set_config('role', 'postgres', true);
end $$;

rollback;
