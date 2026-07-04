# Pha 6 — Thống kê & thông báo

## Bối cảnh (đọc trước khi bắt đầu bất kỳ task nào)

Pha 6 port 3 tính năng còn lại của hệ Google Apps Script cũ
(`AdminCustom` object + hàm chuông "chuông thông báo" trong
`D:\Sang\Work\PVCFC\AM\AMStep3\Code.js`/`Javascript.html` — đọc file này nếu
cần đối chiếu hành vi cũ, KHÔNG copy code, chỉ tham khảo UX):

1. **Trang thống kê hoàn thành Plan** (`/admin/stats`, thay `AdminCustom`
   tab "Thống kê").
2. **Chuông thông báo** (nhắc lập Plan đầu tháng / nhắc thiếu Actual) trên
   trang checksheet.
3. **In hàng loạt PDF** nhiều thiết bị liên tiếp từ trang thống kê (thay
   `AdminCustom.printBatchStats`).

Hai RPC nghiệp vụ cho tính năng 1 và 2 đã tồn tại từ Pha 1, **không cần
migration mới**:

- `get_plan_stats(p_target_month date)` — `supabase/migrations/0002_functions_triggers.sql:487`.
  Trả về 1 dòng/thiết bị: `thietbi_id, xuong, kip, nguoi_phu_trach,
  ten_thiet_bi, total_tasks, planned_tasks, status` (`status` đã là chuỗi
  `'Đã cập nhật'`/`'Chưa cập nhật'` tính sẵn ở SQL — **không tính lại ở
  client**). Lưu ý: RPC này CHỈ tính Plan, không có tỉ lệ hoàn thành Actual
  (đúng hành vi hệ cũ — hệ cũ cũng không tính % Actual ở màn thống kê, chỉ
  tính ở chuông thông báo).
- `get_notifications(p_msnv text)` — cùng file, dòng 535. Trả về **nhiều
  dòng thô** `loai ('plan'|'act'), thiet_bi, noi_dung` — **KHÁC** hệ cũ vốn
  trả sẵn 2 message đã gộp; ở Pha 6 phải **tự gộp lại ở client** thành tối
  đa 2 nhóm thông báo (xem Task 2).

**Không có** trường "người lập kế hoạch" (planner) trong `get_plan_stats`
như hệ cũ có — quyết định đã chấp nhận: **bỏ cột này** ở bảng thống kê mới
(không thêm migration chỉ để lấy lại 1 cột phụ, YAGNI). Không có filter
Xưởng ở màn thống kê (hệ cũ cũng không có — giữ nguyên).

## Global Constraints (áp dụng cho MỌI task bên dưới)

- Toàn bộ text hiển thị, nhãn, thông báo lỗi: **tiếng Việt**.
- Route mới: `src/app/admin/stats/page.tsx` (Server Component) +
  `src/app/admin/stats/StatsTable.tsx` (Client Component) — nằm dưới
  `src/app/admin/layout.tsx` nên tự động được gate bởi `requireAdmin()` có
  sẵn ở layout (không tự gọi lại). Thêm mục nav "Thống kê" vào
  `src/app/admin/layout.tsx` (danh sách `<Link>`: Người dùng / Thiết bị /
  Cài đặt / Bất thường — thêm "Thống kê" vào cuối) và 1 thẻ vào
  `src/app/admin/page.tsx` (mảng `SECTIONS`), đúng pattern Pha 5 đã dùng
  cho "Bất thường".
- KHÔNG dùng thư viện icon mới (project hiện không có `lucide-react`/
  `heroicons`/... — kiểm tra `package.json` nếu nghi ngờ). Icon chuông
  dùng ký tự emoji `🔔` trực tiếp trong JSX, không import SVG/icon package
  nào.
- Data fetching đọc dùng client Supabase thường qua RLS (`createClient()`
  server hoặc browser tuỳ ngữ cảnh) — cả 2 RPC đã có
  `grant execute ... to authenticated` (xem `0002_functions_triggers.sql:529,574`),
  không cần service-role.
