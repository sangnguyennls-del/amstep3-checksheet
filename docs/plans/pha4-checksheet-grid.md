# Pha 4: Checksheet Grid (core UX)

## Context

Phần khó nhất của dự án migrate "Checksheet AM Bước 3" (Google Apps Script) sang
Supabase + Next.js. Pha 1 (schema+RLS), Pha 2 (Auth), Pha 3 (Admin CRUD) đã
merge vào `master`. Pha 4 xây dựng lưới chấm công (grid) — màn hình chính mà
operator dùng hàng ngày: chọn bộ lọc Xưởng→Kíp→Nhân viên→Thiết bị→Tháng, xem
lưới các CONGVIEC (hàng) × 1-31 (cột ngày), tô từng ô Plan/Actual, lưu lên
server.

Vì đây là 1 tính năng liền mạch (không tách được thành nhiều trang độc lập
như Pha 3), Pha 4 được tách thành 4 Task **tuần tự** — mỗi Task xây trên kết
quả Task trước, không độc lập hoàn toàn như Pha 3, nhưng vẫn dispatch từng
Task một cho implementer + reviewer riêng theo đúng quy trình
subagent-driven-development.

## Global Constraints (áp dụng cho MỌI task dưới đây)

### Stack & quy ước chung
- Next.js 16 App Router + TypeScript + Tailwind, `src/` dir, alias `@/*`.
- Next.js 16 khác bản quen thuộc — đọc `node_modules/next/dist/docs/` nếu
  nghi ngờ API/convention đã đổi (vd `middleware.ts`→`proxy.ts`).
- Toàn bộ UI text tiếng Việt. Style Tailwind thuần theo đúng "look" đã có ở
  `src/app/admin/users/UsersTable.tsx` và `src/app/admin/equipment/[id]/EquipmentDetail.tsx`
  (viền `border`, bo góc `rounded-md`, tông xám/trắng) — Pha 4 là 1 trang MỚI
  (`/checksheet`, không nằm trong `/admin`), nhưng vẫn nên dùng cùng ngôn ngữ
  thiết kế, không tạo hệ thống UI mới.
- KHÔNG cài thêm package UI/state-management ngoài những gì Next.js/React/
  Tailwind đã có sẵn trong repo (không thêm Zustand/Redux/Radix/v.v. — dùng
  `useReducer` built-in của React như plan đã chốt).
- KHÔNG có test framework tự động. Verify bằng `npx tsc --noEmit`,
  `npm run build`, và script Node tạm gọi thẳng Supabase JS + (khi cần) thao
  tác DOM qua kiểm tra logic thuần JS đơn vị (không cần trình duyệt thật —
  nếu 1 phần logic khó verify không cần browser, tách nó thành hàm thuần để
  test bằng Node trực tiếp, xem gợi ý cụ thể trong từng Task).

### Schema/RPC đã có sẵn (Pha 1, KHÔNG được đổi)
- `thietbi(id uuid, ma_thiet_bi, ten_thiet_bi, cum, khu_vuc, xuong, kip,
  lanh_dao, truong_ca, nguoi_phu_trach text->msnv, anh_url)`
- `chitiet(id text "CT00001", thietbi_id uuid FK, stt int, ten_chi_tiet,
  dieu_kien_co_ban)`
- `congviec(id text "CV00001", chitiet_id text FK, loai_hoat_dong,
  thoi_gian numeric, tan_suat_chu, tan_suat_so, active boolean,
  hieu_luc_tu date, hieu_luc_den date, ngay_loai_bo date)` — **1 dòng
  CONGVIEC = 1 hàng trên lưới chấm công** (tương đương 1 dòng Config cũ).
- `thuc_hien(id uuid, congviec_id text FK, ngay date, ke_hoach boolean,
  ket_qua enum 'G'|'R'|'N', nguoi_thuc_hien text, created_at, updated_at)` —
  **lưu thưa**: chỉ có dòng khi thật sự có dữ liệu (không tự tạo sẵn 31 dòng
  trắng/tháng). `unique(congviec_id, ngay)`.
- `bat_thuong(id, thuchien_id FK unique, mo_ta, anh_url, ngay_phat_hien,
  ngay_khac_phuc, trang_thai text check in ('Mở','Đang xử lý','Đã đóng'),
  nguoi_ghi)`.
