# Câu hỏi mở — chờ chủ dự án chốt

> Những việc đã nhìn thấy nhưng CHƯA quyết. Khi chốt được mục nào: chuyển kết luận sang [QUYET-DINH.md](QUYET-DINH.md) và xoá khỏi đây.

1. **Tên thiết bị trùng mã** — nhiều thiết bị có `ten_thiet_bi === ma_thiet_bi` (di sản migrate từ Sheet, hiển thị kiểu "B07601 - B07601"). UI đã sửa để chỉ hiện mã, nhưng về lâu dài có nhập bổ sung tên thật cho các thiết bị này không? Ai cung cấp danh sách tên?
2. **Chuẩn hoá `nguoidung.kip`** — đang là text tự do nhập tay ("1", "Kип 1", "Kíp 1"…), trong khi `thietbi.kip` chuẩn "Kíp 1".."Kíp 4". Có ép format (dropdown cố định) khi nhập user không? Ảnh hưởng trực tiếp phạm vi duyệt đề xuất theo Kíp.
3. **Bắt buộc đổi mật khẩu lần đầu** — sau khi reset hàng loạt về `123456`, có bắt user đổi mật khẩu ở lần đăng nhập kế tiếp không (cần thêm cờ `must_change_password`)? Hiện tại chỉ có chức năng đổi mật khẩu tự nguyện.
4. **Pha 2 — lịch ca & tự sinh kế hoạch** — bảng `LICH_CA` + tự sinh cờ `ke_hoach` theo tần suất và ca kíp: khi nào bắt đầu? (`ke_hoach` đã là trường riêng nên không phải đổi schema.)
5. **Purge `audit_log` định kỳ** — script `scripts/audit/exportAndPurge.ts` đã có nhưng đã lên lịch chạy tự động (GitHub Actions) chưa? Trần 500 MB của Supabase free tier sẽ tới nhanh khi audit ghi theo từng ô.
6. **Dọn đề xuất "Chờ duyệt" quá hạn** — đề xuất treo lâu (người duyệt quên) có tự nhắc/tự hết hạn không, hay để treo vô thời hạn như hiện tại?
