# Nhật ký quyết định — Checksheet AM Bước 3

> File "bộ nhớ dự án": mỗi quyết định nghiệp vụ/kỹ thuật đã chốt với chủ dự án được ghi lại ở đây kèm ngày và lý do, để các phiên làm việc sau không hỏi lại/không làm ngược. Xem thêm [VIEC-KHONG-DUOC-LAM.md](VIEC-KHONG-DUOC-LAM.md) và [CAU-HOI-MO.md](CAU-HOI-MO.md).

## 2026-07-13 — Thay đổi công việc có hiệu lực từ tháng sau, CHỈ áp dụng luồng đề xuất → duyệt

- **Quyết định:** Sửa/Xoá công việc từ trang checksheet (nút Sửa/Xoá, kể cả khi admin bấm — đi qua `propose_congviec_change` / `resolve_de_xuat_congviec` → `update_congviec_with_reason` / `remove_congviec_with_reason`) luôn có hiệu lực từ **đầu tháng sau**; checksheet các tháng cũ giữ nguyên dòng và dữ liệu đã chấm.
- **Không áp dụng** cho trang `/admin/equipment` — admin vẫn sửa trực tiếp có hiệu lực ngay (kèm ô nhập `hieu_luc_tu/den` thủ công), làm đường sửa lỗi nhập liệu.
- **Cách làm:** không dùng `active=false` để loại bỏ nữa — dùng `hieu_luc_den` = cuối tháng duyệt; sửa giá trị = đóng dòng cũ + tạo dòng kế nhiệm (`thay_the_boi`) hiệu lực đầu tháng sau. Đề xuất treo qua tháng: tháng hiệu lực tính theo **thời điểm duyệt** + 1 tháng.
- **Lý do:** khớp lời hứa sẵn có trên UI ("sẽ ngừng hiện trên checksheet từ tháng sau"), bảo toàn lịch sử tháng cũ đúng yêu cầu AM Step 3 (đo giờ tiết kiệm giữa các kỳ).

## 2026-07-13 — Reset mật khẩu hàng loạt về `123456`, trừ AdminM

- **Quyết định:** script service-role reset mật khẩu mọi tài khoản `user` + `admin` về `123456`; **giữ nguyên mật khẩu các tài khoản `adminm`** để không tự khoá cửa quản trị cao nhất.
- Script chạy tay, mặc định dry-run, có `--commit`; không đưa vào UI.

## 2026-07-13 — Backfill "Nhóm nhỏ" cho thiết bị theo người phụ trách

- **Quyết định:** `thietbi.nhom` (đang NULL toàn bộ vì migration 0014 chỉ đổ dữ liệu phía `nguoidung`) được backfill = `nhom` của nhân viên đang đứng tên `nguoi_phu_trach`.
- **Lý do:** thiết bị thuộc nhóm nhỏ của người chăm sóc nó; bộ lọc Nhóm hoạt động ngay với dữ liệu hiện có. Admin vẫn sửa tay được qua form thiết bị.

## 2026-07-13 — Bỏ Kíp khỏi bộ lọc/hiển thị checksheet, giữ Kíp trong DB

- **Quyết định:** tab checksheet bỏ dropdown lọc Kíp và dòng thông tin Kíp; cột `kip` trong DB giữ nguyên — tiếp tục dùng cho phạm vi duyệt đề xuất (`can_approve_congviec_change`) và tính năng lịch ca (pha 2).

## 2026-07-13 — Chuẩn in PDF checksheet

- **Quyết định:** in A3 ngang, mặc định vừa **1 trang/thiết bị** (tự thu nhỏ khi nhiều dòng), đủ toàn bộ cột ngày; bỏ cột Auto và Thao tác khi in; cột "Người chịu trách nhiệm" dời khỏi bảng lên header (cạnh Khu vực/Trưởng ca); tên file mặc định `Checksheet-<mã thiết bị>-<MMyyyy>` (vd `Checksheet-B07601-072026`).
