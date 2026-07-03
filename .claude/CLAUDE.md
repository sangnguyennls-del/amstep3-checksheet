# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Google Apps Script web app ("Checksheet AM Bước 3") for PVCFC that digitizes a paper Autonomous Maintenance (AM) checksheet: operators mark daily Plan/Actual maintenance flags per device over a calendar month, admins manage users/device configs, and everything is persisted to a bound Google Spreadsheet (no external database).

The three source files form the entire app:
- [Code.js](Code.js) — all server-side logic (Apps Script functions callable from the client via `google.script.run`).
- [Index.html](Index.html) — page shell: Bootstrap 5 markup, CSS (including print/PDF export styles), modals.
- [Javascript.html](Javascript.html) — all client-side logic, injected into `Index.html` via `<?!= include('Javascript'); ?>`.

`Image/` and `Cil/` contain legacy reference spreadsheets/diagrams (source material the checksheet was digitized from) — not part of the running app.

## Commands

This project is pushed to Google Apps Script with `clasp` (already installed globally). There is no npm build, lint, or test setup.

```bash
clasp push          # upload local Code.js/Index.html/Javascript.html/appsscript.json to the Apps Script project
clasp pull           # pull the latest from Apps Script (do this before editing if the sheet-bound script may have changed server-side)
clasp open           # open the project in the Apps Script editor
clasp open --webapp  # open the deployed web app URL
clasp deploy         # create a new deployment (required for changes to reach the live web app URL — pushing alone updates HEAD only)
```

