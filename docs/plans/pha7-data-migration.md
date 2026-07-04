# Pha 7 — Script migrate dữ liệu thật từ Google Sheet cũ

## Bối cảnh (đọc kỹ trước khi bắt đầu bất kỳ task nào)

File nguồn thật đã được xuất ra: **`D:\Sang\Work\PVCFC\AM\AM Step 3.xlsx`** (toàn bộ spreadsheet cũ, xuất bằng File → Download → xlsx từ Google Sheets). Toàn bộ nội dung dưới đây được rút ra từ việc **thực sự đọc và phân tích file này** (không phải suy đoán từ tài liệu kiến trúc) — có một số khác biệt quan trọng so với mô tả trừu tượng trong `.claude/CLAUDE.md`, đã được xác minh bằng dữ liệu thật.

### Danh sách sheet và sheet PHẢI BỎ QUA

File có 10 sheet, chỉ dùng 6 sheet, bỏ qua 4 sheet còn lại:

| Sheet | Dùng? | Ghi chú |
|---|---|---|
| `Config` | ✅ Dùng | 4448 dòng, nguồn CHITIET/CONGVIEC/tổ chức thiết bị |
| `Bản sao của Config - 120625` | ❌ Bỏ qua | Bản backup cũ |
| `Users` | ✅ Dùng | 998 dòng, nhưng chỉ **58 dòng thật** (xem bên dưới) |
| `Images` | ✅ Dùng | 149 dòng, `Thiết bị` + `URL` Drive |
| `Thiết bị ` | ✅ Dùng | **CHÚ Ý dấu cách cuối tên sheet** (`"Thiết bị "`, 9 ký tự) — danh sách đầy đủ 169 thiết bị (chỉ 1 cột mã, không có tên hiển thị/tổ chức) |
| `Logs` | ✅ Dùng | 2324 dòng bao gồm header → **2323 dòng dữ liệu thật** (số đã sửa sau khi Task 1 đo trực tiếp; "2324" ban đầu đếm nhầm gồm cả header) |
| `Bản sao của Logs` | ❌ Bỏ qua | Bản backup cũ |
| `Data` | ✅ Dùng | 10678 dòng (10585 dòng thật, xem bên dưới), lưới chấm công 31 ngày |
| `Query` | ❌ Bỏ qua | 59 dòng device→caretaker — đã hỏi người dùng, xác nhận đây chỉ là sheet nháp, KHÔNG dùng để suy ra `nguoi_phu_trach` |
| `Bản sao của Data` | ❌ Bỏ qua | Bản backup cũ |

### ⚠️ Sheet `Data`: header row bị SAI, không khớp nội dung thật

Đây là phát hiện quan trọng nhất — **ĐỪNG tin nhãn cột trong dòng header của sheet `Data`**. Header ghi:
`["Tháng/Năm","Xưởng","Kíp","Tên","Thiết bị","Tên chi tiết","Điều Kiện cơ bản","Tiêu chuẩn","1","2",...,"31"]`

Nhưng nội dung THẬT theo vị trí cột (đã xác minh bằng cách đối chiếu giá trị với enum Loại đã biết và với sheet `Config`) là:

| Cột (0-based) | Header ghi (SAI) | Nội dung THẬT |
|---|---|---|
| 0 | Tháng/Năm | Tháng/Năm ✅ đúng (vd `"03/2026"`) |
| 1 | Xưởng | **rowId cũ** dạng `${thietBi}_${stt}_${noiDung}_${loai}_${dieuKien}` (đúng như CLAUDE.md mục G mô tả "col B = rowId", chỉ là header bị gõ nhầm thành "Xưởng") |
| 2 | Kíp | **Xưởng** (vd `"Ure"`) |
| 3 | Tên | Tên (người phụ trách) ✅ đúng vị trí, khớp cột "Tên" của Config |
| 4 | Thiết bị | Thiết bị ✅ đúng |
| 5 | Tên chi tiết | Tên chi tiết ✅ đúng |
| 6 | Điều Kiện cơ bản | **Loại hoạt động** (Kiểm tra/Vệ sinh/Bôi trơn/Siết chặt — chính là cột "Tiêu chuẩn" của Config) |
| 7 | Tiêu chuẩn | **Điều kiện cơ bản** (text mô tả điều kiện đạt) |
| 8..38 | 1..31 | 31 ngày, mỗi ô `"Plan|Actual"` (Plan: Y/N, Actual: G/R/N) ✅ đúng vị trí |
| 39 | (trống) | Tên người chỉnh sửa cuối |
| 40 | (trống) | Thời gian chỉnh sửa cuối (thường rỗng) |

**Script phải đọc theo VỊ TRÍ CỘT đã xác minh ở trên, không dựa vào text header.**

**rowId cũ (cột 1) ĐÔI KHI SAI/CŨ** — đã kiểm chứng: trong 10540 dòng có Loại hợp lệ, chỉ 10453 dòng có rowId-cũ khớp đúng với Loại thật ở cột 6 (87 dòng lệch, tức rowId cũ là dữ liệu copy-paste còn sót từ mẫu trước, không cập nhật theo Loại thật). **KHÔNG dùng rowId cũ để match sang CONGVIEC** — chỉ dùng giá trị các cột HIỆN TẠI (thiết bị, tên chi tiết, điều kiện, loại) để tìm CONGVIEC tương ứng. rowId cũ chỉ lưu vào cột `legacy_row_id` (đã có sẵn từ Pha 1) để tham khảo/đối chiếu thủ công sau này, không dùng trong logic match.

Sheet `Config` thì header ĐÚNG hoàn toàn với nội dung (đã xác minh), dùng trực tiếp:
`[STT(0), Xưởng(1), Kíp(2), Tên(3), Thiết bị(4), Cụm Thiết bị(5), Khu vực(6), Lãnh đạo xưởng(7), Trưởng ca(8), Tên chi tiết(9), Điều Kiện cơ bản(10), Tiêu chuẩn(11, =Loại hoạt động), Thời gian(12), Tần suất(13), Tần suất - n(14)]`

### Chất lượng dữ liệu — các vấn đề đã xác minh và cách xử lý

