# Việc 2 — Luồng đề xuất "Thêm hạng mục" trên checksheet

> Spec thiết kế. Ngày: 2026-07-18. Trạng thái: đã duyệt hướng đi (phương án ①),
> chờ review chi tiết trước khi lập kế hoạch thực thi.

## 1. Bối cảnh

Hệ thống đã có luồng **đề xuất → duyệt** cho **Sửa** (`sua`) và **Loại bỏ**
(`loai_bo`) một công việc ngay trên `/checksheet` (migration 0013 + 0016):
người phụ trách thiết bị đề xuất kèm lý do, thay đổi chỉ có hiệu lực sau khi
Admin/AdminM cùng Nhóm duyệt; Admin tự đề xuất thì áp dụng ngay. Hiệu lực luôn
từ **đầu tháng sau** để không đụng tháng đã bắt đầu.

Cái còn thiếu: **người dùng thường không tự đề xuất THÊM hạng mục được** — hiện
chỉ Admin thêm trực tiếp ở `/admin/equipment/[id]` (`createChiTiet` /
`createCongViec`). Việc 2 bổ sung đúng luồng đề xuất "Thêm" song song với
sửa/loại bỏ.

Mô hình dữ liệu 3 cấp: **THIẾT BỊ** → **CHI TIẾT** (điểm kiểm tra trên sơ đồ:
`stt`, `ten_chi_tiet`, `dieu_kien_co_ban`) → **CÔNG VIỆC** (loại hoạt động:
Kiểm tra / Vệ sinh / Bôi trơn / Siết chặt, kèm `thoi_gian`, `tan_suat_chu`,
`tan_suat_so`, `hieu_luc_tu/den`, `active`).

## 2. Mục tiêu

Người phụ trách thiết bị (và Admin) đề xuất **Thêm** ngay trên checksheet, hai
kiểu trong một modal:

- **(a) Thêm công việc vào chi tiết có sẵn** — chọn 1 chi tiết của thiết bị,
  nhập loại hoạt động + thời gian + tần suất.
- **(b) Thêm chi tiết mới** — tên chi tiết + điều kiện cơ bản + STT (tuỳ chọn)
  + công việc đầu tiên (loại hoạt động + thời gian + tần suất).

Đề xuất kèm **lý do bắt buộc**; được duyệt (hoặc admin tự đề xuất → áp dụng
ngay); hạng mục mới **hiệu lực từ đầu tháng sau**.

## 3. Không làm (Non-goals / YAGNI)

- **Không** thêm nhiều công việc cho một chi tiết mới trong một đề xuất — chi
  tiết mới tạo kèm **đúng một** công việc đầu tiên; công việc thứ hai trở đi
  dùng lại kiểu (a). Giữ modal + RPC đơn giản.
- **Không** cho admin sửa giá trị đề xuất trước khi duyệt — duyệt nguyên trạng
  (như `sua`/`loai_bo`); muốn tinh chỉnh thì sửa ở `/admin/equipment` sau khi
  duyệt (hạng mục đã thành `chitiet`/`congviec` thật).