`.clasp.json` points at the bound script (`scriptId`). There is no local way to execute Apps Script code or run automated tests — verification means pushing and manually exercising the web app (or using the Apps Script editor's execution log).

## Architecture

### Request flow
`doGet()` in [Code.js](Code.js) renders `Index.html` as a template (`HtmlService.createTemplateFromFile`), which inlines `Javascript.html` via `include()`. All client→server calls go through `google.script.run.withSuccessHandler(...).withFailureHandler(...).<serverFunctionName>(...)` — there is no REST API, so every server capability is a plain top-level function in `Code.js`.

### Spreadsheet as database
The active spreadsheet is the entire backend. Sheets (created on demand if missing):
- **Config** — one row per checksheet task/line item: `[STT, Xưởng, Kíp, Nhân viên, Thiết bị, Cụm, Khu vực, Lãnh đạo, Trưởng ca, Nội dung, Tiêu chuẩn, Loại, Thời gian, TanSuấtChữ, TanSuấtSố]` (cols A–O). `getConfig()` returns raw rows for filtering; `getFullConfig()` returns the same data as objects with `rowIndex` for admin editing.
- **Users** — `[username, password, fullName, unit, role]`. Passwords are stored and compared in plaintext. Role is one of `""` (plain user), `Admin`, `AdminM` (super admin — the only role that can act during maintenance mode and grant the `AdminM` role).
- **Data** — one row per (month, task) combination. Col A = month (`MM/yyyy`), col B = `rowId` (`${device}_${stt}_${content}_${type}_${standard}` — this composite key is the row identity, not a numeric ID), cols C–H mirror task metadata, **cols I–AM (indices 8–38) are the 31 daily cells**, each stored as a `"Plan|Act"` string (Plan: `Y`/`N`; Act: `G` good / `R` not-good / `N` none), col AN (39) = last editor name, col AO (40) = last edit timestamp.
- **Images** — `[deviceName, driveUrlOrId]`, used to resolve an equipment diagram image per device (extracts a Drive file ID from the URL and rewrites it to a `lh3.googleusercontent.com` thumbnail link).
- **Logs** — append-only audit trail of saves (`timestamp, editor fullName, username, month, affected devices`), created lazily on first save.

`PropertiesService.getScriptProperties()` holds global settings, not sheet rows: `LOCK_DATE`, `MAINTENANCE_MODE`, `ENABLE_TIME_LIMIT`, `ENABLE_DEVICE_LOCK`, `ENABLE_LOCK_DATE`.

### Row identity and lookups
Nothing uses spreadsheet row numbers as a stable key for `Data` or `Config` matching from the client — instead a derived string key (`monthYear_rowId` for Data, `xưởng|cụm|thiết bị` grouping for Config in the admin UI) is built fresh on both read and write and matched by string equality. When adding fields that participate in this key, matching logic in both `getData`/`saveData` (Code.js) and `groupConfigs`/`renderTable` (Javascript.html) must stay in sync.

### Permission and time-lock model (duplicated client + server)
Three roles: plain user, `Admin`, `AdminM`. Editability of Plan vs Actual cells depends on: role, whether the row's assigned staff matches the logged-in user (`ENABLE_DEVICE_LOCK`), how the target month compares to the current month, and the configured lock-date/time-limit settings (`ENABLE_LOCK_DATE`, `LOCK_DATE`, `ENABLE_TIME_LIMIT`). This logic is implemented **twice**:
- Client-side in `App.loadData()` and `ChecksheetCell.applyTool()` in [Javascript.html](Javascript.html) — purely for UI affordance (hiding tools, blocking clicks).
- Server-side in `saveData()` in [Code.js](Code.js) — the actual authority; recomputes `isPlanEditable`/`isActEditable` per row and silently discards disallowed edits rather than erroring, and additionally enforces a ±4-day window around "today" for backfilling Actual values (bypassed only for admins or when `ENABLE_TIME_LIMIT` is off).

Any change to permission/lock rules must be made in both places, or the client will show controls the server then quietly ignores.

### Concurrency
`saveData`, `saveConfigAndUpdateEquipment`, and `deleteConfigRow` all take `LockService.getScriptLock()` (10–15s timeout) since Apps Script has no transactions and multiple operators can save simultaneously. `saveData` reads the full `Data` sheet into memory, computes per-row updates/appends, then writes updated rows individually (`updates`) and appends new ones in one batch (`appends`) — it never rewrites unrelated rows, to minimize the chance of clobbering concurrent edits from other devices.

### Client-side structure (Javascript.html)
Three objects plus one class, all attached to `window` implicitly via top-level `const`:
- **`ChecksheetCell`** — one instance per day-cell in the grid; owns a `<td>` split diagonally into a Plan triangle and Act triangle, colored via `bg-Y`/`bg-G`/`bg-R`/`bg-N`. Click position within the cell (upper-right vs lower-left of the diagonal) determines whether Plan or Act is being set. Supports `P4`/`P8` "auto-fill every N days" tools via an `onAutoFill` callback that mutates sibling cells in the same row.
- **`App`** — main controller: login/session (persisted to `localStorage` under `TPM_USER`, not a real server session), cascading filters (Xưởng → Kíp → Nhân viên → Thiết bị), grid rendering (`renderTable`, with rowspan-merging for repeated STT/Nội dung/Tiêu chuẩn), save, print/PDF export (`window.print()` with dedicated `@media print` CSS in Index.html, batch-printing multiple devices sequentially in `AdminCustom.printBatchStats`), notifications ("chuông" bell — missing plan / missing actual reminders), and an image-viewer modal (pan/zoom/rotate for equipment diagrams).
- **`Admin`** — CRUD for Users and Config sheets from the admin panel, plus system settings (lock date, toggles, maintenance mode).
- **`AdminCustom`** — Plan-completion statistics dashboard (`getPlanStats`) and bulk PDF printing across filtered devices.

### Localization
All UI text, comments, and sheet column semantics are in Vietnamese. Keep new user-facing strings and comments in Vietnamese for consistency with the existing code.

## Kiến trúc đích: Supabase + Cloudflare Pages (định hướng dự án mới)

Phần dưới đây mô tả kiến trúc đích đã được thiết kế chi tiết để migrate hệ thống GAS ở trên sang một stack không backend riêng, chi phí 0đ. Đây là tài liệu tham chiếu cho dự án mới — **chưa có code nào của phần này tồn tại trong repo hiện tại**.

### A. Nền tảng & hosting
- Frontend tĩnh (port lại từ `Index.html`/`Javascript.html`) deploy trên **Cloudflare Pages**.
- **Không có backend riêng.** Frontend gọi thẳng Supabase (Postgres + Auth + Storage + PostgREST tự sinh REST API + Realtime). Toàn bộ ràng buộc nghiệp vụ, phân quyền, khoá thời gian phải nằm trong Row Level Security (RLS) + Postgres function/trigger — vì code frontend tĩnh không giấu được secret hay logic như một backend server.
- **GitHub Actions** đảm nhiệm 2 việc mà GAS trước đây không cần lo: (1) ping định kỳ chống Supabase free-tier tạm ngưng project sau 7 ngày không hoạt động; (2) export dữ liệu định kỳ, thay cho cơ chế backup thủ công.
- Ảnh sơ đồ thiết bị: giữ nguyên dùng link Google Drive như hệ thống cũ (chưa chuyển sang Supabase Storage) để tiết kiệm dung lượng free tier.

### B. Schema Postgres — 3 cấp thay cho sheet `Config` phẳng
Sheet `Config` cũ gộp cả thông tin tổ chức (Xưởng/Kíp/Nhân viên/Lãnh đạo/Trưởng ca), thông tin thiết bị, và từng hạng mục kiểm tra vào một bảng phẳng 15 cột lặp lại trên mỗi dòng — đây là lý do `saveConfigAndUpdateEquipment` phải có tính năng "syncAll" thủ công để đồng bộ các dòng trùng thiết bị. Schema mới tách theo đúng phân cấp thực tế:

- **`THIETBI`** (thiết bị) — gộp cả sheet `Images` cũ + phân công phụ trách (đã xác nhận 1 người/1 thiết bị nên không cần bảng trung gian kiểu PHANCONG):
  `id, ma_thiet_bi (unique — cần chuẩn hoá để tránh lỗi gõ kiểu "E06109" vs "E006109"), ten_thiet_bi, cum, khu_vuc, xuong, kip, lanh_dao, truong_ca, nguoi_phu_trach (MSNV), anh_url (Google Drive)`.
- **`CHITIET`** (chi tiết/điểm cần chăm sóc, con của `THIETBI`) — mỗi dòng ứng với một điểm kiểm tra cụ thể trên thiết bị:
  `id (mã ổn định, vd CT00001), thietbi_id (FK), stt, ten_chi_tiet, dieu_kien_co_ban`.
  - `stt` là **số được đánh dấu trên sơ đồ hình ảnh thiết bị** (điểm kiểm tra số mấy trên hình), không phải số thứ tự dòng — vẫn là dữ liệu nghiệp vụ cần hiển thị đúng trên phiếu in, nhưng không tham gia vào bất kỳ khoá nào.
  - `ten_chi_tiet` = cột "Nội dung" trong `Config` cũ.
  - `dieu_kien_co_ban` = cột **"Tiêu chuẩn"** trong `Config` cũ, đổi tên cho đúng bản chất: đây là tiêu chí/điều kiện đạt của chi tiết, không phải loại hoạt động.
- **`CONGVIEC`** (từng loại hoạt động trên 1 chi tiết, con của `CHITIET`):
  `id (mã ổn định, vd CV00001), chitiet_id (FK), loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu, hieu_luc_den, ngay_loai_bo`.
  - `loai_hoat_dong` (Kiểm tra / Vệ sinh / Bôi trơn / Siết chặt) = cột **"Loại"** trong `Config` cũ — chính là giá trị được hiển thị dưới header **"TIÊU CHUẨN"** trên UI cũ (`Index.html`), dễ gây nhầm lẫn với `dieu_kien_co_ban` ở trên nếu không tách rõ hai khái niệm.
  - `active`/`hieu_luc_tu`/`hieu_luc_den`/`ngay_loai_bo`: xem mục C.

### C. Cơ chế "loại bỏ dần" để giảm giờ chăm sóc (đúng mục tiêu AM Step 3)
- Không xoá cứng `CONGVIEC` khi một hạng mục không còn cần thiết — dùng `active` (boolean) + `hieu_luc_tu`/`hieu_luc_den` (khoảng thời gian còn hiệu lực) + `ngay_loai_bo` (ngày chính thức loại bỏ).
- Sinh kế hoạch tháng chỉ lấy các `CONGVIEC` còn hiệu lực trong tháng đó.
- Đo được thời gian tiết kiệm bằng `SUM(thoi_gian × so_lan)` so sánh giữa các kỳ trước/sau khi loại bỏ hạng mục — số liệu chứng minh trực tiếp hiệu quả AM Step 3.

### D. `THUC_HIEN` — đổ dọc 31 cột sheet `Data` thành các dòng, lưu thưa
Sheet `Data` cũ nén cả tháng vào 31 cột cố định trên 1 dòng, mỗi ô là chuỗi `"Plan|Act"` (vd `"Y|G"`). Bảng mới:
`id, congviec_id (FK), ngay (ngày thực tế, không phải index 1–31), ke_hoach (boolean — cờ Y, tách riêng khỏi kết quả), ket_qua (enum 'G'/'R'/'N'), nguoi_thuc_hien (MSNV), created_at, updated_at`.
- `ke_hoach` (boolean) và `ket_qua` (enum) là 2 trường độc lập thay vì gộp chuỗi như cũ: `ket_qua` = `G` (đã làm, bình thường) / `R` (đã làm, có bất thường) / `N` (chưa/không có gì).
- **Chỉ lưu dòng có dữ liệu thật** — không tạo sẵn 31 dòng `"N|N"` mặc định mỗi tháng như sheet `Data` hiện tại làm.

### E. `BAT_THUONG` — quản lý bất thường (mới, đưa vào ngay pha 1)
Đây chính là nghiệp vụ đứng sau việc tô một ô = `R` (không có ở hệ thống GAS hiện tại, vốn chỉ lưu mỗi màu ô).
`id, thuchien_id (FK → THUC_HIEN, UNIQUE — một ô THUC_HIEN gắn với 0–1 bản ghi bất thường), mo_ta, anh_url (tuỳ chọn), ngay_phat_hien, ngay_khac_phuc (để trống khi chưa xong), trang_thai (Mở / Đang xử lý / Đã đóng), nguoi_ghi (MSNV)`.

**Ràng buộc nghiệp vụ, chặn ở cả 2 tầng để dữ liệu không lệch:**
- `ket_qua = 'R'` ⇒ bắt buộc có đúng 1 bản ghi `BAT_THUONG` tương ứng.
- `ket_qua ≠ 'R'` ⇒ không được tạo bất thường mới.
- Tầng ứng dụng: tô ô = R sẽ bật popup nhập bất thường, ghi thẳng vào `BAT_THUONG`.
- Tầng database: constraint trigger dạng `DEFERRABLE INITIALLY DEFERRED` (kiểm tra lúc `COMMIT`, không phải ngay khi insert) đảm bảo mọi `THUC_HIEN` có `ket_qua='R'` đều có `BAT_THUONG` đi kèm trong cùng transaction; trigger trên `BAT_THUONG` chặn `INSERT` nếu `THUC_HIEN` tương ứng không phải `'R'`.
- **Giữ lịch sử:** nếu sau đó người dùng đổi ô từ `R` sang giá trị khác, bản ghi `BAT_THUONG` **không bị xoá** — chỉ đổi `trang_thai` — để không mất dấu vết một bất thường từng xảy ra.

**Hành vi giao diện (đặc tả UI, không phải bảng dữ liệu):**
- Tô ô = R → bật popup nhập bất thường.
- Lia chuột (hover) vào ô R → tooltip đọc lại `mo_ta` từ bản ghi `BAT_THUONG` tương ứng.
- Cả hai hành vi đọc/ghi thẳng vào bảng `BAT_THUONG`.

### F. `AUDIT_LOG` — nâng cấp sheet `Logs` thành audit khôi phục được
Sheet `Logs` cũ chỉ ghi "ai/khi nào/thiết bị nào" ở mức tóm tắt — không đủ để revert một giá trị cụ thể đã bị ghi đè. Cơ chế mới:
- Trigger Postgres trên `INSERT`/`UPDATE`/`DELETE` của `THUC_HIEN` và `BAT_THUONG`, ghi vào `AUDIT_LOG`: `bang, ban_ghi_id, hanh_dong, gia_tri_cu (jsonb), gia_tri_moi (jsonb), nguoi_thuc_hien, thoi_gian`.
- Nhờ lưu `jsonb` của cả dòng cũ/mới, có thể khôi phục chính xác giá trị đã mất — khắc phục đúng hạn chế của sheet `Logs` cũ.
- **Lưu ý vận hành:** audit ở mức từng ô sẽ phình rất nhanh — cần job định kỳ (GitHub Actions hoặc `pg_cron`) xuất-nén rồi xoá bản ghi cũ khỏi bảng, để không chạm trần 500 MB của Supabase free tier.

### G. Khoá ổn định thay cho ID ghép chuỗi
Hệ thống cũ dùng `rowId = ${thietBi}_${stt}_${noiDung}_${loai}_${tieuChuan}` làm khoá tra cứu (xem mục "Row identity and lookups" ở trên) — chỉ cần lỗi gõ (vd `E06109` vs `E006109`) hoặc sửa một chữ trong mô tả là khoá đổi theo, làm mồ côi toàn bộ lịch sử `THUC_HIEN` đã chấm theo key cũ mà không có cảnh báo. Trong schema mới:
- `CHITIET` và `CONGVIEC` dùng mã ổn định dạng hiển thị được (`CT00001`, `CV00001`) làm định danh chính, độc lập với nội dung text — sửa mô tả chỉ là `UPDATE` một cột, không ảnh hưởng gì tới dữ liệu `THUC_HIEN` đã có.
- `stt` (số đánh trên sơ đồ) không tham gia bất kỳ khoá nào nữa — chỉ còn vai trò hiển thị đúng vị trí trên phiếu in.
- Khi migrate dữ liệu từ Sheet cũ: dùng một cột tạm lưu đúng chuỗi `rowId` cũ để script di trú đối chiếu 1 lần theo `monthYear + rowId cũ`, có thể bỏ cột này sau khi verify xong.

### H. Auth & phân quyền
- Bỏ sheet `Users` lưu mật khẩu plaintext (xem mục "Spreadsheet as database" ở trên) → dùng **Supabase Auth** (băm mật khẩu chuẩn, session thật thay cho việc lưu object user vào `localStorage`).
- Bảng `NGUOIDUNG` lưu thêm MSNV, họ tên, đơn vị, vai trò, liên kết `auth.users.id`.
- Toàn bộ phân quyền Admin/User + quy tắc khoá thời gian sửa Plan/Actual (xem mục "Permission and time-lock model" ở trên) chuyển hẳn vào **Row Level Security** — vì không còn backend riêng để giấu logic. Đây cũng là cách hợp nhất logic hiện đang **trùng lặp** ở client (`App.loadData`, `ChecksheetCell.applyTool`) và server (`saveData`) của hệ thống GAS cũ về một nguồn chân lý duy nhất.

### I. Hoãn sang pha 2 — không đổi cấu trúc bảng ngay bây giờ
- Tự sinh kế hoạch theo tần suất + lịch ca (cần thêm bảng `LICH_CA`) để lại pha sau. Pha 1 vẫn để người phụ trách tick tay cờ `ke_hoach`, đúng như cách sheet `Data` đang vận hành.
- Vì `ke_hoach` đã tách sẵn thành trường riêng trong `THUC_HIEN` từ pha 1 (mục D), khi làm tính năng tự sinh ở pha 2 sẽ không cần sửa lại cấu trúc bảng.

### J. Mapping hàm server cũ (`Code.js`) → thao tác Supabase mới
| Hàm cũ | Tương ứng ở kiến trúc mới |
|---|---|
| `checkLogin` | Supabase Auth sign-in |
| `getData` / `saveData` | SELECT/UPSERT trực tiếp `THUC_HIEN` qua PostgREST, chịu kiểm soát bởi RLS |
| `getUsers` / `saveUser` / `deleteUser` / `changeUserPassword` | Supabase Auth Admin API + bảng `NGUOIDUNG` |
| `getFullConfig` / `saveConfigAndUpdateEquipment` / `deleteConfigRow` | CRUD trên `THIETBI` / `CHITIET` / `CONGVIEC` |
| `getSystemSettings` / `updateSystemSettings` / `setMaintenanceMode` | Bảng `CAI_DAT` (key-value, thay `PropertiesService`) |
| `getPlanStats` / `getNotifications` | View hoặc Postgres function tính từ `THUC_HIEN` + `CONGVIEC` |