- RPC `get_editability(p_congviec_ids text[], p_target_month date) returns
  table(congviec_id text, is_plan_editable boolean, is_act_editable boolean)`
  — gọi 1 lần cho toàn bộ CONGVIEC đang hiển thị, KHÔNG tự tính lại quy tắc
  diff/lock-date ở client (đây là nguồn chân lý duy nhất, dùng lại y hệt gì
  RLS/RPC lưu dùng — không suy luận thêm quy tắc này ở TypeScript).
  `is_act_editable` ở mức RPC này CHƯA áp cửa sổ ±4 ngày (đó là toán ngày
  thuần, không nhạy cảm — client tự tính riêng để tô UI, xem Task 3).
- RPC `upsert_thuc_hien(payload jsonb) returns jsonb` — payload là **mảng
  jsonb**, mỗi phần tử:
  ```json
  {
    "congviec_id": "CV00001",
    "ngay": "2026-07-15",
    "ke_hoach": true,
    "ket_qua": "G",
    "expected_updated_at": "2026-07-01T10:00:00Z"
  }
  ```
  `ke_hoach`/`ket_qua`/`expected_updated_at` đều **optional** (null/vắng mặt
  = "không đổi trường này"). **CẤM** gửi `ket_qua: "R"` qua RPC này — sẽ bị
  Postgres raise exception yêu cầu dùng RPC khác (xem dưới). Trả về mảng:
  ```json
  [{"congviec_id":"CV00001","ngay":"2026-07-15","status":"applied","reason":null}, ...]
  ```
  `status` ∈ `applied | skipped | conflict`. Bắt buộc đọc kết quả trả về và
  hiện phản hồi khác nhau cho từng trạng thái (không được coi mọi lần gọi là
  thành công).
- RPC `set_ket_qua_r_with_bat_thuong(p_congviec_id text, p_ngay date,
  p_mo_ta text, p_anh_url text default null, p_ngay_phat_hien date default
  null) returns jsonb` — dùng RIÊNG khi tô Actual = R (bất thường), trả về
  `{"thuchien_id":"...", "bat_thuong_id":"..."}`. `p_mo_ta` bắt buộc
  (không rỗng) — nếu người dùng bỏ trống, RPC raise exception, phải validate
  ở client trước khi gọi để UX tốt hơn (không bắt lỗi phải round-trip mới
  biết).
- `src/lib/supabase/client.ts` (browser client), `src/lib/supabase/server.ts`
  (server client) đã có sẵn — Pha 4 chủ yếu chạy ở client component vì cần
  tương tác chuột liên tục (kéo-tô), nên chủ đạo dùng browser client gọi RPC
  trực tiếp qua `.rpc(...)`, KHÔNG cần Server Action cho phần lưu dữ liệu
  hàng ngày (khác với Pha 3 vốn dùng Server Action cho CRUD admin ít khi
  gọi). Vẫn dùng server client cho phần fetch dữ liệu khởi tạo trang
  (Server Component).

### Quy tắc nghiệp vụ phải bảo toàn (đã cài ở DB, KHÔNG tính lại ở client)
1. Quyền sửa Plan/Actual theo `get_editability` — chỉ dùng kết quả RPC này,
   không tự suy luận diff tháng/lock-date/device-lock ở TypeScript.
2. Cửa sổ ±4 ngày cho Actual: đây LÀ toán ngày thuần client được phép tự
   tính để tô UI (xem Task 3), nhưng quyết định thật vẫn là kết quả trả về
   từ `upsert_thuc_hien` (status có thể là `skipped` dù client tưởng hợp
   lệ — phải hiện đúng phản hồi đó, không giả định luôn thành công).
3. Tô Actual = R bắt buộc qua modal nhập mô tả bất thường trước khi gọi
   `set_ket_qua_r_with_bat_thuong` — không được set `ket_qua: "R"` qua
   `upsert_thuc_hien` (RPC sẽ chặn).
4. "Loại bỏ dần": CONGVIEC có `active=false` hoặc tháng đang xem nằm ngoài
   khoảng `[hieu_luc_tu, hieu_luc_den]` (nếu các trường này có giá trị)
   **không hiển thị** trên lưới của tháng đó (nhưng vẫn hiển thị nếu tháng
   nằm trong khoảng hiệu lực dù `active=false` đã set sau đó — tức là lọc
   theo hiệu lực tại THỜI ĐIỂM CỦA THÁNG ĐANG XEM, không phải trạng thái
   hiện tại). Cụ thể điều kiện lọc 1 CONGVIEC được hiển thị cho tháng
   `[thang_dau, thang_cuoi]`:
   ```
   active = true
   AND (hieu_luc_tu IS NULL OR hieu_luc_tu <= thang_cuoi)
   AND (hieu_luc_den IS NULL OR hieu_luc_den >= thang_dau)
   ```