- Badge màu trạng thái: tái dùng đúng bảng màu Tailwind đã dùng ở
  `src/app/admin/bat-thuong/BatThuongList.tsx` (`TRANG_THAI_BADGE`) làm
  mẫu phong cách — "Đã cập nhật" = `bg-green-100 text-green-700`, "Chưa cập
  nhật" = `bg-red-100 text-red-700` (hệ cũ dùng Bootstrap `bg-success`/
  `bg-danger`, đây là bản dịch màu tương đương sang Tailwind).

## Task 1 — Trang thống kê hoàn thành Plan (đọc, có lọc)

**Mục tiêu:** `/admin/stats` hiển thị bảng thống kê theo thiết bị, lọc theo
Kíp / Nhân viên (substring) / Trạng thái, chọn tháng xem.

**File mới:**
- `src/lib/checksheet/planStats.ts`:
  ```ts
  export type PlanStatsRow = {
    thietBiId: string;
    xuong: string | null;
    kip: string | null;
    nguoiPhuTrach: string | null;
    tenThietBi: string;
    totalTasks: number;
    plannedTasks: number;
    status: "Đã cập nhật" | "Chưa cập nhật";
  };

  export async function getPlanStats(
    supabase: SupabaseClient,
    targetMonth: string, // "YYYY-MM-01" (ngày bất kỳ trong tháng cần xem)
  ): Promise<PlanStatsRow[]>
  ```
  Gọi `supabase.rpc("get_plan_stats", { p_target_month: targetMonth })`,
  map `snake_case` → `camelCase` 1-1 (không tính lại `status`, dùng thẳng
  giá trị SQL trả về — xem Bối cảnh).

- `src/app/admin/stats/page.tsx` — Server Component: đọc `searchParams`
  (Next.js 16 — **PHẢI `await`**, xem `src/app/admin/equipment/[id]/page.tsx`
  làm mẫu convention hiện tại) lấy tháng ban đầu (mặc định tháng hiện tại
  nếu không có `?thang=`), gọi `getPlanStats`, render
  `<StatsTable initialRows={...} initialMonth={...} />`.

- `src/app/admin/stats/StatsTable.tsx` — Client Component:
  - Input `type="month"` chọn tháng xem — đổi tháng phải **gọi lại RPC**
    (khác với `/admin/bat-thuong` của Pha 5 vốn tải 1 lần rồi lọc client;
    ở đây tháng ảnh hưởng trực tiếp tới bộ dữ liệu SQL trả về, không thể
    lọc client trên dữ liệu của tháng khác). Cách đơn giản nhất: đổi tháng
    → gọi `router.push` với query `?thang=YYYY-MM` rồi để Server Component
    tải lại (đơn giản hơn tự quản lý state + gọi RPC từ client — chấp nhận
    round-trip trang vì tần suất đổi tháng ở màn thống kê thấp), HOẶC gọi
    thẳng `getPlanStats` bằng browser client trong 1 `useEffect`/handler
    khi tháng đổi (tự quản lý loading state) — chọn cách nào ít code hơn,
    ưu tiên convention đã có trong repo. Vì `EquipmentList.tsx`/`UsersTable.tsx`
    không có tiền lệ "đổi filter cần gọi lại server" (Pha 5 lọc thuần
    client), TỰ QUYẾT định hợp lý, ưu tiên đơn giản.
  - Bộ lọc CLIENT (áp dụng trên `initialRows`/dữ liệu đã tải cho tháng hiện
    tại, không gọi lại RPC): Kíp (`<select>` liệt kê các giá trị `kip`
    distinct xuất hiện trong dữ liệu, có option "Tất cả"), Nhân viên
    (input text, substring match không phân biệt hoa/thường trên
    `nguoiPhuTrach`, MSNV thô — KHÔNG resolve sang họ tên, chấp nhận đơn
    giản hoá này), Trạng thái (`<select>`: Tất cả / Đã cập nhật / Chưa cập
    nhật).
  - Bảng: Xưởng, Kíp, Nhân viên (MSNV), Thiết bị, Số lượng công việc
    (`${plannedTasks}/${totalTasks}`), Trạng thái (badge màu, xem Global
    Constraints).
  - Hàng trống ("Không có dữ liệu") khi danh sách sau lọc rỗng.