1. **Users**: 998 dòng nhưng 940 dòng có MSNV rỗng (dòng đệm trống của Google Sheet, không phải user thật) — **chỉ lấy 58 dòng có MSNV khác rỗng**. Vai trò: 8 "Admin", 1 "AdminM", 49 "User" (dịch: `Admin→admin`, `AdminM→adminm`, `User`/rỗng→`user`). **Tên (cột `Name`) là duy nhất trong 58 người** (đã kiểm tra, không trùng) — dùng làm khoá tra cứu người→MSNV khi suy ra `nguoi_phu_trach` từ Config (Config chỉ lưu TÊN người, không lưu MSNV).
   - **1 ngoại lệ không giải quyết được**: Config có 1 giá trị "Tên" là `"Dương Văn Hào"` KHÔNG tồn tại trong 58 user thật (không có tài khoản). Với các thiết bị mà người phụ trách suy ra là người này, để `nguoi_phu_trach = null` và ghi log cảnh báo rõ ràng trong báo cáo cuối — không throw lỗi dừng script, không tự bịa MSNV.
   - **Mật khẩu**: cột `Password` lưu plaintext — **KHÔNG mang sang hệ mới**. Toàn bộ 58 tài khoản dùng **chung 1 mật khẩu tạm** (theo quyết định người dùng) lấy từ biến môi trường bắt buộc `MIGRATION_TEMP_PASSWORD` (không hardcode trong code, không commit git) — người dùng tự đổi sau khi đăng nhập lần đầu, hệ thống hiện KHÔNG có tính năng "bắt buộc đổi mật khẩu lần đầu" nên KHÔNG cần xây dựng thêm (ngoài phạm vi Pha 7).
   - **Username cho Auth = cột `User`** (vd `"vanvv"`, `"phuongnh"`) — **KHÔNG dùng MSNV** — khớp đúng với `usernameToEmail()` (`src/lib/auth/username.ts`) và luồng `createUser` (`src/app/actions/users.ts`) đã build ở Pha 3: 2 trường `username` và `msnv` tách biệt, `msnv` chỉ là metadata lưu trong `nguoidung`, KHÔNG dùng để build email. Điều này giữ đúng thói quen đăng nhập cũ bằng username quen thuộc, tốt hơn cả CLAUDE.md dự tính (CLAUDE.md ghi email dạng `${msnv}@pvcfc.internal` nhưng code THẬT ĐÃ BUILD dùng `${username}@pvcfc.internal` — làm theo code thật đang chạy, không theo văn bản kế hoạch cũ).

2. **Config**: 148 thiết bị duy nhất. Các trường tổ chức theo thiết bị (**Xưởng, Kíp, Cụm, Khu vực, Lãnh đạo, Trưởng ca, Tên**) **nhất quán 100% trong cùng 1 thiết bị** (đã kiểm tra toàn bộ 148 thiết bị, 0 xung đột) — an toàn để suy ra 1 giá trị duy nhất mỗi trường cho THIETBI.
   - **104 nhóm trùng lặp hoàn toàn (117 dòng dư)** (cùng thiết bị+nội dung+điều kiện+loại) trong tổng **3331 tổ hợp CONGVIEC** duy nhất trên 3448 dòng Config thật — khi build CHITIET/CONGVIEC, **dedupe theo (thietbi, ten_chi_tiet, dieu_kien_co_ban, loai)**, giữ STT nhỏ nhất nếu trùng. (Số đã sửa sau khi Task 1 đo trực tiếp — bản phân tích ban đầu ghi nhầm "3332 tổ hợp / 105 dòng trùng"; số liệu ở đây là số liệu chuẩn, tự nhất quán: 3331 + 117 = 3448.)
   - **Task 1 phát hiện thêm 1 vấn đề khớp dữ liệu KHÔNG có trong phân tích ban đầu**: cùng 1 `dieu_kien_co_ban` được Config ghi CÓ `\n` giữa các câu nhưng Data ghi KHÔNG có `\n` (chỉ cách nhau bằng dấu cách) — nếu so khớp nguyên văn sẽ coi là 2 điều kiện khác nhau, gây ~649 orphan giả. Đã xử lý bằng cách thu gọn mọi khoảng trắng liên tiếp (kể cả xuống dòng) thành 1 dấu cách trước khi dùng `ten_chi_tiet`/`dieu_kien_co_ban` làm khoá dedupe/match, áp dụng cho CẢ Config lẫn Data.
   - **13 thiết bị trong Config KHÔNG có trong danh sách đầy đủ (sheet "Thiết bị ")** — đã phân tích kỹ từng trường hợp (xem bảng "Bảng xử lý mã ghép" bên dưới).

3. **Data**: 10678 dòng, 92 dòng hoàn toàn trống (Tháng/Năm rỗng — dòng đệm) → **10585 dòng thật**, trải 5 tháng (`03/2026` đến `07/2026`).
   - **1 thiết bị `M07601`** xuất hiện trong Data nhưng KHÔNG có trong Config (0 dòng Config) → 3 dòng Data của nó **toàn bộ là `"N|N"`** (không có dữ liệu thật) → **bỏ qua hoàn toàn**, không tạo THIETBI/CHITIET/CONGVIEC/THUC_HIEN cho thiết bị này (không có gì để migrate).
   - **Giá trị Loại (cột 6) cần chuẩn hoá**: 45 dòng ghi `"Kiêm tra"` (lỗi chính tả) → sửa thành `"Kiểm tra"`; 24+8 dòng ghi `"vệ sinh"` (viết thường) → sửa thành `"Vệ sinh"`. Áp dụng chuẩn hoá này cho CẢ Config lẫn Data trước khi so khớp/enum-check. Enum hợp lệ sau chuẩn hoá: `["Kiểm tra", "Vệ sinh", "Bôi trơn", "Siết chặt"]`.
   - Định dạng ô ngày đã xác minh đúng 5 giá trị: `N|N, N|G, Y|N, Y|G, Y|R` (Plan Y/N ở trái, Actual G/N/R ở phải) — parse độc lập: `ke_hoach = (trái === "Y")`, `ket_qua = phải` (phải là 1 trong `G/N/R`, khác thì log cảnh báo và coi như `N`).
   - **CHỈ tạo THUC_HIEN cho ô KHÁC `"N|N"`** (đúng nguyên tắc lưu thưa của schema mới).
   - Cột người chỉnh sửa cuối (cột 39, TÊN không phải MSNV) dùng để suy ra `nguoi_thuc_hien` qua bảng tra cứu Tên→MSNV (từ Users) — nếu rỗng hoặc không tra được, để `null`.
   - **Phát hiện thêm ở Task 1 (không có trong phân tích ban đầu)**: sheet `Data` luôn có đúng 31 cột ngày cố định (1..31) bất kể tháng đó có bao nhiêu ngày thật — tháng `06/2026` chỉ có 30 ngày nhưng cột "31" của tháng đó có **594 ô mang dữ liệu thật khác `"N|N"`** (nghi do tool tự động tô Plan mỗi N ngày của hệ cũ không kiểm tra số ngày thật trong tháng). Đây là ngày KHÔNG tồn tại trên lịch thật — **không được tạo THUC_HIEN với ngày giả** (không tự gán sang ngày 30 hay ngày 1 tháng sau). **Quyết định xử lý**: ghi các dòng này vào bảng `legacy_orphan_thuc_hien` với `ly_do = "Ngày không hợp lệ (thángNăm, ngày 31)"` — giữ lại để admin rà soát/quyết định thủ công sau, KHÔNG âm thầm loại bỏ khỏi model và cũng KHÔNG tự suy đoán ngày thay thế — nhất quán với nguyên tắc chung của Pha 7 "không bao giờ bỏ âm thầm" (mục G CLAUDE.md).

