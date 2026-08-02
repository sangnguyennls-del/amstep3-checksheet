# Việc KHÔNG được làm — Checksheet AM Bước 3

> Danh sách "lằn ranh đỏ" đã chốt. Trước khi refactor/migration/xoá gì, đọc file này. Bối cảnh từng mục xem [QUYET-DINH.md](QUYET-DINH.md).

1. **Không xoá/đổi nghĩa cột `kip`** (cả `thietbi.kip` lẫn `nguoidung.kip`) và **không đổi phạm vi duyệt đề xuất từ Kíp sang Nhóm nhỏ** — `can_approve_congviec_change` so `nguoidung.kip` với `thietbi.kip`; Kíp dành cho lịch ca (pha 2). Bỏ Kíp chỉ là bỏ khỏi UI checksheet.
2. **Không drop cột `nguoidung.don_vi`** — chỉ bỏ khỏi UI/form; migration 0014 còn tham chiếu lịch sử.
3. **Không hard-delete `thietbi`/`chitiet`/`congviec`** trong luồng nghiệp vụ thường — FK `on delete cascade` sẽ xoá sạch `thuc_hien` (mất lịch sử chấm). Hard-delete chỉ dành cho nút Xoá chủ đích của admin (đã có cảnh báo).
   - *Ngoại lệ đã chốt (đợt 6):* `hoan_tac_duyet` (migration 0024) — rollback 1 đề xuất ĐÃ DUYỆT — CÓ xoá dòng `congviec` vừa tạo (kế nhiệm của 'sửa'; congviec/chitiet của 'thêm'). Đây là sửa lỗi có chủ đích của Trưởng ca, và **an toàn vì**: `thuc_hien` được đảo ngược (move về dòng cũ / tái tạo dòng đã xoá) TRƯỚC khi xoá, + guard chặn hoàn tác nếu đã có thay đổi/chấm công mới sau lúc duyệt, + ghi `audit_log` việc hoàn tác. Không mở rộng hard-delete ra ngoài phạm vi này.
4. **Không dùng `active=false` cho nghiệp vụ "loại bỏ dần"** — `active=false` = ẩn hẳn khỏi mọi tháng (đường admin thủ công). Loại bỏ từ tháng sau phải dùng `hieu_luc_den`. Đừng "sửa gọn" RPC về lại active=false.
5. **Không áp quy tắc hiệu-lực-tháng-sau cho trang `/admin/equipment`** — admin cần đường sửa lỗi nhập liệu có hiệu lực ngay (quyết định 2026-07-13).
6. **Không UPDATE/DELETE dữ liệu `thuc_hien` lịch sử** trong migration (trừ việc dời ô tương-lai sang dòng kế nhiệm trong RPC sửa công việc — chỉ `ngay >= đầu tháng sau`).
7. **Không reset mật khẩu tài khoản `adminm`** trong script reset hàng loạt.
8. **Không thêm khoá tra cứu dạng chuỗi ghép nội dung** (kiểu `rowId` của hệ GAS cũ) — mọi liên kết dùng id ổn định (`CVxxxxx`, `CTxxxxx`, uuid).
9. **Không sửa quyền chỉ ở client** — mọi thay đổi quy tắc quyền/khoá thời gian phải nằm ở RPC/RLS (nguồn chân lý duy nhất); client chỉ ẩn/hiện UI theo `get_editability`.
10. **UI mới phải mobile-friendly** và **thay đổi UI lớn phải chụp màn hình trước/sau** trước khi báo hoàn tất (quy tắc bắt buộc trong `.claude/CLAUDE.md`).
11. **Không commit secrets** — `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL` chỉ nằm trong `.env.local` (script đọc từ đó), không hardcode vào script/tài liệu.