### Cấu trúc dữ liệu grid (thoả thuận chung cho mọi Task, KHÔNG đổi)
Một "hàng" trên lưới = 1 CONGVIEC, kèm thông tin CHITIET/THIETBI cha để hiển
thị và merge rowspan (giống hệ cũ: STT/Nội dung/Tiêu chuẩn dùng
`chitiet.stt`/`chitiet.ten_chi_tiet`/`chitiet.dieu_kien_co_ban`, "Loại" dùng
`congviec.loai_hoat_dong`). Kiểu dữ liệu dùng xuyên suốt (đặt trong
`src/lib/checksheet/types.ts`, Task 1 tạo, các Task sau import lại y hệt,
KHÔNG định nghĩa lại):

```ts
export type KetQua = "G" | "R" | "N";

export type CongViecRow = {
  congViecId: string;       // "CV00001"
  chiTietId: string;        // "CT00001"
  stt: number | null;
  tenChiTiet: string;
  dieuKienCoBan: string | null;
  loaiHoatDong: string;
  thoiGian: number | null;
};

export type ThucHienCell = {
  id: string | null;        // null nếu ô này chưa có dòng thuc_hien nào
  keHoach: boolean;
  ketQua: KetQua;
  updatedAt: string | null; // ISO timestamp, dùng cho optimistic concurrency
};

// Map "CV00001_2026-07-15" -> ThucHienCell
export type ThucHienMap = Record<string, ThucHienCell>;

export function cellKey(congViecId: string, ngayIso: string): string {
  return `${congViecId}_${ngayIso}`;
}
```

## Task 1: Data layer + cascading filter + static grid render

**Mục tiêu**: trang `/checksheet` thay placeholder hiện tại — chọn bộ lọc
Xưởng→Kíp→Nhân viên→Thiết bị→Tháng, tải dữ liệu, render bảng TĨNH (chưa click
được, chưa lưu được — đó là Task 2/3).

### Files cần tạo/sửa

1. `src/lib/checksheet/types.ts` — định nghĩa `KetQua`, `CongViecRow`,
   `ThucHienCell`, `ThucHienMap`, `cellKey()` như trên. Thêm cả:
   ```ts
   export type FilterOptions = {
     xuong: string[];
     kip: string[];
     nhanVien: string[]; // nguoi_phu_trach (msnv) + hiển thị kèm ho_ten
     thietBi: { id: string; maThietBi: string; tenThietBi: string; xuong: string; kip: string; nguoiPhuTrach: string | null }[];
   };
   ```

2. `src/lib/checksheet/queries.ts` — các hàm SERVER-side (nhận 1 Supabase
   client làm tham số, không tự tạo client bên trong, để dùng chung được từ
   cả Server Component lẫn về sau nếu cần):
   - `getFilterOptions(supabase): Promise<FilterOptions>` — SELECT toàn bộ
     `thietbi` (join `nguoidung` lấy `ho_ten` qua `nguoi_phu_trach` nếu cần
     hiển thị tên đầy đủ), suy ra danh sách xưởng/kíp/thiết bị distinct.
   - `getCongViecRows(supabase, thietBiId: string, thangDau: string,
     thangCuoi: string): Promise<CongViecRow[]>` — SELECT `congviec` join
     `chitiet` where `chitiet.thietbi_id = thietBiId`, áp đúng điều kiện lọc
     "loại bỏ dần" ở Global Constraints (viết điều kiện này trong query
     Supabase JS bằng `.or()`/`.filter()` tương ứng — nếu quá phức tạp để
     biểu diễn thuần bằng PostgREST filter, cân nhắc viết 1 SQL function
     `get_congviec_for_month(p_thietbi_id uuid, p_thang date) returns
     setof congviec` — quyết định cách nào rõ ràng hơn và làm, ghi rõ lý do
     trong report), order theo `chitiet.stt, congviec.loai_hoat_dong`.
   - `getThucHien(supabase, congViecIds: string[], thangDau: string,
     thangCuoi: string): Promise<ThucHienMap>` — SELECT `thuc_hien` where
     `congviec_id = any(congViecIds) and ngay between thangDau and
     thangCuoi`, build map bằng `cellKey()`.