4. **Thiết bị đầy đủ (sheet "Thiết bị ")**: 169 thiết bị, chỉ có mã, KHÔNG có tên hiển thị riêng → **`ten_thiet_bi = ma_thiet_bi`** cho mọi thiết bị migrate (không có nguồn nào khác để suy ra tên đẹp hơn; admin có thể tự sửa sau qua `/admin/equipment` đã build ở Pha 3).
   - **34 thiết bị chỉ có trong danh sách đầy đủ, KHÔNG có trong Config** (chưa từng có checksheet) → **theo đúng yêu cầu người dùng**: tạo THIETBI với mọi trường tổ chức = `null`, **`nguoi_phu_trach = null`** (không tự gán, để admin gán sau).

5. **Images**: mỗi dòng là `(mã thiết bị, URL Drive dạng chia sẻ)`. Đã xác minh trong code hiện tại (`EquipmentImageModal.tsx`): app lưu **URL GỐC** vào `thietbi.anh_url` và tự resolve sang `lh3.googleusercontent.com` LÚC HIỂN THỊ (hàm `toDriveImageSrc`) — script **chỉ copy nguyên URL gốc**, KHÔNG cần tự resolve.

### Bảng xử lý 13 mã thiết bị ghép/không khớp trong Config (đã xác minh từng trường hợp bằng cách tra cứu thật vào sheet "Thiết bị ")

Người dùng đã chọn **"tách thành từng thiết bị riêng"** khi có thể — nhưng đã kiểm tra bằng dữ liệu thật và **KHÔNG PHẢI cả 13 trường hợp đều tách an toàn được** (một số mã con sau khi tách KHÔNG tồn tại trong danh sách đầy đủ, tách liều sẽ tạo ra thiết bị "ma" sai lệch dữ liệu). Bảng dưới đây là kết quả cuối cùng đã xác minh — **hard-code chính xác bảng này trong code**, KHÔNG viết logic tách tự động bằng regex (rủi ro tách sai các trường hợp tương lai không có trong danh sách này):

| Mã trong Config | Xử lý | Thiết bị con (đã xác minh tồn tại trong "Thiết bị ") |
|---|---|---|
| `E06119-E06120-E06121` | Tách | `E06119`, `E06120`, `E06121` |
| `KT06101 - K06101` | Tách | `KT06101`, `K06101` |
| `T06104-P06116AB` | Tách | `T06104`, `P06116A`, `P06116B` |
| `T07605-P07606` | Tách | `T07605`, `P07606` |
| `H07601,Z07602,V07604` | **KHÔNG tách** — giữ nguyên mã ghép làm 1 THIETBI | Danh sách đầy đủ có `H07601A/B`, `Z07602A/B`, `V07604A/B` (mỗi mã gốc tương ứng 2 thiết bị con) — ánh xạ 1-thành-2 không rõ ràng, không tự đoán. Ghi vào báo cáo để admin xử lý thủ công sau. |
| `T06105` | Giữ nguyên (không phải mã ghép) | Không có trong danh sách đầy đủ nhưng CÓ dữ liệu Config thật — vẫn tạo THIETBI với đầy đủ trường tổ chức suy từ Config (khác với case "34 thiết bị mới hoàn toàn" ở mục 4 — case này có lịch sử checksheet thật, không nên bỏ trống) |
| `T07604-E07604` | Tách | `T07604`, `E07604` |
| `Z06112, Z06113` | Tách | `Z06112`, `Z06113` |
| `E06116A/B` | Tách | `E06116A`, `E06116B` |
| `S06114/E06114/T06114` | **KHÔNG tách** — giữ nguyên mã ghép làm 1 THIETBI | Danh sách đầy đủ có 1 mã ghép khác cách viết: `"S06114/E14/T14"` — nghi là CÙNG 1 thiết bị vật lý nhưng viết tắt khác, không đủ chắc chắn để tự gộp. Ghi vào báo cáo để admin xử lý thủ công sau. |
| `E06124/E06125/E06126` | Tách (2 phần, không phải 3) | `E06124`, `"E06125/26"` — danh sách đầy đủ có `E06124` đứng riêng và `E06125/26` là 1 mã ghép có sẵn (không phải `E06125`/`E06126` tách rời) — tách đúng theo granularity thật của danh sách đầy đủ |
| `T06106` | Giữ nguyên (không phải mã ghép) | Giống case `T06105` |
| `E06118AB` | Tách | `E06118A`, `E06118B` |

**Khi TÁCH thành N thiết bị con**: mỗi thiết bị con là 1 THIETBI độc lập, thừa hưởng NGUYÊN VẸN toàn bộ trường tổ chức (Xưởng/Kíp/Cụm/Khu vực/Lãnh đạo/Trưởng ca/nguoi_phu_trach) từ dòng Config gốc. TOÀN BỘ CHITIET/CONGVIEC của mã ghép gốc được **nhân bản y hệt** cho từng thiết bị con (mỗi thiết bị con có bản CHITIET/CONGVIEC riêng, ID riêng, dù nội dung giống hệt nhau). THUC_HIEN lịch sử (từ Data, match theo mã ghép gốc) cũng được **nhân bản y hệt** vào THUC_HIEN của từng thiết bị con tương ứng (vì lịch sử chấm công cũ chỉ có 1 bản dùng chung cho cả nhóm, nay cần tồn tại độc lập theo từng thiết bị theo mô hình mới).

## Quyết định kỹ thuật: dùng `pg` kết nối thẳng Postgres, KHÔNG qua Supabase client/RPC cho dữ liệu nghiệp vụ

