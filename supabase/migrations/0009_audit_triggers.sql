-- Pha 8 (Task 1): trigger AFTER ghi audit_log cho THUC_HIEN/BAT_THUONG.
-- Bảng audit_log đã có schema từ Pha 1 (0001_schema.sql) nhưng chưa có
-- trigger nào ghi vào đó -- migration này là lần đầu audit_log thực sự
-- hoạt động. Xem CLAUDE.md mục F + docs/plans/pha8-audit-cron.md.
--
-- 1 hàm dùng chung 2 bảng (giống mẫu fn_set_updated_at ở 0002), SECURITY
-- DEFINER (giống mẫu fn_guard_vai_tro_change ở 0002) để luôn ghi được vào
-- audit_log bất kể vai trò/role của người gọi gốc -- audit_log không có
-- INSERT policy nào cho role thường (0003_rls_policies.sql), chỉ trigger
-- SECURITY DEFINER mới ghi được.

create function fn_audit_log_change() returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien)
  values (
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id::text else new.id::text end,
    TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end,
    current_msnv()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_audit_thuc_hien
after insert or update or delete on thuc_hien
for each row execute function fn_audit_log_change();

create trigger trg_audit_bat_thuong
after insert or update or delete on bat_thuong
for each row execute function fn_audit_log_change();
