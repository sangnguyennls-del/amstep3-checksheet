-- Đợt 4 (#3): lịch sử thay đổi của 1 THIẾT BỊ, xem ngay trong tab checksheet
-- để đối chiếu. audit_log chỉ Admin đọc trực tiếp (RLS audit_log_select 0003)
-- -> cần RPC security definer để mọi người phụ trách cũng xem được lịch sử
-- thiết bị mình đang mở (nhất quán mô hình đọc mở của lưới checksheet).
--
-- Gom "cả hai" loại (theo yêu cầu người dùng):
--   * Cấu hình: chitiet / congviec INSERT/UPDATE (thêm/sửa/loại bỏ hạng mục).
--   * Chấm công: thuc_hien INSERT/UPDATE/DELETE (ai chấm ô nào, cũ -> mới).
-- Kèm họ tên người thực hiện (join nguoidung) -- KHÔNG để trơ MSNV.
--
-- CEILING (ponytail): dòng thuc_hien đã bị DELETE không còn để join theo bảng
-- hiện tại -> mất khỏi nhật ký. Chấp nhận (đa số là INSERT/UPDATE); nếu cần
-- đầy đủ tuyệt đối phải soi audit_log thô ở /admin.
create function get_thietbi_lich_su(p_thietbi_id uuid, p_limit int default 200)
returns table (
  thoi_gian timestamptz,
  bang text,
  hanh_dong text,
  gia_tri_cu jsonb,
  gia_tri_moi jsonb,
  nguoi_msnv text,
  nguoi_ten text,
  ly_do text
)
language sql stable security definer set search_path = public as $$
  with ct as (select id from chitiet where thietbi_id = p_thietbi_id),
       cv as (select id from congviec where chitiet_id in (select id from ct)),
       th as (select id from thuc_hien where congviec_id in (select id from cv))
  select
    a.thoi_gian,
    a.bang,
    a.hanh_dong,
    a.gia_tri_cu,
    a.gia_tri_moi,
    a.nguoi_thuc_hien as nguoi_msnv,
    nd.ho_ten as nguoi_ten,
    a.ly_do
  from audit_log a
  left join nguoidung nd on nd.msnv = a.nguoi_thuc_hien
  where
    (a.bang = 'chitiet' and a.ban_ghi_id in (select id from ct))
    or (a.bang = 'congviec' and a.ban_ghi_id in (select id from cv))
    or (a.bang = 'thuc_hien' and a.ban_ghi_id in (select id::text from th))
  order by a.thoi_gian desc
  limit greatest(1, coalesce(p_limit, 200));
$$;

-- Hàm này security definer, KHÔNG có kiểm tra danh tính bên trong (chỉ lọc
-- theo thiết bị) -> nếu để anon gọi được thì người CHƯA đăng nhập cũng đọc
-- được lịch sử. Thu hồi anon/public, chỉ cấp authenticated (nhớ bài học hosted
-- Supabase: phải revoke anon tường minh, không chỉ public).
revoke execute on function get_thietbi_lich_su(uuid, int) from public, anon;
grant execute on function get_thietbi_lich_su(uuid, int) to authenticated;
