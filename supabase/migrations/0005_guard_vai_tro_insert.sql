-- Pha 3 (fix review "Important"): fn_guard_vai_tro_change (0002) chỉ khai
-- báo `before update on nguoidung` -- không bao giờ chạy khi INSERT, nên
-- hàng rào DB duy nhất chặn Admin thường tự cấp role 'adminm' cho người
-- khác là check app-level trong createUser (src/app/actions/users.ts).
-- Nếu check đó bị refactor/xoá nhầm trong tương lai, sẽ không còn backstop
-- nào ở tầng DB cho đường INSERT. Migration này bổ sung backstop đó.
--
-- Đầu vào cần cân nhắc: khi tg_op = 'INSERT' thì `old` là NULL, nên
-- `new.vai_tro is distinct from old.vai_tro` của thân hàm cũ tự nhiên đúng
-- với mọi giá trị vai_tro khác NULL -- KHÔNG cần đổi logic đó. Nhưng nhánh
-- "not current_role_is_admin() -> raise exception" của thân hàm cũ KHÔNG
-- thể áp dụng y nguyên cho INSERT:
--
--   * Với INSERT do PostgREST trực tiếp (role authenticated/anon, không
--     qua Server Action): RLS policy `nguoidung_insert` (0003) đã yêu cầu
--     current_role_is_admin() = true để pass với check, nên nhánh guard
--     "not admin -> reject" ở trigger là thừa (không sai, nhưng không cần)
--     cho đường này -- và một Admin thường (không phải AdminM) VẪN pass
--     được RLS đó, nên guard adminm-escalation trong trigger vẫn cần thiết
--     làm lớp phòng thủ thứ 2 cho chính xác trường hợp review đã chỉ ra.
--
--   * Với INSERT do createUser (Server Action) qua service-role client
--     (createAdminClient, xem 0004 comment): kết nối này KHÔNG có JWT/
--     auth.uid() context (PostgREST chạy `SET ROLE service_role`, không
--     có request.jwt.claims), nên current_role_is_admin() luôn trả false
--     -- nếu áp y nguyên nhánh "not admin -> reject" cho INSERT, chính
--     luồng tạo user hợp lệ (role 'user'/'admin' bình thường) của
--     createUser sẽ bị trigger từ chối oan. RLS không chặn được đường này
--     vì service_role có BYPASSRLS -- nhưng đây cũng là lý do đường INSERT
--     qua service-role không cần trigger chặn "not admin": chỉ Server
--     Action createUser (đã tự requireAdmin() ở tầng ứng dụng) mới cầm
--     được service-role key, không có đường PostgREST công khai nào dùng
--     được key này.
--
-- Kết luận: với INSERT, chỉ giữ lại guard "adminm-escalation" (không giữ
-- guard "not admin -> reject" chung), và bỏ qua guard adminm đó riêng khi
-- kết nối thực sự là service_role (current_user = 'service_role') -- đây
-- là lớp phòng thủ 2 cho đường authenticated/anon INSERT trực tiếp (Admin
-- thường lách RLS để tự chèn dòng adminm), không phải để chặn service-role
-- vốn đã được app-level check (createUser) gác trước đó.
create or replace function fn_guard_vai_tro_change() returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.vai_tro is distinct from old.vai_tro then
      if not current_role_is_admin() then
        raise exception 'Không có quyền đổi vai trò người dùng';
      end if;
      if new.vai_tro = 'adminm' and not current_role_is_adminm() then
        raise exception 'Chỉ AdminM mới được cấp quyền AdminM';
      end if;
    end if;
  elsif tg_op = 'INSERT' then
    if new.vai_tro = 'adminm'
       and current_user <> 'service_role'
       and not current_role_is_adminm() then
      raise exception 'Chỉ AdminM mới được cấp quyền AdminM';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_vai_tro_change on nguoidung;

create trigger trg_guard_vai_tro_change
before insert or update on nguoidung
for each row execute function fn_guard_vai_tro_change();
