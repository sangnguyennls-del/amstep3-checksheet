# Pha 3: Admin CRUD (Users / Equipment / Settings)

## Context

Đây là 1 phần của dự án migrate "Checksheet AM Bước 3" (Google Apps Script) sang
Supabase + Next.js. Pha 1 (schema+RLS) và Pha 2 (Auth) đã hoàn tất và merge vào
`master`. Pha 3 xây dựng trang quản trị (Admin) cho 3 nhóm dữ liệu: người dùng,
cây thiết bị (THIETBI/CHITIET/CONGVIEC), và cài đặt hệ thống (CAI_DAT).

## Global Constraints (áp dụng cho MỌI task dưới đây)

- Stack: Next.js 16 App Router + TypeScript + Tailwind. Repo dùng `src/` dir,
  path alias `@/*` → `src/*`.
- **QUAN TRỌNG - Next.js 16 khác bản bạn quen thuộc**: đọc
  `node_modules/next/dist/docs/` nếu nghi ngờ 1 API/convention đã đổi trước khi
  dùng (ví dụ: `middleware.ts` đã đổi thành `proxy.ts`, xem
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
  Đừng giả định kiến thức Next.js cũ là đúng cho bản này.
- Supabase client đã có sẵn:
  - `src/lib/supabase/client.ts` — browser client (client components).
  - `src/lib/supabase/server.ts` — server client, dùng cookie của request hiện
    tại (Server Components/Server Actions), tôn trọng RLS theo user đăng nhập.
  - **CHƯA có** service-role client — Task 1 phải tạo
    `src/lib/supabase/admin.ts` dùng biến môi trường `SUPABASE_SERVICE_ROLE_KEY`
    (đã có sẵn trong `.env.local`). File này CHỈ được import từ code chạy
    server (Server Actions `"use server"`), không bao giờ từ file có
    `"use client"` — vì service role bỏ qua toàn bộ RLS.
- Schema Postgres đã tồn tại (xem `supabase/migrations/0001_schema.sql`,
  `0002_functions_triggers.sql`, `0003_rls_policies.sql`, `0004_grants.sql`):
  - `nguoidung(id uuid PK -> auth.users.id, msnv text unique, ho_ten text,
    don_vi text, vai_tro vai_tro_enum)` — enum `vai_tro_enum` có 3 giá trị:
    `'user' | 'admin' | 'adminm'`.
  - `thietbi(id uuid PK, ma_thiet_bi text unique, ten_thiet_bi text, cum text,
    khu_vuc text, xuong text, kip text, lanh_dao text, truong_ca text,
    nguoi_phu_trach text -> FK nguoidung.msnv, anh_url text)`.
  - `chitiet(id text PK dạng "CT00001" tự sinh, thietbi_id uuid FK, stt int,
    ten_chi_tiet text, dieu_kien_co_ban text)`.
  - `congviec(id text PK dạng "CV00001" tự sinh, chitiet_id text FK,
    loai_hoat_dong text, thoi_gian numeric, tan_suat_chu text,
    tan_suat_so numeric, active boolean, hieu_luc_tu date, hieu_luc_den date,
    ngay_loai_bo date)`.
  - `cai_dat(key text PK, value text)` — 5 dòng cố định:
    `LOCK_DATE` (số ngày, mặc định "5"), `ENABLE_LOCK_DATE`,
    `ENABLE_TIME_LIMIT`, `ENABLE_DEVICE_LOCK`, `MAINTENANCE_MODE` (tất cả 4
    cái sau lưu giá trị chuỗi `"true"`/`"false"`).
  - RLS đã bật sẵn: đọc (`select`) mở cho mọi authenticated user trên
    `thietbi/chitiet/congviec/cai_dat`; **ghi** (`insert/update/delete`) chỉ
    role `admin`/`adminm` (hàm `current_role_is_admin()`). Trên `nguoidung`:
    user tự đọc/sửa hàng của mình HOẶC admin/adminm đọc/sửa mọi hàng; chỉ
    admin/adminm được insert/delete.
  - Trigger `fn_guard_vai_tro_change` trên `nguoidung`: chỉ role `adminm` mới
    được đặt `vai_tro='adminm'` cho bất kỳ ai (kể cả chính họ); một `admin`
    thường cố set `vai_tro='adminm'` sẽ nhận lỗi Postgres
    (`raise exception 'Chỉ AdminM mới được cấp quyền AdminM'`). Bắt lỗi này ở
    Server Action và hiển thị thông báo tiếng Việt thân thiện, KHÔNG để lỗi
    Postgres thô hiện ra UI.
  - `ma_thiet_bi` tự động chuẩn hoá (trim+upper) bởi trigger DB — không cần
    làm gì thêm ở frontend cho việc này.
- Helper đã có: `src/lib/auth/username.ts` (`usernameToEmail(username)`).
- Server Actions viết theo pattern đã có ở `src/app/actions/auth.ts` (file
  `"use server"`, dùng `createClient()` từ `lib/supabase/server`).
- Toàn bộ text UI (label, nút, thông báo lỗi) bằng **tiếng Việt**, theo đúng
  quy ước dự án.
- Style: Tailwind utility class thuần, theo đúng "look" đơn giản đã có ở
  `src/app/login/LoginForm.tsx` và `src/app/checksheet/page.tsx` (viền
  `border`, bo góc `rounded-md`, tông xám/trắng, không dùng thư viện UI
  component nào khác — không cài thêm package UI mới).
- KHÔNG cần viết automated test framework (chưa có trong repo). Verify bằng:
  `npx tsc --noEmit` sạch, `npm run build` sạch, và một bước verify thủ công
  mô tả cụ thể trong từng task (dùng script Node tạm gọi Supabase JS trực
  tiếp để giả lập, giống cách Pha 2 đã verify — xoá script tạm sau khi xong).
- Mọi Server Action mutate dữ liệu Admin phải tự kiểm tra người gọi có phải
  admin/adminm không (defense-in-depth phía sau RLS, không chỉ dựa vào ẩn
  UI) bằng helper `requireAdmin()` (Task 1 tạo, các task sau tái sử dụng).

## Task 1: Users CRUD + shared admin gate/helpers

**Mục tiêu**: trang `/admin/users` để Admin/AdminM xem danh sách, tạo, sửa,
xoá, đổi mật khẩu người dùng. Đồng thời tạo các helper/khung dùng chung mà
Task 2 và Task 3 sẽ tái sử dụng nguyên trạng (không được đổi tên/API khác đi).

### Files cần tạo

1. `src/lib/supabase/admin.ts`
   ```ts
   import { createClient } from "@supabase/supabase-js";

   // CHỈ import file này từ Server Action ("use server"). Service role bỏ
   // qua toàn bộ RLS -- không bao giờ được dùng ở client component.
   export function createAdminClient() {
     return createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SERVICE_ROLE_KEY!,
       { auth: { autoRefreshToken: false, persistSession: false } },
     );
   }
   ```

2. `src/lib/auth/require-admin.ts` — helper dùng chung cho MỌI Server Action
   quản trị (Task 1/2/3 đều gọi hàm này đầu tiên):
   ```ts
   import { createClient } from "@/lib/supabase/server";

   export type AdminContext = { userId: string; vaiTro: "admin" | "adminm" };

   // Throw nếu người gọi hiện tại không phải admin/adminm. Dùng client
   // server thường (KHÔNG dùng service role) để câu query này vẫn đi qua
   // RLS -- một user thường sẽ không tự đọc được vai_tro của người khác,
   // nhưng đọc được vai_tro CHÍNH MÌNH (RLS nguoidung_select cho phép
   // auth.uid() = id), nên luôn đọc được để tự kiểm tra.
   export async function requireAdmin(): Promise<AdminContext> {
     const supabase = await createClient();
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) throw new Error("Chưa đăng nhập");

     const { data: profile } = await supabase
       .from("nguoidung")
       .select("vai_tro")
       .eq("id", user.id)
       .maybeSingle();

     if (profile?.vai_tro !== "admin" && profile?.vai_tro !== "adminm") {
       throw new Error("Không có quyền truy cập trang quản trị");
     }
     return { userId: user.id, vaiTro: profile.vai_tro };
   }
   ```

3. `src/app/admin/layout.tsx` — Server Component, gọi `requireAdmin()`; nếu
   throw (không phải admin), `redirect("/checksheet")`. Render một thanh điều
   hướng đơn giản với 3 link: "Người dùng" (`/admin/users`), "Thiết bị"
   (`/admin/equipment`), "Cài đặt" (`/admin/settings`), cộng link "Về
   Checksheet" (`/checksheet`). Bọc `{children}` bên dưới.

4. `src/app/admin/page.tsx` — trang chỉ mục đơn giản, hiển thị 3 thẻ/link
   tới 3 mục trên (tận dụng layout đã có nav, trang này có thể chỉ là
   heading + mô tả ngắn).

5. `src/app/actions/users.ts` (`"use server"`), export các Server Action:
   - `createUser(_prevState, formData)`: đọc `username, password, msnv,
     hoTen, donVi, vaiTro` từ formData. Gọi `requireAdmin()` trước. Nếu
     `vaiTro === "adminm"` và người gọi không phải `adminm`, trả lỗi tiếng
     Việt ngay tại đây (không cần chờ DB trigger, phản hồi nhanh hơn — nhưng
     KHÔNG bỏ qua việc DB trigger vẫn là chốt chặn thật). Dùng
     `createAdminClient().auth.admin.createUser({ email:
     usernameToEmail(username), password, email_confirm: true })`, sau đó
     insert vào `nguoidung` (dùng admin client vì vừa tạo xong chưa có
     session để RLS tự cho phép — nhưng đã qua `requireAdmin()` ở trên nên
     an toàn). Nếu bước insert `nguoidung` lỗi, phải rollback bằng cách xoá
     lại auth user vừa tạo (`createAdminClient().auth.admin.deleteUser(id)`)
     để không tạo user "mồ côi" không có profile.
   - `updateUser(_prevState, formData)`: sửa `hoTen, donVi, vaiTro` theo
     `id`. Dùng client server thường (không phải admin client) để UPDATE
     `nguoidung` — vậy RLS + trigger guard áp dụng tự nhiên. Bắt lỗi Postgres
     có chuỗi `"Chỉ AdminM"` và đổi thành thông báo lỗi field-level thân
     thiện thay vì show nguyên `error.message` thô (nhưng nếu không khớp
     pattern đó thì vẫn hiển thị `error.message` để không nuốt lỗi thật).
   - `deleteUser(id: string)`: `requireAdmin()`, rồi
     `createAdminClient().auth.admin.deleteUser(id)` (cascade tự xoá
     `nguoidung` nhờ `on delete cascade` đã khai báo ở schema).
   - `resetUserPassword(_prevState, formData)`: `requireAdmin()`, đọc
     `id, newPassword`, gọi
     `createAdminClient().auth.admin.updateUserById(id, { password:
     newPassword })`. Đây là admin đặt lại mật khẩu cho người khác, KHÔNG
     cần mật khẩu cũ (khác với self-service change-password của hệ cũ —
     tính năng self-service không thuộc phạm vi task này, để dành sau nếu
     cần).

6. `src/app/admin/users/page.tsx` — Server Component: query toàn bộ
   `nguoidung` (order by `msnv`), lấy `vaiTro` của người đang đăng nhập từ
   `requireAdmin()` (layout cha đã gọi rồi nhưng Server Component con gọi lại
   cũng được, kết quả cache theo request của Next.js). Render
   `<UsersTable users={...} currentUserVaiTro={...} />`.

7. `src/app/admin/users/UsersTable.tsx` (`"use client"`) — bảng liệt kê
   (cột: MSNV, Họ tên, Đơn vị, Vai trò, hành động Sửa/Xoá/Đặt lại mật khẩu),
   một form thêm mới ở trên cùng hoặc modal đơn giản (dùng `<dialog>` HTML
   hoặc show/hide bằng state — không cần thư viện modal). Dùng
   `useActionState` cho từng action giống `LoginForm.tsx`. Ô chọn "Vai trò"
   chỉ hiện option `AdminM` nếu `currentUserVaiTro === "adminm"` (còn lại chỉ
   `User`/`Admin`) — đây là UX, chốt chặn thật nằm ở DB trigger.

### Verify

1. `npx tsc --noEmit` và `npm run build` sạch trong worktree.
2. Test thủ công bằng script Node tạm (xoá sau khi xong, đặt trong thư mục
   worktree, KHÔNG commit): dùng `@supabase/supabase-js` với anon key đăng
   nhập là 1 user `adminm` có sẵn (tạo bằng service role trong script nếu
   chưa có), gọi thẳng các bước tương đương createUser/updateUser/deleteUser
   qua Supabase JS (vì Server Action không gọi được bằng curl thô — xem cách
   Pha 2 đã làm) để xác nhận: (a) tạo user mới thành công, có cả
   auth.users lẫn nguoidung; (b) `admin` thường không set được `vai_tro=
   'adminm'` (nhận lỗi rõ ràng); (c) `adminm` set được; (d) xoá user xoá cả
   2 bảng.
3. Chạy `npm run dev -p 4000` (cổng 3000-3450 bị Windows chặn trên máy này),
   dùng `curl` xác nhận `/admin/users` trả 307 redirect nếu chưa đăng nhập
   (đã có proxy.ts xử lý), và trả 200 khi có cookie hợp lệ nếu có thể mô
   phỏng (nếu không mô phỏng được cookie qua curl thì ghi rõ giới hạn này
   trong báo cáo, không bịa kết quả).

---

## Task 2: Equipment CRUD (THIETBI → CHITIET → CONGVIEC)

**Phụ thuộc Task 1**: dùng lại `src/lib/auth/require-admin.ts` và
`src/lib/supabase/admin.ts` (đã tồn tại, không tạo lại, không đổi API).
`src/app/admin/layout.tsx` đã tồn tại, không cần tạo lại.

**Mục tiêu**: trang `/admin/equipment` quản lý cây 3 cấp thay cho sheet
Config phẳng của hệ cũ.

### Files cần tạo

1. `src/app/actions/equipment.ts` (`"use server"`):
   - `createThietBi`, `updateThietBi`, `deleteThietBi`
   - `createChiTiet`, `updateChiTiet`, `deleteChiTiet`
   - `createCongViec`, `updateCongViec`, `deleteCongViec`
   - Mỗi action gọi `requireAdmin()` đầu tiên, dùng client server thường
     (RLS đã cho phép admin/adminm ghi `thietbi/chitiet/congviec`).
   - `createThietBi`/`updateThietBi`: field `nguoi_phu_trach` là MSNV dạng
     text, có FK tới `nguoidung.msnv` — nếu MSNV không tồn tại sẽ lỗi FK
     Postgres (`violates foreign key constraint`), bắt lỗi này và trả về
     thông báo tiếng Việt "MSNV người phụ trách không tồn tại trong hệ
     thống" thay vì lỗi Postgres thô.
   - `deleteThietBi`: xoá cascade tới `chitiet`→`congviec` (đã khai báo `on
     delete cascade` trong schema) — CẢNH BÁO rõ trong UI trước khi xoá
     (dùng `confirm()` phía client) vì đây là xoá vĩnh viễn, không giống
     "loại bỏ dần" (mục C trong CLAUDE.md dùng cờ `active` ở CONGVIEC, không
     phải xoá cứng — action xoá này chỉ dùng khi admin thật sự muốn xoá
     nhầm/dữ liệu rác, không phải quy trình "loại bỏ hạng mục" thông thường).
   - `updateCongViec`: cho phép sửa `active` (boolean), `hieu_luc_tu`,
     `hieu_luc_den`, `ngay_loai_bo` — đây chính là cơ chế "loại bỏ dần" mục
     C của CLAUDE.md, không cần xoá dòng, chỉ cần set `active=false` +
     `ngay_loai_bo`.

2. `src/app/admin/equipment/page.tsx` — Server Component: query toàn bộ
   `thietbi` (order by `ma_thiet_bi`). Render `<EquipmentList items={...}
   />`.

3. `src/app/admin/equipment/EquipmentList.tsx` (`"use client"`) — bảng liệt
   kê thiết bị (Mã, Tên, Xưởng, Kíp, Người phụ trách) + form/modal thêm mới,
   mỗi dòng có link "Chi tiết" trỏ tới `/admin/equipment/[id]` và nút Xoá.

4. `src/app/admin/equipment/[id]/page.tsx` — Server Component: query 1
   `thietbi` theo `id` (404 qua `notFound()` nếu không thấy), kèm toàn bộ
   `chitiet` của nó (order by `stt`), và với mỗi `chitiet` là toàn bộ
   `congviec` của nó. Render `<EquipmentDetail thietBi={...}
   chiTietList={...} />` (chiTietList là mảng đã lồng sẵn `congviec` con).

5. `src/app/admin/equipment/[id]/EquipmentDetail.tsx` (`"use client"`) —
   form sửa thông tin THIETBI ở trên cùng (ma_thiet_bi, ten_thiet_bi, cum,
   khu_vuc, xuong, kip, lanh_dao, truong_ca, nguoi_phu_trach); bên dưới là
   danh sách CHITIET, mỗi CHITIET expand ra danh sách CONGVIEC của nó (thêm/
   sửa/xoá được ở cả 2 cấp). Dùng `useActionState` theo pattern đã có.

### Verify

1. `npx tsc --noEmit` và `npm run build` sạch.
2. Script Node tạm (xoá sau khi xong) gọi thẳng Supabase JS (đăng nhập bằng
   1 user `admin` test) mô phỏng: tạo THIETBI → tạo CHITIET → tạo CONGVIEC →
   sửa CONGVIEC.active=false → xoá THIETBI (xác nhận cascade xoá hết
   CHITIET/CONGVIEC con). Đăng nhập bằng 1 user thường (`vai_tro='user'`)
   xác nhận KHÔNG insert/update/delete được (RLS chặn, 0 rows affected hoặc
   lỗi permission).
3. Test riêng: tạo THIETBI với `nguoi_phu_trach` là 1 MSNV không tồn tại,
   xác nhận Server Action trả về thông báo lỗi tiếng Việt thân thiện (không
   phải lỗi Postgres thô).

---

## Task 3: System Settings CRUD (CAI_DAT)

**Phụ thuộc Task 1**: dùng lại `src/lib/auth/require-admin.ts` (đã tồn tại).

**Mục tiêu**: trang `/admin/settings` cho phép Admin/AdminM xem/sửa 5 dòng
cấu hình trong bảng `cai_dat`.

### Files cần tạo

1. `src/app/actions/settings.ts` (`"use server"`):
   - `updateSettings(_prevState, formData)`: gọi `requireAdmin()`, đọc từ
     formData: `lockDate` (số nguyên, chuỗi hoá lại thành text trước khi
     lưu), `enableLockDate`, `enableTimeLimit`, `enableDeviceLock`,
     `maintenanceMode` (mỗi checkbox: có mặt trong formData = "true", vắng
     mặt = "false" — checkbox HTML không gửi field nếu untick, phải map
     đúng). Upsert từng dòng vào `cai_dat` theo `key` (dùng `upsert` với
     `onConflict: 'key'`, hoặc 5 lệnh `update` riêng vì các dòng này đã tồn
     tại sẵn từ migration seed — dùng `update ... where key = ...` là đủ,
     KHÔNG cần insert vì 5 key này luôn tồn tại sẵn).
   - KHÔNG giới hạn thêm quyền chỉnh `maintenanceMode` chỉ cho `adminm` —
     RLS `cai_dat_write` hiện tại đã cho phép bất kỳ `admin`/`adminm` nào ghi
     bảng này (xem `supabase/migrations/0003_rls_policies.sql`), giữ nguyên
     đúng như vậy để nhất quán với tầng RLS đã dựng ở Pha 1 (đây là quyết
     định đã chốt, không phải để task tự suy luận thêm).

2. `src/app/admin/settings/page.tsx` — Server Component: query toàn bộ
   `cai_dat` (5 dòng), render `<SettingsForm current={...} />`.

3. `src/app/admin/settings/SettingsForm.tsx` (`"use client"`) — form với: ô
   số cho Lock Date, 3 checkbox cho 3 toggle, 1 checkbox riêng biệt/nổi bật
   (có màu cảnh báo, vd nền đỏ nhạt) cho "Bảo trì hệ thống" kèm dòng chú
   thích tiếng Việt giải thích hậu quả (chặn đăng nhập user thường). Dùng
   `useActionState` + nút Lưu.

### Verify

1. `npx tsc --noEmit` và `npm run build` sạch.
2. Script Node tạm (xoá sau khi xong) gọi thẳng Supabase JS: đăng nhập user
   `admin` test, update `LOCK_DATE` thành "10", xác nhận đọc lại đúng giá
   trị mới; bật `MAINTENANCE_MODE`, xác nhận (tái sử dụng logic Pha 2 đã
   verify) đăng nhập user thường bị chặn trong khi `adminm` vẫn vào được;
   tắt lại `MAINTENANCE_MODE` để dọn trạng thái test.