Đã xác nhận với người dùng: script dùng package `pg` (thêm mới) kết nối thẳng bằng connection string (`SUPABASE_DB_URL` — local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, lấy từ `npx supabase status`; production sau này lấy từ Supabase Dashboard → Settings → Database) cho MỌI thao tác ghi vào các bảng nghiệp vụ (`thietbi/chitiet/congviec/thuc_hien/bat_thuong/legacy_logs_import`).

**Lý do bắt buộc** (không phải chỉ để tiện): RPC `set_ket_qua_r_with_bat_thuong` (dùng cho ô Actual="R") gọi `can_edit_act()` bên trong — hàm này áp cửa sổ ±4 ngày dựa trên `today_vn()`, sẽ CHẶN mọi lần ghi cho ngày lịch sử (vài tháng trước) khi gọi qua ngữ cảnh không có JWT user thật (service-role qua PostgREST không có `auth.uid()`). Gọi trực tiếp `INSERT` qua `pg` trong 1 transaction thật (`BEGIN...COMMIT`) cho cả `thuc_hien` (ket_qua='R') và `bat_thuong` cùng lúc là cách DUY NHẤT thoả được ràng buộc `deferrable initially deferred` (`trg_thuc_hien_requires_bat_thuong`, `0002_functions_triggers.sql:272`) mà không bị chặn bởi kiểm tra quyền vốn thiết kế cho user tương tác thời gian thực.

**Auth users (Supabase Auth, bảng `auth.users`) VẪN PHẢI tạo qua `@supabase/supabase-js`'s `admin.auth.admin.createUser()`** (không thể INSERT thẳng bằng SQL — Auth cần hash mật khẩu đúng chuẩn GoTrue) — dùng SONG SONG cả `pg` (cho `public.*` tables) LẪN `@supabase/supabase-js` admin client (chỉ cho việc tạo tài khoản Auth) trong cùng script.

## Global Constraints (áp dụng cho MỌI task bên dưới)