**Không làm trong task này:** in PDF hàng loạt (Task 3), chuông thông báo
(Task 2).

**Verify:**
- `npx tsc --noEmit` sạch.
- Seed thủ công local Supabase: ≥2 thiết bị, 1 có Plan tháng hiện tại (qua
  UI checksheet có sẵn hoặc RPC `upsert_thuc_hien` trực tiếp), 1 chưa có
  Plan. Mở `/admin/stats` bằng tài khoản admin, xác nhận đúng trạng thái
  Đã/Chưa cập nhật, tỉ lệ đúng, đổi tháng ra tháng không có dữ liệu → bảng
  trống đúng cách, bộ lọc Kíp/Nhân viên/Trạng thái hoạt động đúng.

## Task 2 — Chuông thông báo (đọc + tự gộp nhóm, gắn vào trang checksheet)

**Mục tiêu:** icon chuông trên trang `/checksheet` hiện badge số nhóm
thông báo (0/1/2) của người dùng đang đăng nhập, dropdown liệt kê chi
tiết, tải lại khi mount và sau khi lưu checksheet thành công.

**File mới:**
- `src/lib/checksheet/notifications.ts`:
  ```ts
  export type NotificationGroup = {
    loai: "plan" | "act";
    tieuDe: string;       // "Nhắc nhở lập kế hoạch" | "Nhắc nhở hoàn tất checksheet"
    noiDung: string;      // đã gộp, xem logic bên dưới
  };

  export async function getNotificationGroups(
    supabase: SupabaseClient,
    msnv: string,
  ): Promise<NotificationGroup[]>
  ```
  Gọi `supabase.rpc("get_notifications", { p_msnv: msnv })`, nhận về mảng
  thô `{loai, thiet_bi, noi_dung}[]`, tự gộp:
  - Mọi dòng `loai='plan'` (nếu có ≥1 dòng) → 1 `NotificationGroup` duy
    nhất: `tieuDe: "Nhắc nhở lập kế hoạch"`, `noiDung: "Vui lòng cập nhật
    Plan cho: " + danh sách thiet_bi distinct, nối bằng ", "`.
  - Mọi dòng `loai='act'` (nếu có ≥1 dòng) → 1 `NotificationGroup` duy
    nhất: `tieuDe: "Nhắc nhở hoàn tất checksheet"`, `noiDung` là chuỗi liệt
    kê từng thiết bị kèm các nội dung công việc thiếu Actual của thiết bị
    đó (gộp theo `thiet_bi`, format tự chọn hợp lý, vd mỗi thiết bị 1 dòng
    `"<thiet_bi>: <noi_dung 1>; <noi_dung 2>"` nối bằng dấu xuống dòng
    `"\n"` giữa các thiết bị — hiển thị bằng `white-space: pre-line` hoặc
    tương đương ở component, không cần dựng HTML `<ul>` như hệ cũ).
  - Số nhóm (badge count) = `groups.length` (0, 1, hoặc 2) — **KHÔNG** phải
    tổng số dòng thô, đúng ngữ nghĩa hệ cũ (xem Bối cảnh).
  - Nếu `msnv` rỗng/null: trả về `[]` ngay, không gọi RPC (áp dụng ở nơi
    gọi, xem dưới).