3. `src/app/checksheet/page.tsx` (thay nội dung placeholder hiện tại) —
   Server Component: lấy `user`/`profile` như code cũ (giữ nguyên phần hiện
   có: hiển thị tên + nút đăng xuất), gọi `getFilterOptions()`, render
   `<ChecksheetApp currentUser={...} filterOptions={...} />` (client
   component, mọi tương tác lọc/tải dữ liệu tiếp theo xảy ra ở client qua
   browser Supabase client, không phải re-render Server Component mỗi lần
   đổi filter — giữ trang mượt như hệ cũ).

4. `src/app/checksheet/ChecksheetApp.tsx` (`"use client"`) — quản lý state
   bộ lọc (Xưởng→Kíp→Nhân viên→Thiết bị, cascading: chọn Xưởng thu hẹp Kíp,
   chọn Kíp thu hẹp Nhân viên/Thiết bị, v.v. — thuật toán y hệt hệ cũ:
   lọc mảng `filterOptions.thietBi` theo các lựa chọn đã chọn ở cấp cao
   hơn), input chọn tháng (`<input type="month">`), khi đủ Thiết bị+Tháng
   thì gọi (qua browser client) `getCongViecRows`/`getThucHien` (import lại
   2 hàm ở `queries.ts` — chúng nhận `supabase` client làm tham số nên dùng
   được cả ở client component với browser client), render
   `<ChecksheetTable rows={...} thucHien={...} thangDau={...}
   thangCuoi={...} />`.

5. `src/app/checksheet/ChecksheetTable.tsx` (`"use client"`) — render bảng
   TĨNH: cột đầu STT/Nội dung/Tiêu chuẩn/Loại/Thời gian (rowspan-merge theo
   `stt`→`tenChiTiet`→`dieuKienCoBan` giống hệ cũ — hàng liền kề cùng giá trị
   thì merge, dùng thuật toán `calcColSpan` tương tự bản cũ đã mô tả trong
   CLAUDE.md, viết lại bằng TypeScript thuần), 31 cột ngày (chỉ hiện số ngày
   thực có trong tháng — tháng 2 chỉ 28/29 ngày, không vẽ cột 29-31 nếu
   tháng không có). Mỗi ô ngày render tạm dạng 2 nửa tam giác TĨNH (không
   click được) dựa theo `thucHien[cellKey(...)]` (mặc định `{keHoach:false,
   ketQua:'N'}` nếu không có trong map) — dùng CSS y hệt hệ cũ: `<div>` chứa
   2 pseudo-tam giác `.tri-plan`/`.tri-act` với class màu `bg-Y`/`bg-G`/
   `bg-R`/`bg-N` (thêm các class Tailwind tương ứng hoặc CSS module riêng
   `checksheet.module.css` nếu Tailwind không biểu diễn được clip-path dễ
   dàng — quyết định cách nào gọn hơn).

### Verify

1. `npx tsc --noEmit`, `npm run build` sạch.
2. Script Node tạm (xoá sau khi xong) seed vào Supabase local: 1 THIETBI +
   2 CHITIET (mỗi cái 1-2 CONGVIEC) + vài dòng THUC_HIEN rải rác trong 1
   tháng, gọi thẳng `getCongViecRows`/`getThucHien` (import trực tiếp từ
   `src/lib/checksheet/queries.ts` bằng `tsx` hoặc biên dịch tạm — nếu khó
   import trực tiếp file TS từ script Node thuần, viết lại đúng logic
   truy vấn ngay trong script để verify kết quả tương đương) xác nhận: dữ
   liệu trả về đúng, CONGVIEC có `active=false` hoặc ngoài `hieu_luc_tu/den`
   của tháng đang xem KHÔNG xuất hiện trong kết quả.
3. Chạy `npm run dev -p 4000`, đăng nhập bằng 1 user test (Pha 2 đã tạo hoặc
   tạo mới qua Admin Users page nếu cần), xác nhận `/checksheet` render bộ
   lọc cascading đúng, chọn xong Thiết bị+Tháng thấy bảng tĩnh hiện đúng số
   hàng/cột và màu ô ban đầu khớp dữ liệu seed.

---

## Task 2: Cell tương tác — click, kéo-tô, P4/P8 auto-fill (state thuần client)

