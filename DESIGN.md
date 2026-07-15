# Phong cách giao diện — bám bản GAS/Bootstrap cũ

## Quyết định (2026-07-15)

App **tái hiện giao diện hệ GAS cũ (Bootstrap 5)** mà operator đã quen dùng, **dựng bằng Tailwind**.

**Vì sao:** hệ thống cũ đang chạy thực tế ngoài hiện trường; đổi sang gu khác làm operator phải học lại. Người dùng đã yêu cầu quay về giao diện cũ.

**Vì sao KHÔNG nạp Bootstrap thật:** cả app viết bằng Tailwind; nhét thêm 1 framework CSS nữa sẽ xung đột reset/utility, nặng trang, lỗi khó lường. Tailwind tái hiện được y hệt.

> ⚠️ **Đừng "sửa ngược" về gu Apple.** Trước đây repo có `apple-DESIGN.md` (accent `#0066cc`, chữ near-black `#1d1d1f`, nền parchment `#f5f5f7`, nút bo tròn pill). Quyết định đó **đã bị thay thế**. File này thay cho nó.

## Bảng token

| Vai trò | Giá trị |
|---|---|
| Accent chính | `#0d6efd` (hover `#0b5ed7`, active `#0a58ca`) |
| Chữ / `currentColor` | `#212529` |
| Chữ phụ | `#6c757d` |
| Nền trang | `#f8f9fa` |
| Viền chung | `#dee2e6` |
| Viền input | `#ced4da` |
| Nguy hiểm | `#dc3545` (hover `#bb2d3b`) |
| Cảnh báo / dòng tổng | nền `#fff3cd`, chữ `#664d03` |
| Thành công | `#198754` |
| Bo góc | `rounded-md` (= 0.375rem, đúng Bootstrap) — **không dùng `rounded-full` cho nút** |
| Focus | `ring-4 ring-<màu>/25` |
| Font | system stack (khai báo ở `globals.css`) — **không dùng Geist Sans** |

## Nơi sửa

- **[src/lib/ui.ts](src/lib/ui.ts)** — nguồn chân lý cho input/button/card/label/nav. Được dùng ~151 lần ở 15 file ⇒ **sửa ở đây là lan ra toàn app**. Ưu tiên dùng `ui.*` thay vì viết class thô.
- **[src/app/globals.css](src/app/globals.css)** — `--background`, `--foreground`, `--bs-*`, font.

## Bẫy đã mắc — đọc trước khi sửa CSS

**Tailwind v4 để class `border` trơn (không kèm màu) = `currentColor`**, khác v3 (mặc định xám nhạt). Vì `--foreground` là màu chữ gần-đen nên mọi `border` trơn sẽ ra **viền gần-đen**. Đây chính là gốc lỗi "đường kẻ dọc đen ở cột 28" trên bản in PDF: khung bọc bảng có viền near-black, bảng in tràn qua khung → viền phải cắt ngang bảng.

⇒ **Luôn ghi màu viền tường minh** (`border border-[#dee2e6]`), không bao giờ để `border` đứng một mình.

## Không được đụng

- **`src/app/checksheet/checksheet.module.css`** — màu ô `bgY/bgG/bgR/bgN` (vàng/xanh/đỏ) là quy ước nghiệp vụ trên mẫu giấy.
- **`src/app/checksheet/print.css` + `printFit.ts`** — phiếu in đã căn vừa đúng 1 trang A3 với biên rất mỏng (đo thật: 1479×903 → hệ số 0.971 → 1436×877, dư ~3% bề ngang). Đổi font/độ dày/kích thước chữ **sẽ đổi kích thước bản in** → phải đo lại, xem mục Verification trong lịch sử kế hoạch.