- `src/app/checksheet/NotificationBell.tsx` — Client Component:
  ```ts
  export function NotificationBell({ msnv }: { msnv: string | null })
  ```
  - `useEffect` gọi `getNotificationGroups` khi mount (bỏ qua nếu
    `msnv` null) và khi nhận sự kiện `window` tên
    `"checksheet:saved"` (xem cách dispatch bên dưới) — dùng
    `window.addEventListener("checksheet:saved", handler)` trong effect,
    cleanup bằng `removeEventListener`. KHÔNG dùng polling định kỳ
    (`setInterval`) — đúng hành vi hệ cũ (chỉ tải lại lúc mount + sau khi
    lưu, xem Bối cảnh).
  - UI: nút `🔔` + badge số tròn đỏ ở góc (ẩn hẳn, không render, khi
    `count === 0` — không phải style `display:none` để tránh phần tử trống
    còn chiếm layout) + dropdown khi click (dùng state `open` cục bộ,
    đóng khi click ra ngoài bằng 1 `useEffect` với listener `mousedown`
    trên `document`, hoặc đơn giản hơn: đóng khi click lại vào chính nút
    chuông — tự chọn cách đơn giản nhất, ưu tiên ít code). Dropdown liệt
    kê từng `NotificationGroup`: tiêu đề tô màu (plan = `text-amber-600`,
    act = `text-red-600`, tương đương "warning"/"danger" hệ cũ), nội dung
    dưới dạng text thường (`text-sm text-gray-600`). Nếu `groups.length
    === 0`: hiện dòng "Không có thông báo".
  - **KHÔNG** có hành vi click-vào-thông-báo-để-điều-hướng — đúng hệ cũ
    (chỉ hiển thị tĩnh, xem Bối cảnh). Không thêm tính năng này dù có vẻ
    hữu ích (YAGNI, ngoài phạm vi).

**File sửa:**
- `src/app/checksheet/page.tsx` — thêm `<NotificationBell msnv={profile?.msnv
  ?? null} />` vào hàng header (cùng hàng với tên người dùng/nút Đăng xuất
  hiện có, đặt trước hoặc sau tên người dùng, tự quyết định vị trí hợp lý).
- `src/app/checksheet/ChecksheetApp.tsx`:
  - Trong `handleSave()`, ngay sau nhánh `if (appliedEntries.length > 0)`
    (dòng ~427-433 hiện tại, chỗ dispatch `markFieldsApplied`) — thêm
    `window.dispatchEvent(new Event("checksheet:saved"))` — CHỈ khi thực
    sự có field được áp dụng thành công (không dispatch nếu toàn bộ payload
    bị `skipped`/`conflict`).
  - Trong `handleBatThuongSuccess()` (dòng ~217-233 hiện tại) — thêm cùng
    `window.dispatchEvent(new Event("checksheet:saved"))` sau khi dispatch
    `applyBatThuong` thành công (ghi nhận bất thường cũng là 1 lần lưu
    Actual thật, có thể vừa xoá 1 mục "thiếu Actual" khỏi chuông).
  - Đặt tên sự kiện `"checksheet:saved"` làm hằng số dùng chung (xuất từ
    `src/lib/checksheet/notifications.ts`, vd `export const
    CHECKSHEET_SAVED_EVENT = "checksheet:saved";`) — dùng hằng số này ở CẢ
    2 nơi dispatch VÀ ở `NotificationBell.tsx`, không hardcode chuỗi lặp
    lại ở nhiều file.

**Verify:**
- `npx tsc --noEmit` sạch.
- Seed 1 user thường có `nguoi_phu_trach` trỏ đúng 1 thiết bị chưa có Plan
  tháng hiện tại → đăng nhập, xác nhận chuông hiện badge, dropdown đúng nội
  dung "Nhắc nhở lập kế hoạch" (chỉ khi test chạy vào ngày 1-6 dương lịch —
  nếu môi trường test không rơi vào khoảng này, xác nhận bằng cách kiểm
  tra logic `today_vn()`/query trực tiếp qua `psql` thay vì chờ đúng ngày,
  hoặc set `TZ`/giả lập ngày nếu có cách — ghi rõ trong report nếu phải bỏ
  qua nhánh này vì lý do ngày tháng).
  Lập Plan cho thiết bị đó rồi lưu → xác nhận chuông tự cập nhật (nhóm
  "lập kế hoạch" biến mất) mà KHÔNG cần tải lại trang.
- Test nhánh "thiếu Actual": thiết bị có Plan ở 1 ngày đã qua nhưng Actual
  vẫn `'N'` → chuông hiện nhóm "Nhắc nhở hoàn tất checksheet" đúng nội
  dung; điền Actual cho ngày đó rồi lưu → nhóm biến mất không cần reload.