**Phụ thuộc Task 1**: dùng lại `src/lib/checksheet/types.ts` nguyên trạng
(không đổi), `ChecksheetTable.tsx` đã tồn tại — Task này thay phần render ô
TĨNH bằng ô TƯƠNG TÁC, và thêm state quản lý ở cấp `ChecksheetApp.tsx`.

**Phạm vi Task này CHƯA gọi server để lưu** — chỉ quản lý state phía client
(giống hệ cũ: người dùng tô nhiều ô rồi mới bấm "Lưu" 1 lần, Task 3 mới nối
dây phần lưu thật).

### Files cần tạo/sửa

1. `src/lib/checksheet/gridReducer.ts` — 1 `useReducer` reducer quản lý
   toàn bộ state ô đã tô + đánh dấu "dirty" (đã đổi, chưa lưu):
   ```ts
   export type GridState = {
     cells: ThucHienMap;              // giá trị HIỆN TẠI đang hiển thị
     dirty: Set<string>;              // cellKey của các ô đã đổi so với lúc tải
     initial: ThucHienMap;            // snapshot lúc tải, để so sánh dirty và để revert
   };
   export type GridAction =
     | { type: "load"; cells: ThucHienMap }
     | { type: "setPlan"; congViecId: string; ngay: string; keHoach: boolean }
     | { type: "setAct"; congViecId: string; ngay: string; ketQua: KetQua }
     | { type: "markSaved"; keys: string[]; savedAt: string }; // sau khi lưu thành công, đồng bộ lại initial + xoá dirty cho các key đó
   export function gridReducer(state: GridState, action: GridAction): GridState { ... }
   ```
   Viết là hàm THUẦN (pure function, không side-effect) để verify được bằng
   Node script/unit test thuần không cần trình duyệt.