- Chạy bằng Node trực tiếp (`node scripts/migrate/run.ts`) — dự án đã có tiền lệ chạy `.ts` trực tiếp bằng Node 24 (native TS support, xem các file `*.manual-test.ts` hiện có + `tsconfig.json`'s `allowImportingTsExtensions`), KHÔNG cần thêm `tsx`/`ts-node`.
- Toàn bộ code migrate nằm trong `scripts/migrate/` (thư mục mới), KHÔNG động vào `src/` (trừ khi thực sự cần export thêm 1 hàm dùng chung — nếu có, phải nêu rõ lý do).
- Package mới cần thêm vào `devDependencies` (không phải `dependencies` — script này không chạy trong app Next.js lúc runtime): `pg`, `@types/pg`. (`xlsx` đã có sẵn trong `devDependencies` từ việc khảo sát dữ liệu — giữ nguyên.)
- Biến môi trường script cần (đọc qua `process.env`, đọc từ `.env.local` bằng cách tự parse dòng đơn giản HOẶC yêu cầu người chạy `export` trước — không thêm dependency `dotenv` mới nếu không thực sự cần, `.env.local` đã tồn tại sẵn cho Next.js dùng, có thể tự viết 1 hàm nhỏ đọc file này):
  - `SUPABASE_DB_URL` (bắt buộc) — connection string Postgres trực tiếp.
  - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (đã có sẵn trong `.env.local`) — dùng cho `createAdminClient`-kiểu client CHỈ để gọi `auth.admin.createUser()`.
  - `MIGRATION_XLSX_PATH` (bắt buộc) — đường dẫn file `.xlsx` nguồn (không hardcode đường dẫn `D:\Sang\...` trong code, luôn đọc từ env để script chạy được trên máy khác/CI).
  - `MIGRATION_TEMP_PASSWORD` (bắt buộc) — mật khẩu tạm chung cho toàn bộ user migrate.
- Script PHẢI hỗ trợ 2 chế độ chạy: `--dry-run` (mặc định, KHÔNG ghi gì vào DB, chỉ parse + validate + in báo cáo) và `--commit` (thực sự ghi). Không được ghi nhầm khi quên flag — `--dry-run` là mặc định an toàn.
- Script PHẢI **idempotent theo từng loại bản ghi** (chạy lại nhiều lần không tạo trùng):
  - `THIETBI`: có `unique(ma_thiet_bi)` sẵn ở DB → dùng `INSERT ... ON CONFLICT (ma_thiet_bi) DO NOTHING` hoặc `DO UPDATE` (tự quyết định UPDATE các trường tổ chức nếu thiết bị đã tồn tại, để chạy lại sau khi sửa dữ liệu nguồn vẫn cập nhật được — ưu tiên `DO UPDATE SET ... WHERE thietbi.<cột> IS NULL` để không ghi đè dữ liệu admin đã tự sửa tay qua UI).
  - `CHITIET`/`CONGVIEC`: KHÔNG có unique constraint tự nhiên (ID sinh bằng sequence `next_chitiet_id()`/`next_congviec_id()`, xem `0001_schema.sql:74,98` — **để trống cột `id` khi INSERT, DB tự sinh**) → phải tự `SELECT` kiểm tra tồn tại (theo `thietbi_id+ten_chi_tiet+dieu_kien_co_ban` cho CHITIET, theo `chitiet_id+loai_hoat_dong` cho CONGVIEC) TRƯỚC KHI INSERT, bỏ qua nếu đã có.
  - `THUC_HIEN`: có `unique(congviec_id, ngay)` sẵn → `INSERT ... ON CONFLICT (congviec_id, ngay) DO NOTHING` (không ghi đè dữ liệu đã có — nếu app đã có thao tác thật xảy ra sau khi migrate 1 lần, không được migrate đè lên).
  - `BAT_THUONG`: có `unique(thuchien_id)` sẵn → tương tự `DO NOTHING`.
  - `NGUOIDUNG`/Auth: kiểm tra tồn tại bằng `msnv` trước khi gọi `auth.admin.createUser()` (gọi API tạo tài khoản Auth 2 lần cho cùng email sẽ lỗi — phải tự check trước).
  - `LEGACY_LOGS_IMPORT`: không có ý nghĩa nghiệp vụ để merge — dùng 1 cột đánh dấu import batch hoặc đơn giản là `TRUNCATE` rồi insert lại mỗi lần chạy `--commit` (dữ liệu log lịch sử tĩnh, không đổi giữa các lần export) — tự quyết định, ưu tiên đơn giản.
- Toàn bộ text log/báo cáo: tiếng Việt.
- KHÔNG commit file `.xlsx` nguồn hoặc bất kỳ export dữ liệu thật nào vào git — thêm `*.xlsx` vào `.gitignore` nếu chưa có.
- KHÔNG commit `MIGRATION_TEMP_PASSWORD` hay bất kỳ secret nào — chỉ đọc từ env.

## Task 1 — Nền tảng: migration SQL mới + đọc & chuẩn hoá dữ liệu xlsx (chưa ghi DB)

**Mục tiêu:** 1 migration SQL mới tạo 2 bảng lịch sử, và 1 module TypeScript đọc trọn vẹn file `.xlsx`, áp toàn bộ logic chuẩn hoá/validate đã mô tả ở Bối cảnh, xuất ra 1 "model" dữ liệu đã làm sạch trong bộ nhớ + in báo cáo — **CHƯA ghi gì vào DB** (đó là việc của Task 2-4).

**File mới:**

- `supabase/migrations/0007_legacy_import_tables.sql`:
  ```sql
  -- Sao chép nguyên trạng sheet "Logs" cũ (audit tóm tắt) để tham khảo lịch sử,
  -- KHÔNG dùng làm audit trail chính thức (đó là AUDIT_LOG ở Pha 8).
  create table legacy_logs_import (
    id bigint generated always as identity primary key,
    thoi_gian text,        -- giữ nguyên chuỗi gốc "DD/MM/YYYY HH:MM:SS", không ép kiểu (dữ liệu tĩnh, không cần query theo ngày)
    nguoi_chinh_sua text,
    tai_khoan text,
    thang_du_lieu text,
    thiet_bi_tac_dong text,
    imported_at timestamptz not null default now()
  );
  alter table legacy_logs_import enable row level security;
  create policy legacy_logs_import_select on legacy_logs_import
    for select to authenticated using (current_role_is_admin());
  grant select on legacy_logs_import to authenticated;
  grant select, insert, delete on legacy_logs_import to service_role;

  -- Các dòng Data cũ KHÔNG match được vào CONGVIEC nào (không tìm thấy tổ hợp
  -- thiết bị+nội dung+điều kiện+loại tương ứng) -- ghi lại để admin rà soát thủ
  -- công thay vì bỏ âm thầm (mục G CLAUDE.md).
  create table legacy_orphan_thuc_hien (
    id bigint generated always as identity primary key,
    thiet_bi text,
    ten_chi_tiet text,
    dieu_kien_co_ban text,
    loai_hoat_dong text,
    thang_nam text,
    ngay date,
    gia_tri_o text,      -- "Y|G" nguyên gốc
    legacy_row_id text,
    ly_do text,          -- vd "Không tìm thấy CONGVIEC khớp", "Nhiều hơn 1 CONGVIEC khớp"
    imported_at timestamptz not null default now()
  );
  alter table legacy_orphan_thuc_hien enable row level security;
  create policy legacy_orphan_thuc_hien_select on legacy_orphan_thuc_hien
    for select to authenticated using (current_role_is_admin());
  grant select on legacy_orphan_thuc_hien to authenticated;
  grant select, insert, delete on legacy_orphan_thuc_hien to service_role;
  ```
  (Áp dụng đúng convention RLS/grant đã dùng ở các bảng khác — đọc `supabase/migrations/0003_rls_policies.sql` và `0004_grants.sql` để khớp style chính xác, vd cách gọi `current_role_is_admin()`.)

- `scripts/migrate/types.ts` — định nghĩa các type dùng chung: `RawConfigRow`, `RawDataRow`, `RawUserRow`, `RawImageRow`, `RawLogRow`, và các type đã chuẩn hoá: `ThietBiRecord`, `ChiTietRecord`, `CongViecRecord`, `ThucHienRecord`, `NguoiDungRecord`.

- `scripts/migrate/readXlsx.ts`:
  - `loadWorkbook(path: string)`: đọc file bằng package `xlsx`, trả về đối tượng workbook.
  - `readConfigRows(wb)`, `readDataRows(wb)`, `readUsersRows(wb)`, `readImagesRows(wb)`, `readThietBiFullList(wb)`, `readLogsRows(wb)`: mỗi hàm đọc ĐÚNG sheet tương ứng theo TÊN CHÍNH XÁC đã liệt kê ở Bối cảnh (đặc biệt `"Thiết bị "` — có dấu cách cuối, dùng hằng số chứ không gõ tay nhiều nơi để tránh lỗi thiếu dấu cách), lọc bỏ dòng đệm trống (`Tháng/Năm`/`MSNV`/mã thiết bị rỗng tuỳ sheet), và đọc **theo vị trí cột đã xác minh ở Bối cảnh** (đặc biệt `Data` — comment rõ trong code lý do vì sao dùng index thay vì tên cột, dẫn link tới bảng đối chiếu ở Bối cảnh của plan này).

- `scripts/migrate/normalize.ts`:
  - `normalizeLoaiHoatDong(raw: string): string | null` — áp bảng chuẩn hoá đã xác định (`"Kiêm tra"→"Kiểm tra"`, viết thường `"vệ sinh"→"Vệ sinh"`, case-insensitive match với 4 giá trị enum), trả `null` nếu không nhận diện được (rỗng hoặc giá trị lạ khác 4 loại + 2 lỗi đã biết).
  - `COMPOUND_DEVICE_RESOLUTIONS`: hard-code chính xác bảng 13 dòng đã liệt kê ở Bối cảnh, dạng:
    ```ts
    type DeviceResolution =
      | { kind: "split"; parts: string[] }
      | { kind: "keep" }; // giữ nguyên mã gốc làm 1 thiết bị (kể cả mã ghép không tách được, hoặc mã đơn không có trong danh sách đầy đủ)

    export const COMPOUND_DEVICE_RESOLUTIONS: Record<string, DeviceResolution> = {
      "E06119-E06120-E06121": { kind: "split", parts: ["E06119", "E06120", "E06121"] },
      "KT06101 - K06101": { kind: "split", parts: ["KT06101", "K06101"] },
      "T06104-P06116AB": { kind: "split", parts: ["T06104", "P06116A", "P06116B"] },
      "T07605-P07606": { kind: "split", parts: ["T07605", "P07606"] },
      "H07601,Z07602,V07604": { kind: "keep" },
      "T06105": { kind: "keep" },
      "T07604-E07604": { kind: "split", parts: ["T07604", "E07604"] },
      "Z06112, Z06113": { kind: "split", parts: ["Z06112", "Z06113"] },
      "E06116A/B": { kind: "split", parts: ["E06116A", "E06116B"] },
      "S06114/E06114/T06114": { kind: "keep" },
      "E06124/E06125/E06126": { kind: "split", parts: ["E06124", "E06125/26"] },
      "T06106": { kind: "keep" },
      "E06118AB": { kind: "split", parts: ["E06118A", "E06118B"] },
    };
    ```
    Hàm `resolveDeviceCode(rawCode: string): string[]` — tra bảng trên, trả về `[rawCode]` nếu không có trong bảng (thiết bị bình thường, không ghép).

- `scripts/migrate/buildModel.ts` — hàm chính `buildMigrationModel(wb): MigrationModel`, orchestrate toàn bộ:
  1. Đọc 58 user thật, build map `Tên người → MSNV` (validate: nếu có 2 người trùng tên trong 58 dòng — KHÔNG xảy ra theo khảo sát nhưng vẫn code phòng thủ — coi là không tra được, log cảnh báo thay vì chọn đại 1 người).
  2. Đọc Config, dedupe theo `(thietbi_sau_khi_resolve, ten_chi_tiet, dieu_kien_co_ban, loai_da_chuan_hoa)`, build danh sách CHITIET/CONGVIEC DỰ KIẾN theo từng thiết bị đã resolve (bao gồm nhân bản cho thiết bị con khi `kind: "split"`).
  3. Đọc danh sách đầy đủ 169 thiết bị + hợp với danh sách thiết bị suy ra từ Config (đã resolve) → danh sách THIETBI cuối cùng. Với mỗi thiết bị: nếu có dữ liệu Config → suy `xuong/kip/cum/khu_vuc/lanh_dao/truong_ca` trực tiếp, và `nguoi_phu_trach` qua tra cứu Tên→MSNV (null nếu không tra được, kèm cảnh báo); nếu KHÔNG có dữ liệu Config (34 thiết bị mới) → toàn bộ trường tổ chức + `nguoi_phu_trach` = `null`.
  4. Đọc Images, gắn `anh_url` vào đúng THIETBI theo mã (copy nguyên URL gốc).
  5. Đọc Data, lọc dòng thật, chuẩn hoá Loại, với mỗi ô khác `"N|N"`: tính ngày thật (`Tháng/Năm` + index ngày, validate ngày hợp lệ vd không có 30/2), match sang CONGVIEC đã build ở bước 2 theo `(thietbi_đã_resolve, ten_chi_tiet, dieu_kien_co_ban, loai)` — nếu thiết bị gốc là mã ghép loại `"split"`, dòng Data này áp dụng cho MỌI thiết bị con (nhân bản THUC_HIEN dự kiến cho từng thiết bị con). Nếu không tìm thấy CONGVIEC khớp (0 hoặc >1 kết quả) → đưa vào danh sách `orphanThucHien` (sẽ ghi vào bảng `legacy_orphan_thuc_hien` ở Task 4), KHÔNG throw lỗi dừng cả script.
  6. Trả về `MigrationModel` gồm: `nguoiDung[]`, `thietBi[]`, `chiTiet[]` (kèm map tạm để nối `congViec[]`), `congViec[]`, `thucHien[]` (kèm cờ nếu `ket_qua==='R'` cần tạo `bat_thuong` kèm theo), `orphanThucHien[]`, `logs[]`, và 1 object `warnings: string[]` gom mọi cảnh báo dọc đường (tên không tra được MSNV, mã ghép không tách được, v.v).

- `scripts/migrate/report.ts` — `printSummary(model: MigrationModel)`: in ra console (tiếng Việt) số liệu đối chiếu theo đúng "Verify" của CLAUDE.md mục Pha 7: tổng số CONGVIEC dự kiến so với số dòng task-rows đã dedupe từ Config, tổng số THUC_HIEN dự kiến so với số ô khác `"N|N"` đếm được, tổng số BAT_THUONG dự kiến so với số ô `"R"` đếm được, tổng số `orphanThucHien`, tổng số `warnings`, và liệt kê toàn bộ nội dung `warnings` (không quá dài, có thể giới hạn hiển thị 50 dòng đầu + tổng số nếu nhiều hơn).

**Không làm trong task này:** không kết nối DB (không cần `pg`/`.env` ở task này), không ghi gì — chỉ parse + build model + in báo cáo ra console. Đây là nền tảng cho Task 2-4 tái sử dụng `MigrationModel`.

**Verify:**
- Chạy thử `node scripts/migrate/run.ts` (hoặc 1 script test riêng gọi `buildMigrationModel` + `printSummary`) với `MIGRATION_XLSX_PATH` trỏ tới file thật, xác nhận:
  - Số THIETBI dự kiến ≈ 169 + số thiết bị con sinh ra từ tách mã ghép − số thiết bị trùng (nếu 1 thiết bị con của mã ghép cũng nằm sẵn trong 169, không tạo trùng).
  - Số CONGVIEC dự kiến khớp thứ tự độ lớn với 3331 tổ hợp đã đếm thủ công (trừ 104 nhóm trùng lặp/117 dòng dư, cộng thêm phần nhân bản do tách mã ghép).
  - `orphanThucHien` liên quan `M07601` = 0 (đã biết trước, toàn `"N|N"` nên bị lọc trước khi match, không phải orphan thật).
  - `warnings` có đúng 1 dòng về `"Dương Văn Hào"` không tra được MSNV.
  - `npx tsc --noEmit` sạch trên toàn bộ `scripts/migrate/*.ts`.

  **[ĐÃ VERIFY — Task 1 hoàn tất]** Số liệu THẬT đo được khi chạy trên file `.xlsx` gốc (khác nhẹ so với ước tính ban đầu ở trên, đã đối chiếu tự nhất quán — xem `.superpowers/sdd/task-1-report.md` để biết chi tiết đối chiếu và 2 phát hiện mới):
  `NGUOIDUNG=58, THIETBI=173, CHITIET=2696, CONGVIEC=3667, THUC_HIEN=39562 (ket_qua='R': 16), ORPHAN_THUC_HIEN=594 (100% do "ngày 31" không tồn tại ở tháng 06/2026 30 ngày — KHÔNG phải orphan do không khớp CONGVIEC, xem Bối cảnh mục 3 để biết quyết định xử lý), LEGACY_LOGS=2323, WARNINGS=1`.
  Task 1 cũng phát hiện và fix 1 vấn đề khớp dữ liệu ngoài dự tính ban đầu (whitespace/`\n` khác nhau giữa Config và Data cho cùng 1 điều kiện cơ bản) — xem Bối cảnh mục 2 (đã cập nhật) và báo cáo Task 1 để biết chi tiết.

## Task 2 — Ghi THIETBI + CHITIET + CONGVIEC vào Postgres (qua `pg`)

**Mục tiêu:** dùng `MigrationModel` từ Task 1, ghi thật (hoặc chỉ hiện kế hoạch nếu `--dry-run`) vào 3 bảng thiết bị, idempotent.

**File mới:**
- `scripts/migrate/db.ts`: `getPgClient()` — tạo `pg.Client` (hoặc `Pool`) từ `SUPABASE_DB_URL`, hàm `withTransaction(client, fn)` helper chạy `BEGIN`/`COMMIT`/`ROLLBACK`.
- `scripts/migrate/migrateEquipment.ts`:
  - `migrateThietBi(client, thietBiList, { commit }): Promise<Map<string, string>>` — trả về map `ma_thiet_bi → id (uuid)` (cần cho bước sau nối CHITIET). Với mỗi thiết bị: `SELECT id FROM thietbi WHERE ma_thiet_bi = $1`; nếu có → dùng lại id đó (bỏ qua ghi đè, ĐÚNG như Global Constraints đã nêu — không ghi đè dữ liệu admin đã tự sửa); nếu chưa có và `commit=true` → `INSERT ... RETURNING id`; nếu `commit=false` → chỉ đếm sẽ tạo mới, không insert, dùng uuid giả tạm trong bộ nhớ để các bước dry-run sau vẫn chạy được logic đối chiếu (không cần chính xác tuyệt đối cho dry-run, chỉ cần đúng SỐ LƯỢNG báo cáo).
  - `migrateChiTietCongViec(client, chiTietList, congViecList, thietBiIdMap, { commit }): Promise<Map<string, string>>` — map khoá tạm (vd `${thietbi_id}||${ten_chi_tiet}||${dieu_kien}`) → `chitiet_id` thật, tương tự cho CONGVIEC (map khoá `${chitiet_id}||${loai}` → `congviec_id`) — dùng ở Task 4 để nối THUC_HIEN.

**Verify:**
- `npx supabase db reset` (đảm bảo baseline sạch, có cả migration 0007 mới), rồi chạy `node scripts/migrate/run.ts --commit` (giới hạn scope task này: tạm thời chỉ gọi tới bước migrate equipment, các bước Task 3-4 sẽ nối tiếp sau) trên local Supabase.
- Query trực tiếp qua `psql`: đếm `select count(*) from thietbi`, `select count(*) from chitiet`, `select count(*) from congviec`, so khớp với báo cáo Task 1.
- Kiểm tra 1 vài thiết bị mẫu (vd `E06105A`) có đúng `xuong/kip/nguoi_phu_trach` như Config gốc.
- Kiểm tra thiết bị tách từ mã ghép (vd `E06119`, `E06120`, `E06121`) đều tồn tại, mỗi cái có bản CHITIET/CONGVIEC riêng giống hệt nhau.
- Chạy lại lần 2 `node scripts/migrate/run.ts --commit`, xác nhận KHÔNG tạo thêm dòng trùng (đếm lại, số không đổi).

## Task 3 — Ghi NGUOIDUNG (Supabase Auth + profile) + gắn `anh_url`

**Mục tiêu:** tạo 58 tài khoản Auth thật (username từ cột `User`, mật khẩu chung từ `MIGRATION_TEMP_PASSWORD`) + profile `nguoidung`, và cập nhật `anh_url` cho các THIETBI đã tạo ở Task 2 theo sheet `Images`.

**File mới:**
- `scripts/migrate/migrateUsers.ts`:
  - `migrateNguoiDung(supabaseAdmin, pgClient, users, { commit }): Promise<void>` — với mỗi user: `SELECT id FROM nguoidung WHERE msnv = $1` (qua `pg`) để kiểm tra tồn tại; nếu chưa có và `commit=true`: gọi `supabaseAdmin.auth.admin.createUser({ email: usernameToEmail(username), password: MIGRATION_TEMP_PASSWORD, email_confirm: true })` rồi `INSERT INTO nguoidung (id, msnv, ho_ten, don_vi, vai_tro) VALUES (...)` qua `pg` với `id = created.user.id` — **PHẢI tái tạo đúng logic `usernameToEmail`** (đọc `src/lib/auth/username.ts`, copy/import lại chính xác công thức `${username.trim().toLowerCase()}@pvcfc.internal`, KHÔNG viết lại khác đi dù chỉ 1 ký tự).
  - Xử lý lỗi tạo Auth user thất bại giữa chừng (vd trùng email edge case) — rollback (xoá) Auth user vừa tạo nếu bước insert `nguoidung` sau đó lỗi, giống đúng pattern "orphan-rollback on failure" đã có trong `src/app/actions/users.ts`'s `createUser` — đọc file đó để copy đúng cách xử lý.
- `scripts/migrate/migrateImages.ts`:
  - `migrateAnhUrl(client, images, thietBiIdMap, { commit })` — với mỗi `(mã, url)`: `UPDATE thietbi SET anh_url = $1 WHERE ma_thiet_bi = $2 AND anh_url IS NULL` (chỉ set nếu đang trống — không ghi đè nếu admin đã tự sửa link khác qua UI).

**Verify:**
- Chạy `--commit`, query `select count(*) from nguoidung` = 58 (hoặc khớp số thật sau khi trừ trường hợp lỗi nếu có), `select count(*) from auth.users` khớp tương ứng.
- Thử đăng nhập qua UI thật (`/login`) bằng 1 username thật (vd `vanvv`) + `MIGRATION_TEMP_PASSWORD`, xác nhận vào được `/checksheet`, vai trò đúng (vd `vanvv` phải là `admin`).
- Query `select ma_thiet_bi, anh_url from thietbi where anh_url is not null limit 5`, xác nhận có URL Drive gốc (không phải link đã resolve).
- Chạy lại `--commit` lần 2, xác nhận không tạo trùng Auth user (không lỗi, tự bỏ qua).

## Task 4 — THUC_HIEN + BAT_THUONG + LEGACY_LOGS_IMPORT + CLI hoàn chỉnh + báo cáo đối chiếu cuối

**Mục tiêu:** hoàn thiện phần dữ liệu chấm công lịch sử (phần lớn nhất, ~10585 dòng nguồn) và log cũ, gộp toàn bộ 4 task thành 1 CLI chạy được từ đầu tới cuối.

**File mới:**
- `scripts/migrate/migrateThucHien.ts`:
  - `migrateThucHienBatch(client, thucHienList, congViecIdMap, { commit })` — với mỗi bản ghi:
    - Nếu `ket_qua !== 'R'`: `INSERT INTO thuc_hien (congviec_id, ngay, ke_hoach, ket_qua, nguoi_thuc_hien, legacy_row_id, legacy_month_year) VALUES (...) ON CONFLICT (congviec_id, ngay) DO NOTHING`.
    - Nếu `ket_qua === 'R'`: **PHẢI dùng 1 transaction thật qua `pg`** (`BEGIN`) chứa CẢ `INSERT INTO thuc_hien (...) ON CONFLICT (congviec_id, ngay) DO NOTHING RETURNING id` (nếu `DO NOTHING` không trả dòng nghĩa là đã tồn tại — bỏ qua tạo `bat_thuong` luôn, tránh trùng) **VÀ** `INSERT INTO bat_thuong (thuchien_id, mo_ta, trang_thai, ngay_phat_hien, nguoi_ghi) VALUES ($1, 'Dữ liệu lịch sử — không có mô tả gốc', 'Đã đóng', $2, $3) ON CONFLICT (thuchien_id) DO NOTHING` trong CÙNG 1 `BEGIN...COMMIT` — đúng quyết định đã chốt trước đó về backfill BAT_THUONG lịch sử (`mo_ta`/`trang_thai` cố định).
    - Gom theo batch hợp lý (vd theo từng thiết bị, hoặc theo lô 500 dòng) để không mở hàng nghìn transaction riêng lẻ — tự quyết định kích thước batch hợp lý, ưu tiên đơn giản hơn tối ưu hiệu năng tối đa (đây là script chạy 1 lần, không phải service thường trực).
- `scripts/migrate/migrateLogs.ts`:
  - `migrateLegacyLogs(client, logs, { commit })` — theo Global Constraints: `TRUNCATE legacy_logs_import` rồi `INSERT` lại toàn bộ (nếu `commit=true`).
- `scripts/migrate/migrateOrphans.ts`:
  - `migrateOrphanThucHien(client, orphans, { commit })` — insert toàn bộ `orphanThucHien` từ model vào bảng `legacy_orphan_thuc_hien` (tương tự, có thể `TRUNCATE` trước rồi insert lại mỗi lần chạy).
- `scripts/migrate/run.ts` — CLI entrypoint:
  ```ts
  // Cách chạy: node scripts/migrate/run.ts [--commit]
  // Mặc định (không có --commit) là dry-run: chỉ parse + báo cáo, KHÔNG ghi DB.
  ```
  Đọc `.env.local` (viết 1 hàm nhỏ tự parse `KEY=VALUE` theo dòng, bỏ qua dòng comment `#` — không thêm dependency `dotenv`), validate đủ 4 biến môi trường bắt buộc (thoát với thông báo lỗi rõ ràng nếu thiếu), gọi tuần tự: `buildMigrationModel` → `printSummary` → (nếu `--commit`) `migrateThietBi` → `migrateChiTietCongViec` → `migrateNguoiDung` → `migrateAnhUrl` → `migrateThucHienBatch` → `migrateLegacyLogs` → `migrateOrphanThucHien` → in báo cáo cuối cùng (số dòng THẬT đã ghi vào từng bảng, đối chiếu lại với model dự kiến ban đầu — phải khớp, nếu lệch phải in cảnh báo rõ ràng).

**Verify:**
- `npx supabase db reset` (baseline sạch), chạy `node scripts/migrate/run.ts` (dry-run mặc định) trước, xác nhận KHÔNG có gì trong DB thay đổi (`select count(*) from thuc_hien` = 0).
- Chạy `node scripts/migrate/run.ts --commit` full pipeline, đối chiếu với số liệu THẬT đã đo ở Task 1 (xem hộp "[ĐÃ VERIFY — Task 1 hoàn tất]" ở Task 1 bên trên và `.superpowers/sdd/task-1-report.md` — KHÔNG dùng số ước tính ban đầu ở mục Bối cảnh, dùng số đã đo trực tiếp):
  - `select count(*) from congviec` = 3667 (khớp `MigrationModel.congViec.length` từ Task 1).
  - `select count(*) from thuc_hien` = 39562 − (số dòng orphan "ngày 31" bị loại, tức 594, NẾU quyết định không ghi các dòng orphan vào `thuc_hien` — mặc định theo plan là KHÔNG ghi, chỉ ghi vào `legacy_orphan_thuc_hien`) = kỳ vọng con số THUC_HIEN thật ghi vào bảng chính thức phải LOẠI TRỪ 594 dòng orphan này.
  - `select count(*) from bat_thuong` = 16 (số dòng `ket_qua='R'` đã đếm ở Task 1).
  - `select count(*) from legacy_logs_import` = 2323 (ĐÃ SỬA từ "2324" — số ban đầu đếm nhầm gồm cả header, xem Bối cảnh mục sheet `Logs`).
  - `select count(*) from legacy_orphan_thuc_hien` = 594, TOÀN BỘ với `ly_do` liên quan "ngày 31, 06/2026 không hợp lệ" (không phải orphan do không khớp CONGVIEC — nếu xuất hiện lý do khác ngoài "ngày không hợp lệ", đó là dấu hiệu có regression cần điều tra trước khi merge, vì Task 1 đã xác nhận 0 orphan "không tìm thấy CONGVIEC khớp" trên dữ liệu thật sau khi fix vấn đề whitespace).
- So sánh thủ công lưới chấm công của 5-10 thiết bị/tháng ngẫu nhiên giữa file Excel gốc và UI `/checksheet` thật sau khi migrate (chọn cả thiết bị thường lẫn 1 thiết bị vừa tách từ mã ghép, vd `E06119`) — xác nhận đúng từng ô Plan/Actual.
- Mở `/admin/bat-thuong`, xác nhận các bất thường lịch sử hiện đúng, `trang_thai="Đã đóng"`, mô tả đúng placeholder đã chốt.
- Chạy lại `--commit` LẦN 2 toàn bộ, xác nhận mọi bảng KHÔNG tăng số dòng (idempotent thật sự, không chỉ ở equipment).