## Task 3 — In hàng loạt PDF từ trang thống kê

**Mục tiêu:** từ `/admin/stats`, nút "In danh sách đã lọc" in tuần tự từng
thiết bị đang hiển thị (đã lọc, CHỈ những thiết bị `status === "Đã cập
nhật"` — đúng hệ cũ, xem Bối cảnh) ra hộp thoại in của trình duyệt, thiết
bị này xong mới sang thiết bị kế tiếp.

**Quyết định kỹ thuật quan trọng (đọc kỹ trước khi code):** `ChecksheetTable`
(`src/app/checksheet/ChecksheetTable.tsx`) đã hỗ trợ sẵn "chế độ chỉ xem"
mà KHÔNG cần sửa gì — truyền `editability={}` (map rỗng) khiến MỌI ô bị
coi là không thể sửa (đã ghi rõ trong docstring prop `editability`: "Thiếu
key ... mặc định KHÔNG cho sửa"), và truyền các callback
`onSetPlan`/`onSetAct`/`onRequestBatThuong`/`onSelectDay`/`onAutoFillPlan`
dạng no-op (`() => {}`), `selectedDay={null}`. **TÁI DÙNG `ChecksheetTable`
y nguyên cho in hàng loạt — KHÔNG viết component bảng mới.**

**File mới:**
- `src/app/admin/stats/BatchPrint.tsx` — Client Component:
  ```ts
  export function BatchPrint({
    devices,       // các thiết bị ĐÃ LỌC status="Đã cập nhật" từ StatsTable
    monthValue,    // "YYYY-MM" đang xem ở StatsTable
  }: {
    devices: { thietBiId: string; tenThietBi: string }[];
    monthValue: string;
  })
  ```
  - Nút "In danh sách đã lọc" (disabled nếu `devices.length === 0`).
  - Click → `confirm()` (dùng `window.confirm`, giữ nguyên cơ chế hệ cũ)
    với đúng tinh thần nội dung cũ, dịch cho khớp số liệu:
    `"Bạn sắp in ${devices.length} thiết bị.\nTrình duyệt sẽ hiện cửa sổ in
    lần lượt cho từng thiết bị.\nVui lòng bấm 'Save/Lưu' liên tục cho tới
    khi hoàn tất.\nTiếp tục?"` — nếu người dùng Cancel, dừng, không làm gì.
  - Nếu đồng ý: chạy 1 hàng đợi tuần tự (state `currentIndex`, bắt đầu từ
    0). Với thiết bị tại `currentIndex`:
    1. Tính `thangDau`/`thangCuoi` từ `monthValue` (tái dùng hàm
       `monthRange()` đã export từ `src/app/checksheet/ChecksheetApp.tsx`
       — import trực tiếp, KHÔNG viết lại hàm này).
    2. Gọi `getCongViecRows(supabase, thietBiId, thangDau, thangCuoi)` rồi
       `getThucHien(supabase, congViecIds, thangDau, thangCuoi)` (2 hàm đã
       có ở `src/lib/checksheet/queries.ts` — tái dùng y nguyên).
    3. Render `<ChecksheetTable rows=... thucHien=... editability={{}}
       onSetPlan={() => {}} onSetAct={() => {}} onRequestBatThuong={() =>
       {}} onSelectDay={() => {}} onAutoFillPlan={() => {}}
       selectedDay={null} .../>` bọc trong `<div className="print-area">`
       (class có sẵn từ `print.css`, import file này vào component — xem
       cách `ChecksheetApp.tsx` đã `import "./print.css"`) kèm 1 dòng tiêu
       đề thiết bị/tháng phía trên bảng (để phân biệt các bản in với nhau
       khi lưu PDF hàng loạt — hệ cũ cũng hiện "info panel" trước khi in).
    4. Đợi 1 khoảng ngắn cho React render xong (hệ cũ dùng `setTimeout`
       800ms cố định trước khi in — dùng `requestAnimationFrame` lồng 1
       lần hoặc `setTimeout(..., 300)` đơn giản, KHÔNG bắt buộc y hệt
       800ms, miễn đủ để DOM cập nhật trước khi gọi `window.print()`).
    5. Gọi `window.print()`.
    6. Đợi trình duyệt đóng hộp thoại in — dùng sự kiện `window.onafterprint`
       (đăng ký 1 lần trước khi gọi `print()`, gỡ ngay khi sự kiện fire)
       làm tín hiệu chính để chuyển sang thiết bị kế tiếp; **kèm 1
       `setTimeout` dự phòng** (vd 5s) tự động coi như đã in xong nếu
       `afterprint` không bao giờ fire (một số trình duyệt/chế độ có thể
       không phát sự kiện này đáng tin cậy) — tránh treo hàng đợi vĩnh
       viễn. Đây là cải tiến so với hệ cũ (hệ cũ dùng `setTimeout` mù
       500ms cố định, không có tín hiệu thật từ trình duyệt) — tận dụng
       `afterprint` khi có, fallback timeout khi không.
    7. Tăng `currentIndex`, lặp lại từ bước 1 cho thiết bị kế tiếp; khi hết
       hàng đợi, dọn `print-area` (unmount / set về rỗng) và hiện thông
       báo "Đã in xong N/N thiết bị" (banner tạm, không cần modal).
  - Toàn bộ vùng render bảng in (bước 3) PHẢI có class bao ngoài
    `no-print` KHI KHÔNG PHẢI thời điểm đang thực sự in — nghĩa là: hiện 1
    banner tiến trình "Đang in thiết bị X/N: <tên>" ở màn hình bình thường
    (`no-print` không áp dụng cho banner này, banner CẦN hiện), nhưng bảng
    checksheet thật (`print-area`) chỉ nên xuất hiện trong DOM ngay trước
    khi gọi `window.print()` cho thiết bị đó (tránh người dùng thấy bảng
    "nháy" liên tục giữa các thiết bị trong lúc không in) — CÁCH ĐƠN GIẢN
    NHẤT: giữ `print-area` luôn có mặt trong DOM khi đang chạy hàng đợi
    (không ẩn/hiện phức tạp), vì `print.css` (`@media print`) đã tự động
    ẩn mọi thứ NGOÀI `.print-area` chỉ trong lúc in — màn hình bình thường
    vẫn thấy được bảng đang render, không cần thêm CSS ẩn/hiện thủ công.
    Ưu tiên cách đơn giản này, không tự nghĩ thêm cơ chế ẩn hiện phức tạp.

**File sửa:**
- `src/app/admin/stats/StatsTable.tsx` — render `<BatchPrint devices={...}
  monthValue={monthValue} />` bên dưới bảng, truyền đúng danh sách thiết bị
  ĐANG HIỂN THỊ SAU KHI LỌC (dùng lại state lọc đã có ở Task 1) mà
  `status === "Đã cập nhật"` (lọc thêm điều kiện này ngay cả khi người dùng
  đang xem "Tất cả" trạng thái ở bảng — đúng hành vi hệ cũ ép buộc chỉ in
  thiết bị đã cập nhật, xem Bối cảnh).

**Verify:**
- `npx tsc --noEmit` sạch.
- Test thủ công (Playwright hoặc thao tác tay, ưu tiên tự verify bằng cách
  nhanh nhất có sẵn) trên local Supabase với ≥2 thiết bị "Đã cập nhật":
  bấm "In danh sách đã lọc", xác nhận hộp thoại `confirm()` hiện đúng số
  lượng, đồng ý → hộp thoại in trình duyệt xuất hiện lần lượt (Playwright
  có thể tự động cancel/nhận dialog `beforeprint`/print — nếu môi trường
  test không mô phỏng được `window.print()` thật, ít nhất xác nhận bằng
  cách theo dõi console log/DOM: đúng nội dung bảng đổi đúng theo từng
  thiết bị trong hàng đợi, và hàng đợi kết thúc đúng sau thiết bị cuối,
  không treo). Xác nhận thiết bị "Chưa cập nhật" KHÔNG nằm trong hàng đợi
  in dù đang được lọc hiển thị ở bảng.