2. `src/app/checksheet/ChecksheetTable.tsx` (sửa) — thay ô tĩnh bằng
   `<Cell />` (file mới, xem #3), quản lý 1 `isPaintingRef` (useRef boolean)
   ở cấp bảng để hỗ trợ kéo-tô: `onPointerDown` bắt đầu tô + set
   `isPaintingRef.current = true`, `onPointerUp`/window blur tắt, mỗi ô có
   `onPointerEnter` — nếu đang tô thì áp lại đúng thao tác vừa dùng ở ô đầu
   tiên (tool hiện tại: đang tô Plan=Y, Plan=N, hay 1 giá trị Actual cụ thể
   — lưu "current painting value" khi bắt đầu kéo).

3. `src/app/checksheet/Cell.tsx` (`"use client"`) — port từ `ChecksheetCell`
   class cũ (mô tả trong CLAUDE.md "Client-side structure"): 1 ô chia chéo
   Plan (tam giác trên-phải)/Actual (tam giác dưới-trái). Xác định vùng
   click bằng công thức y hệt hệ cũ: lấy `getBoundingClientRect()` của ô,
   `x,y` = toạ độ con trỏ trừ đi góc trên-trái, `isPlanZone = x*h > y*w`
   (w,h = width/height của ô). Click vào vùng Plan → dispatch `setPlan`
   (toggle Y/N — click 1 cái = Y, click lại = N, giống hệ cũ). Click vào
   vùng Actual → dispatch `setAct` — Task này chỉ cần cho phép cycle qua
   `N → G → N` bằng click thường (KHÔNG cho chọn R bằng click thường — R chỉ
   set được qua modal ở Task 4, nhưng Task 2 vẫn phải dispatch được
   `setAct` với `ketQua: "R"` về mặt kỹ thuật vì Task 4 sẽ tái dùng action
   này, chỉ là Task 2 tự nó không có UI nào gọi tới ketQua="R").
   Props nhận `editable: {plan: boolean; act: boolean}` (Task 3 sẽ truyền
   giá trị thật từ `get_editability`; Task 2 tạm truyền `{plan: true, act:
   true}` cứng từ `ChecksheetApp` để có cái test — Task 3 sẽ thay bằng giá
   trị thật, không đổi API của `Cell`).

4. Row-level "tool" P4/P8 (tô Plan mỗi 4/8 ngày bắt đầu từ ngày được click) —
   thêm 2 nút nhỏ đầu mỗi hàng (hoặc icon) gọi 1 hàm `autoFillPlan(congViecId,
   startDay, interval)` ở `ChecksheetApp.tsx` — dispatch nhiều `setPlan`
   liên tiếp cho các ngày `startDay, startDay+interval, ...` tới hết tháng
   (thuật toán y hệt `onAutoFill` cũ, không lùi về ngày trước).

5. Nút "Lưu" — Task này CHƯA gọi server, chỉ hiện disabled nếu
   `state.dirty.size === 0`, click thì tạm thời chỉ `console.log` hoặc hiện
   toast "Sẽ nối dây lưu thật ở Task 3" (rõ ràng đây là stub tạm thời, ghi
   chú trong code bằng comment ngắn, Task 3 sẽ thay hẳn).

### Verify

1. `npx tsc --noEmit`, `npm run build` sạch.
2. **Viết 1 file test thuần Node** (không cần trình duyệt, vì `gridReducer`
   là pure function) — không dùng framework test nào, chỉ 1 script
   `.mjs`/`.ts` chạy bằng `node`/`npx tsx`, import `gridReducer`, gọi qua
   1 loạt action, `assert` kết quả state đúng (dùng `node:assert`). ĐÂY LÀ
   FILE VĨNH VIỄN, KHÔNG XOÁ — đặt tại
   `src/lib/checksheet/gridReducer.manual-test.mjs` (hoặc `.ts` nếu chạy
   được thẳng bằng `node --experimental-strip-types`/`tsx`), vì đây là logic
   thuần quan trọng, đáng giữ lại làm regression check thủ công (chạy bằng
   tay, không có CI, nhưng vẫn commit vào repo để người sau chạy lại được).
   Test tối thiểu: setPlan bật/tắt đúng, setAct đổi đúng, dirty đúng tập hợp
   sau nhiều thao tác, `markSaved` xoá đúng key khỏi dirty và đồng bộ
   `initial`.
3. Chạy `npm run dev -p 4000`, xác nhận thủ công: click 1 ô đổi màu đúng
   vùng Plan/Actual, kéo chuột qua nhiều ô cùng lúc tô hàng loạt đúng giá
   trị vừa chọn, bấm nút P4/P8 tô đúng các ngày cách nhau 4/8, nút Lưu bật
   khi có ô dirty và tắt khi không có.

---

## Task 3: Nối dây server thật — get_editability + upsert_thuc_hien + optimistic concurrency

**Phụ thuộc Task 1 + Task 2**: `Cell.tsx`/`gridReducer.ts` đã tồn tại,
KHÔNG đổi API của chúng (`editable` prop, action shapes) — chỉ thay nguồn
giá trị `editable` (từ hard-code sang RPC thật) và nối nút "Lưu" vào RPC
thật.

### Files cần tạo/sửa

1. `src/lib/checksheet/editability.ts` — hàm
   `getEditability(supabase, congViecIds: string[], thangDau: string):
   Promise<Record<string, {plan: boolean; act: boolean}>>` gọi RPC
   `get_editability(p_congviec_ids, p_target_month)` (dùng `thangDau`, ngày
   đầu tháng, làm `p_target_month` — đúng như thiết kế RPC dùng mức tháng,
   không phải mức ngày), build map theo `congviec_id`.

2. `src/lib/checksheet/actWindow.ts` — hàm THUẦN (không async, dễ test)
   `isWithinActWindow(targetDateIso: string, todayIso: string): boolean` —
   `Math.abs(diffDays) <= 4` (dùng để TÔ UI gợi ý ô nào trong cửa sổ ±4
   ngày, KHÔNG phải quyết định thật — quyết định thật vẫn là kết quả
   `upsert_thuc_hien` trả về). Dùng hàm này trong `Cell.tsx` chỉ để style
   nhạt/đậm hoặc disabled-hint, không chặn cứng click (để người dùng vẫn
   thấy phản hồi `skipped` rõ ràng thay vì bị chặn âm thầm phía client —
   khác 1 chút so với hệ cũ vốn chặn hẳn phía client, nhưng đúng tinh thần
   "UI chỉ gợi ý, server quyết định thật" của thiết kế mới).

3. `src/app/checksheet/ChecksheetApp.tsx` (sửa):
   - Sau khi tải `CongViecRow[]`, gọi `getEditability(...)`, lưu vào state,
     truyền xuống từng `Cell` qua `ChecksheetTable`.
   - Nút "Lưu" thật: build payload từ `state.dirty` (chỉ gửi các ô đã đổi,
     KHÔNG gửi cả 31 ô/hàng như hệ cũ), với mỗi cellKey lấy
     `expected_updated_at` từ `state.initial[key]?.updatedAt ?? null`, gọi
     `supabase.rpc("upsert_thuc_hien", { payload })`. Đọc mảng kết quả trả
     về, với mỗi phần tử: `applied` → dispatch `markSaved`; `skipped`/
     `conflict` → GIỮ NGUYÊN giá trị dirty đó (không markSaved) và hiện
     danh sách các ô bị từ chối kèm `reason` (component nhỏ hiển thị danh
     sách, không cần đẹp, chỉ cần rõ ràng — vd 1 khối cảnh báo liệt kê
     "Ngày 15, CV00001: Không có quyền sửa Actual (ngoài cửa sổ cho phép)").
   - **Riêng ô Actual = R**: KHÔNG được đưa vào payload `upsert_thuc_hien`
     (RPC sẽ raise exception nếu có) — chặn NGAY tại chỗ build payload:
     nếu `dirty` chứa 1 key có `cells[key].ketQua === 'R'` mà
     `initial[key].ketQua !== 'R'` (tức là người dùng vừa đổi sang R),
     loại nó khỏi payload lưu thường và báo cho người dùng rằng ô đó cần
     xử lý qua modal bất thường (Task 4 sẽ thay bằng flow modal bắt buộc
     ngay lúc click, nhưng Task 3 cần code phòng thủ này để không gọi sai
     RPC nếu Task 4 chưa merge — hoặc, ĐƠN GIẢN HƠN: vì Task 4 chạy ngay
     sau Task 3 trong cùng nhánh, có thể chọn cách disable hoàn toàn việc
     chọn "R" bằng click thường ở Task 2 đã làm rồi — chỉ cần đảm bảo
     `upsert_thuc_hien` không BAO GIỜ nhận `ket_qua: "R"` trong payload,
     bằng cách lọc nó ra một cách tường minh ở bước build payload này, dù
     Task 2 đã không có UI nào tạo ra giá trị đó).

### Verify

1. `npx tsc --noEmit`, `npm run build` sạch.
2. Test thuần cho `isWithinActWindow` — thêm vào cùng kiểu file
   `.manual-test.mjs` như Task 2, hoặc file riêng
   `src/lib/checksheet/actWindow.manual-test.mjs`.
3. Script Node tạm (xoá sau khi xong) gọi thẳng `get_editability` và
   `upsert_thuc_hien` qua Supabase JS với 1 user test, xác nhận: (a) đúng
   `is_plan_editable`/`is_act_editable` theo các kịch bản diff tháng đã có
   sẵn test SQL ở `supabase/tests/smoke_test.sql` (không cần lặp lại hết,
   chỉ cần xác nhận RPC gọi từ JS trả đúng shape); (b) `upsert_thuc_hien`
   với payload hợp lệ trả `status: "applied"`; (c) payload với
   `expected_updated_at` sai (giả lập xung đột) trả `status: "conflict"`;
   (d) payload có `ket_qua: "R"` bị RPC raise exception (xác nhận code phía
   client không bao giờ tạo ra request này, nhưng vẫn xác nhận backend chặn
   đúng nếu lỡ xảy ra).
4. Chạy `npm run dev -p 4000`, xác nhận thủ công bằng 1 user thường: tô vài
   ô Plan/Actual hợp lệ → Lưu → reload trang → dữ liệu còn nguyên; thử tô 1
   ô Actual ngoài cửa sổ ±4 ngày → Lưu → thấy cảnh báo ô đó bị `skipped`
   với lý do rõ ràng, ô không đổi màu sau reload.

---

## Task 4: Modal bất thường (R), tooltip, ảnh thiết bị, in/PDF

**Phụ thuộc Task 1-3**: dùng lại toàn bộ hạ tầng trên, đây là lớp UI cuối
cùng hoàn thiện trải nghiệm Pha 4.

### Files cần tạo/sửa

1. `src/app/checksheet/BatThuongModal.tsx` (`"use client"`) — modal bắt
   buộc khi người dùng cố tô 1 ô Actual thành "R": form nhập `mo_ta` (bắt
   buộc, validate không rỗng TRƯỚC khi gọi RPC — như Global Constraints đã
   nêu), `anh_url` (input text dán link Google Drive, tuỳ chọn — theo đúng
   quyết định đã chốt: KHÔNG dùng Supabase Storage, giữ link Drive như ảnh
   sơ đồ thiết bị), `ngay_phat_hien` (mặc định hôm nay, cho sửa). Submit gọi
   `supabase.rpc("set_ket_qua_r_with_bat_thuong", {...})`; thành công thì
   dispatch `setAct` với `ketQua: "R"` VÀ `markSaved` luôn cho ô đó (vì RPC
   này đã lưu thẳng xuống DB ngay lập tức, không qua hàng đợi dirty/Lưu như
   các ô khác — cập nhật lại `updatedAt` từ giá trị server trả về nếu RPC
   trả kèm, nếu RPC hiện tại không trả `updated_at` thì gọi lại 1 lần
   `getThucHien` cho riêng ô đó để đồng bộ, ghi rõ cách nào đã chọn trong
   report).

2. `src/app/checksheet/Cell.tsx` (sửa) — khi click vùng Actual mà giá trị
   sắp đổi thành "R" (theo chu trình N→G→R→N hoặc theo cách khác Task 2 đã
   làm — Task 4 mở rộng chu trình để CÓ thêm trạng thái R, trước đó Task 2
   chỉ cycle N↔G): thay vì dispatch `setAct` trực tiếp, gọi 1 callback
   `onRequestBatThuong(congViecId, ngay)` (prop mới) để `ChecksheetApp` mở
   `BatThuongModal` — việc dispatch `setAct("R")` CHỈ xảy ra sau khi modal
   submit thành công (không lạc quan tô đỏ trước khi biết chắc RPC thành
   công, khác với Plan/Act thường vốn tô lạc quan trước rồi Lưu sau).
   Hover vào 1 ô đang là "R" hiện tooltip đọc `mo_ta` — cần thêm dữ liệu
   `mo_ta` vào `ThucHienCell`/`ThucHienMap` khi tải (mở rộng
   `getThucHien` ở Task 1 để join `bat_thuong` lấy `mo_ta`/`trang_thai` cho
   các dòng `ket_qua='R'` — sửa `src/lib/checksheet/queries.ts`, thêm field
   optional `batThuongMoTa?: string | null` vào `ThucHienCell` trong
   `types.ts`).

3. `src/app/checksheet/EquipmentImageModal.tsx` (`"use client"`) — modal
   xem ảnh thiết bị (pan/zoom/rotate) mở từ 1 nút/icon trên `ChecksheetApp`
   khi đã chọn Thiết bị, dùng `thietBi.anhUrl` (đã có sẵn từ
   `FilterOptions.thietBi`, cần thêm field `anhUrl` vào type đó ở Task 1
   nếu implementer Task 1 quên — nếu thiếu, Task 4 tự bổ sung field còn
   thiếu vào `types.ts`/`queries.ts`, đây là phần mở rộng hợp lý). Pan/zoom
   bằng CSS transform + state `{scale, x, y, rotate}` cập nhật qua
   `onWheel`/`onPointerDown+onPointerMove`/nút xoay 90°.

4. Print/PDF — thêm `src/app/checksheet/print.css` (import vào
   `ChecksheetApp.tsx` hoặc `globals.css` bằng `@media print`), style A3
   ngang tương tự hệ cũ (ẩn phần điều khiển/nút bấm khi in, chỉ hiện bảng),
   nút "In" gọi `window.print()`.

### Verify

1. `npx tsc --noEmit`, `npm run build` sạch.
2. Script Node tạm gọi `set_ket_qua_r_with_bat_thuong` xác nhận: mô tả rỗng
   bị chặn (validate client-side trước khi gọi — viết 1 hàm thuần
   `validateBatThuongMoTa(text: string): string | null` trả về thông báo
   lỗi hoặc `null` nếu hợp lệ, test bằng Node script thuần); RPC hợp lệ tạo
   đồng thời `thuc_hien.ket_qua='R'` + `bat_thuong` (đã verify ở Pha 1, ở
   đây chỉ cần xác nhận gọi được từ đúng RPC path client dùng).
3. Chạy `npm run dev -p 4000`, xác nhận thủ công: tô 1 ô Actual thành R →
   modal bắt buộc hiện ra, không nhập mô tả không submit được, submit xong
   ô chuyển đỏ; hover vào ô đỏ thấy tooltip đúng mô tả; mở modal ảnh thiết
   bị pan/zoom/xoay được (nếu thiết bị test có `anh_url` hợp lệ — nếu
   không có ảnh thật để test, xác nhận modal hiện thông báo "Chưa có ảnh"
   hợp lý thay vì lỗi trắng trang); bấm nút In thấy layout in hợp lý qua
   Print Preview của trình duyệt (không cần in giấy thật).