- **Không** đổi phạm vi duyệt từ Nhóm sang gì khác (lằn ranh đỏ #1).
- **Không** cho hiệu lực ngay tháng hiện tại (đã chốt: đầu tháng sau).

## 4. Phương án lưu trữ (đã chốt: ① mở rộng `de_xuat_congviec`)

Dùng lại bảng `de_xuat_congviec` + hàng đợi `/admin/de-xuat` + RPC
`resolve_de_xuat_congviec` sẵn có, thay vì bảng riêng (nhân đôi RLS/RPC/hàng
đợi) hay nhét `jsonb` (kém tự-mô-tả). Chấp nhận bảng hơi "đa hình", trị bằng
CHECK constraint theo `loai_de_xuat`.

## 5. Thay đổi schema (migration mới, ví dụ `0019_de_xuat_them_hang_muc.sql`)

Trên bảng `de_xuat_congviec`:

- `alter column congviec_id drop not null` — đề xuất "Thêm" chưa có công việc
  đích. FK `on delete cascade` giữ nguyên (null thì không ràng buộc).
- Mở rộng CHECK: `loai_de_xuat in ('sua', 'loai_bo', 'them')`.
- Cột mới (đều nullable, chỉ dùng cho `them`):
  - `thietbi_id text references thietbi (id) on delete cascade` — thiết bị đích.
  - `chitiet_id text references chitiet (id) on delete cascade` — set khi **kiểu
    (a)** (thêm công việc vào chi tiết có sẵn); **null** khi **kiểu (b)** (tạo
    chi tiết mới).
  - `ten_chi_tiet_moi text`, `dieu_kien_co_ban_moi text`, `stt_moi int` — chỉ
    dùng khi kiểu (b).
  - `loai_hoat_dong_moi text` — loại hoạt động của công việc mới (cả (a) và (b)).
- Tái dùng `thoi_gian_moi`, `tan_suat_chu_moi`, `tan_suat_so_moi` cho công việc
  mới (đã có sẵn cho `sua`).
- CHECK ràng buộc tính toàn vẹn theo loại:
  - `sua`/`loai_bo` ⇒ `congviec_id is not null` và các cột `*_moi` của "Thêm"
    (`thietbi_id`, `loai_hoat_dong_moi`, `ten_chi_tiet_moi`...) để null.
  - `them` ⇒ `thietbi_id is not null` **và** `loai_hoat_dong_moi is not null`
    **và** đúng một trong hai: `chitiet_id is not null` (kiểu a) **XOR**
    `ten_chi_tiet_moi is not null` (kiểu b).
- Chống trùng đề xuất treo cho kiểu (a): partial unique index
  `(chitiet_id, loai_hoat_dong_moi) where loai_de_xuat = 'them' and chitiet_id
  is not null and trang_thai = 'Chờ duyệt'`. Kiểu (b) không có khoá tự nhiên →
  chấp nhận có thể trùng, admin từ chối bản dư (đề xuất là cộng thêm, không phá
  dữ liệu).

## 6. RPC (trong cùng migration)

Mọi hàm `security definer`, `set search_path = public`, `grant execute ... to
authenticated`, đúng khuôn các RPC hiện có.

### 6.1 Hàm quyền (soi theo THIẾT BỊ — vì "Thêm" chưa có `congviec_id`)

- `can_manage_thietbi(p_thietbi_id text) returns boolean` — mirror
  `can_manage_congviec`: `true` nếu admin/adminm, hoặc
  `thietbi.nguoi_phu_trach = current_msnv()`.
- `can_approve_thietbi_change(p_thietbi_id text) returns boolean` — mirror
  `can_approve_congviec_change`: adminm → true; admin → `nguoidung.kip =
  thietbi.kip`; khác → false.

### 6.2 Hàm dùng chung `create_hang_muc_moi(...)`

Tạo hạng mục thật, dùng chung cho cả đường **admin áp ngay** và đường **duyệt**
(giống cách `update_congviec_with_reason` được chia sẻ).

Tham số: `p_thietbi_id`, `p_chitiet_id` (null nếu tạo chi tiết mới),
`p_ten_chi_tiet`, `p_dieu_kien_co_ban`, `p_stt`, `p_loai_hoat_dong`,
`p_thoi_gian`, `p_tan_suat_chu`, `p_tan_suat_so`, `p_ly_do`.

Hành vi:
1. `v_effect := (date_trunc('month', today_vn()) + interval '1 month')::date`
   (đầu tháng sau — tính tại thời điểm áp dụng/duyệt).
2. Nếu `p_chitiet_id is null`: `insert into chitiet (thietbi_id, stt,
   ten_chi_tiet, dieu_kien_co_ban) values (...)` **không truyền id** (DB tự cấp
   `CTxxxxx`), lấy `returning id` → dùng làm `chitiet_id`. Ghi audit_log INSERT
   chitiet.
   - Nếu có `p_chitiet_id`: xác thực chi tiết thuộc đúng `p_thietbi_id` (chống
     ghép chéo thiết bị).
3. `insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu,
   tan_suat_so, active, hieu_luc_tu) values (..., true, v_effect)` **không
   truyền id** (DB tự cấp `CVxxxxx`). Ghi audit_log INSERT congviec (kèm
   `p_ly_do`).
4. Trả `jsonb` mô tả kết quả (`chitiet_id`, `congviec_id`, `hieu_luc_tu`).

Không tạo sẵn `thuc_hien` — đúng nguyên tắc "chỉ lưu ô có dữ liệu thật".

### 6.3 `propose_them_hang_muc(...)` (RPC mới, checksheet gọi)

Tham số như `create_hang_muc_moi` (trừ việc tự lấy người đề xuất =
`current_msnv()`).

1. Validate: `p_ly_do` không rỗng; `p_loai_hoat_dong` không rỗng; đúng một
   trong `p_chitiet_id` / `p_ten_chi_tiet`.
2. Gate `can_manage_thietbi(p_thietbi_id)` — nếu không: raise "Không có quyền
   đề xuất thêm hạng mục cho thiết bị này".
3. Nếu `current_role_is_admin()` → gọi `create_hang_muc_moi(...)` ngay, trả
   `{ applied: true, result }`.
4. Ngược lại: `insert into de_xuat_congviec (loai_de_xuat='them', thietbi_id,
   chitiet_id, ten_chi_tiet_moi, dieu_kien_co_ban_moi, stt_moi,
   loai_hoat_dong_moi, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi, ly_do,
   nguoi_de_xuat)`; bắt `unique_violation` → "Đang có đề xuất thêm công việc
   này chờ duyệt". Ghi audit_log INSERT de_xuat. Trả `{ applied: false,
   de_xuat_id }`.

### 6.4 Mở rộng `resolve_de_xuat_congviec` (`create or replace`)

Thêm nhánh `loai_de_xuat = 'them'`:
- Gate `can_approve_thietbi_change(v_de_xuat.thietbi_id)` (thay cho
  `can_approve_congviec_change` vốn soi theo `congviec_id` null).
- Khi `duyet`: gọi `create_hang_muc_moi(...)` với các cột `*_moi` của đề xuất;
  cập nhật `trang_thai='Đã duyệt', nguoi_duyet, updated_at`; audit_log UPDATE.
- Khi `tu_choi`: như cũ (lý do từ chối bắt buộc).

Hai nhánh `sua`/`loai_bo` giữ nguyên.

### 6.5 RLS

`create or replace policy de_xuat_congviec_select`: thêm điều kiện —
`using (nguoi_de_xuat = current_msnv() or can_approve_congviec_change(congviec_id)
or can_approve_thietbi_change(thietbi_id))`. Không có điều kiện thietbi thì
admin **không thấy** đề xuất "Thêm" (vì `congviec_id` null → hàm cũ trả false).

## 7. UI

### 7.1 Checksheet (`ChecksheetApp` + bảng thiết bị)

- Nút **"+ Đề xuất thêm hạng mục"** đặt cuối bảng của thiết bị đang chọn, chỉ
  hiện khi `selectedThietBi.nguoiPhuTrach === currentUser.msnv` **hoặc** người
  dùng là admin (gợi ý client; RPC là chốt thật).
- Mở `ThemHangMucModal` (component mới), khuôn responsive giống
  `EditCongViecModal`/`BatThuongModal` — **mobile-friendly** (kiểm ở viewport
  hẹp).

### 7.2 `ThemHangMucModal`

- Radio chọn kiểu: **(a) Thêm vào chi tiết có sẵn** / **(b) Chi tiết mới**.
- Kiểu (a): dropdown chi tiết của thiết bị — dựng từ `rows` (CongViecRow) đã
  load, gom theo `chiTietId` (không cần query thêm). Ô: loại hoạt động, thời
  gian, tần suất (chữ + số).
- Kiểu (b): ô tên chi tiết, điều kiện cơ bản, STT (tuỳ chọn), + loại hoạt động,
  thời gian, tần suất cho công việc đầu tiên.
- Lý do bắt buộc (validate client trước; RPC vẫn tự chặn).
- Gọi `supabase.rpc('propose_them_hang_muc', {...})`. `applied=true` → thông
  báo "Đã thêm, hiệu lực từ tháng sau"; `applied=false` → "Đã gửi đề xuất, chờ
  duyệt" (dùng đúng cơ chế thông báo/banner sẵn có mà `EditCongViecModal` +
  `ChecksheetApp` đang dùng qua callback `onSuccess`, không thêm thư viện toast
  mới). Không mutate lưới tháng hiện tại (hạng mục mới thuộc tháng sau).

### 7.3 `/admin/de-xuat`

- `getDeXuatCongViecList`: đổi `congviec!inner (...)` → **left join** để dòng
  `them` (congviec_id null) không bị loại; bổ sung join/echo các cột `*_moi` +
  `thietbi (ma_thiet_bi, ten_thiet_bi)` + `chitiet (ten_chi_tiet)` cho kiểu (a).
- Danh sách: badge **"Thêm"**; cột "Thay đổi" mô tả nội dung mới (chi tiết mới:
  tên + điều kiện + STT + công việc; hoặc "+ công việc vào «chi tiết»"). Dùng
  lại `RowResolveForm` (Duyệt/Từ chối) không đổi.
- Type `DeXuatCongViecItem` + `LOAI_DE_XUAT_LABEL` thêm `them`.

### 7.4 Server Action / types

- `resolveDeXuatCongViec` (đã có) không đổi — RPC tự phân nhánh theo loại.
- Nếu cần đọc chi tiết thiết bị cho dropdown, tái dùng dữ liệu `rows` sẵn có,
  tránh thêm truy vấn.

## 8. Tuân thủ lằn ranh đỏ (`docs/VIEC-KHONG-DUOC-LAM.md`)

- #4: hạng mục mới dùng `hieu_luc_tu` (không dùng `active=false`).
- #6: không UPDATE/DELETE `thuc_hien` lịch sử (chỉ INSERT chitiet/congviec mới).
- #8: id `CTxxxxx`/`CVxxxxx` tự sinh từ sequence, không khoá chuỗi ghép.
- #9: quyền/khoá ở RPC/RLS; client chỉ ẩn/hiện.
- #10: modal mobile-friendly; chụp màn hình trước/sau cho thay đổi UI.

## 9. Kiểm thử / nghiệm thu

- **Migration**: áp trên nhánh dev; kiểm CHECK constraint chặn đúng (thiếu cột
  bắt buộc theo loại → lỗi), partial unique chặn trùng đề xuất kiểu (a).
- **RPC** (dùng tài khoản test người dùng cấp, kỷ luật đọc/ghi tối thiểu, dọn
  sau khi test hoặc test trên bản ghi nháp):
  - Người phụ trách đề xuất kiểu (a) & (b) → tạo dòng "Chờ duyệt", chưa xuất
    hiện trên lưới tháng này.
  - Người phụ trách thiết bị **khác Nhóm mình** đề xuất → bị RPC chặn.
  - Admin cùng Nhóm duyệt → `chitiet`/`congviec` mới sinh với `hieu_luc_tu`
    đầu tháng sau; lưới **tháng sau** hiện hạng mục, **tháng này** không.
  - Admin tự đề xuất → áp dụng ngay (`applied=true`).
  - Admin khác Nhóm (không AdminM) không thấy/không duyệt được (RLS + RPC).
- **UI**: chụp màn hình trước/sau modal + hàng đợi (desktop + mobile viewport).
- `npm run build` + lint sạch (bỏ qua lỗi có sẵn `BatThuongModal.tsx:55`).

## 10. Rủi ro / lưu ý

- Left join ở hàng đợi có thể lẫn dòng `sua`/`loai_bo` mồ côi nếu công việc bị
  xoá cứng — hiếm; hiển thị "—" an toàn.
- STT trùng trên cùng thiết bị: `stt` chỉ để hiển thị (không phải khoá), không
  ràng buộc unique — chấp nhận, admin chỉnh ở `/admin/equipment`.
- Đề xuất kiểu (b) treo qua tháng: hiệu lực tính lúc duyệt + 1 tháng, nhất quán
  bất biến 0016.
