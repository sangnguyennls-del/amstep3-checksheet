# Pha 5 — Quản lý bất thường (BAT_THUONG)

## Bối cảnh (đọc trước khi bắt đầu bất kỳ task nào)

Pha 4 đã xây xong toàn bộ luồng **ghi nhận** bất thường ngay tại ô lưới chấm
công: tô ô Actual = "R" bắt buộc mở `BatThuongModal.tsx`, gọi RPC
`set_ket_qua_r_with_bat_thuong` (insert đồng thời `thuc_hien.ket_qua='R'` +
1 dòng `bat_thuong`), và hover vào ô "R" hiện tooltip đọc `mo_ta` (đã join
sẵn trong `getThucHien`, xem `src/lib/checksheet/queries.ts`). **Không đụng
lại phần này.**

Pha 5 là phần còn thiếu theo CLAUDE.md mục E: một **trang quản lý** riêng
(dành cho Admin/AdminM) liệt kê mọi bất thường đã ghi nhận, cho xem chi tiết
(thiết bị/ngày/mô tả/ảnh) và **chuyển trạng thái** Mở → Đang xử lý → Đã đóng
(kèm ngày khắc phục khi đóng). Đây thuần tuý là CRUD trạng thái + danh sách,
không có nghiệp vụ tính toán phức tạp.

Bảng `bat_thuong` và mọi ràng buộc DB đã tồn tại từ Pha 1, **không migration
mới nào cần thiết** cho Pha 5:

- `supabase/migrations/0001_schema.sql` — cột `trang_thai text check (... in
  ('Mở', 'Đang xử lý', 'Đã đóng'))`, `ngay_khac_phuc date` (nullable).
- `supabase/migrations/0002_functions_triggers.sql` (`fn_guard_bat_thuong_update`)
  — chặn đổi `thuchien_id`; chặn đổi `mo_ta` trừ khi `current_role_is_admin()`.
  Không có ràng buộc nào ép `ngay_khac_phuc` phải có giá trị khi
  `trang_thai='Đã đóng'` ở tầng DB — validate điều này ở **tầng app** (Task 2).
- `supabase/migrations/0003_rls_policies.sql` (`bat_thuong_update`) — **CHỈ**
  `current_role_is_admin()` (tức admin/adminm) mới UPDATE được `bat_thuong`,
  bất kể cột nào. `bat_thuong_select` mở cho mọi `authenticated`. Không ai
  được DELETE (không có policy delete nào, RLS mặc định chặn) — đúng ý "giữ
  lịch sử" của CLAUDE.md, **không được thêm** thao tác xoá ở Pha 5.

## Global Constraints (áp dụng cho MỌI task bên dưới)

- Toàn bộ text hiển thị, nhãn, thông báo lỗi: **tiếng Việt**, nhất quán với
  phần còn lại của app (xem `src/app/admin/settings/SettingsForm.tsx`,
  `src/app/admin/equipment/EquipmentList.tsx` làm mẫu văn phong/màu sắc).
- Route mới: `src/app/admin/bat-thuong/page.tsx` (Server Component) +
  `src/app/admin/bat-thuong/BatThuongList.tsx` (Client Component, `"use
  client"`). Route này nằm dưới `src/app/admin/layout.tsx` nên **tự động**
  được gate bởi `requireAdmin()` đã có sẵn ở layout — task KHÔNG cần tự gọi
  lại `requireAdmin()` trong `page.tsx`, nhưng Server Action ghi dữ liệu vẫn
  PHẢI tự gọi `requireAdmin()` (xem `src/app/actions/settings.ts` làm mẫu —
  layout chỉ chặn render trang, không chặn gọi Server Action trực tiếp).
- Thêm mục nav "Bất thường" vào `src/app/admin/layout.tsx` (danh sách
  `<Link>` hiện có: Người dùng / Thiết bị / Cài đặt) và 1 thẻ vào
  `src/app/admin/page.tsx` (mảng `SECTIONS`), theo đúng pattern 2 nơi đã có.
- KHÔNG được thêm chức năng xoá (DELETE) bất thường — không có RLS policy
  cho phép, và trái nguyên tắc giữ lịch sử của CLAUDE.md mục E.
- KHÔNG được cho sửa `mo_ta` ở trang này (dù trigger cho phép Admin/AdminM
  sửa) — phạm vi Pha 5 theo plan gốc chỉ là xem + đổi trạng thái. Nếu muốn
  sửa mô tả, đó là tính năng khác ngoài phạm vi hiện tại (YAGNI).
- Kiểu dữ liệu `trang_thai` dùng đúng 3 chuỗi hằng: `"Mở"`, `"Đang xử lý"`,
  `"Đã đóng"` (tiếng Việt có dấu, khớp CHECK constraint trong
  `0001_schema.sql` — sai 1 ký tự sẽ bị DB từ chối, không phải lỗi UI).
- Kiểu client Supabase dùng trong Server Action: `createClient()` từ
  `src/lib/supabase/server.ts` (đi qua RLS bình thường — **không** dùng
  `createAdminClient()`/service-role, vì RLS `bat_thuong_update` đã đúng là
  cơ chế phân quyền cần dùng ở đây, không cần bypass).
- Định dạng ngày hiển thị: `date` trả về từ Postgres dạng chuỗi `YYYY-MM-DD`
  — hiển thị lại dạng `DD/MM/YYYY` cho người dùng (xem cách
  `BatThuongModal.tsx` dòng 120 cắt chuỗi ngày làm mẫu, hoặc viết 1 hàm nhỏ
  `formatVnDate(iso: string)` cục bộ trong `BatThuongList.tsx` — không cần
  đưa vào `src/lib/checksheet/vnDate.ts` vì đó là module riêng cho nghiệp vụ
  chấm công, không phải nơi chung cho toàn app).

## Task 1 — Data layer + trang danh sách (đọc, có lọc)

**Mục tiêu:** trang `/admin/bat-thuong` hiển thị đầy đủ danh sách bất
thường, có bộ lọc theo `trang_thai`, chưa có thao tác ghi (Task 2 mới thêm).

**File mới:**
- `src/lib/checksheet/batThuongList.ts` — hàm `getBatThuongList(supabase,
  trangThaiFilter?: string[])` trả về mảng đã join đủ ngữ cảnh hiển thị.

  Dùng PostgREST nested embed qua chuỗi FK có sẵn (không cần view/RPC mới —
  mọi quan hệ đã có FK trong `0001_schema.sql`):

  ```ts
  const { data, error } = await supabase
    .from("bat_thuong")
    .select(
      `id, mo_ta, anh_url, ngay_phat_hien, ngay_khac_phuc, trang_thai, nguoi_ghi, updated_at,
       thuc_hien!inner ( ngay,
         congviec!inner ( loai_hoat_dong,
           chitiet!inner ( ten_chi_tiet,
             thietbi!inner ( ma_thiet_bi, ten_thiet_bi ) ) ) )`,
    )
    .order("ngay_phat_hien", { ascending: false });
  ```

  Áp `trangThaiFilter` bằng `.in("trang_thai", trangThaiFilter)` nếu mảng
  không rỗng (không truyền filter = lấy tất cả). PostgREST trả embed 1-1
  dạng object HOẶC mảng 1 phần tử tuỳ version (đã gặp ở Pha 4, xem
  `firstOrNull()` trong `src/lib/checksheet/queries.ts`) — **tái dùng cùng
  kỹ thuật chuẩn hoá đó**, đừng viết lại logic khác cho cùng 1 vấn đề đã
  biết.

  Kiểu trả về (export type `BatThuongListItem`):
  ```ts
  export type BatThuongListItem = {
    id: string;
    moTa: string;
    anhUrl: string | null;
    ngayPhatHien: string;       // "YYYY-MM-DD"
    ngayKhacPhuc: string | null;
    trangThai: "Mở" | "Đang xử lý" | "Đã đóng";
    nguoiGhi: string | null;
    ngay: string;               // ngày của thuc_hien liên quan ("YYYY-MM-DD")
    loaiHoatDong: string;
    tenChiTiet: string;
    maThietBi: string;
    tenThietBi: string;
  };
  ```

- `src/app/admin/bat-thuong/page.tsx` — Server Component: đọc `searchParams`
  (Next.js 16 — `searchParams` là 1 `Promise`, PHẢI `await` nó, xem cách
  `src/app/admin/equipment/[id]/page.tsx` đã `await params` làm mẫu đúng
  convention hiện tại của repo) cho tham số lọc trạng thái ban đầu (tuỳ
  chọn — mặc định không lọc gì / hoặc mặc định ẩn "Đã đóng", tự quyết định
  hợp lý, ưu tiên đơn giản), gọi `getBatThuongList`, render
  `<BatThuongList initialItems={...} />`.

- `src/app/admin/bat-thuong/BatThuongList.tsx` — Client Component:
  - Toolbar lọc theo `trang_thai`: 3 checkbox hoặc nút tab "Mở" / "Đang xử
    lý" / "Đã đóng" (chọn nhiều được, mặc định tất cả được chọn TRỪ "Đã
    đóng" — hợp lý vì đa số công việc quản lý tập trung vào cái chưa đóng;
    có nút "Hiện tất cả").
  - Bảng hiển thị: Ngày (của `thuc_hien`), Thiết bị (`maThietBi` —
    `tenThietBi`), Nội dung (`tenChiTiet`), Loại (`loaiHoatDong`), Mô tả bất
    thường, Ngày phát hiện, Ngày khắc phục (hoặc "—" nếu null), Trạng thái
    (badge màu: Mở=đỏ, Đang xử lý=vàng, Đã đóng=xám), Người ghi, cột Ảnh
    (nếu có `anhUrl`: link `<a target="_blank">Xem ảnh</a>`, không nhúng
    `<img>` trực tiếp — nhất quán với cách link Drive được xử lý ở
    `EquipmentImageModal.tsx`/Pha 4, không cần thêm logic resolve
    thumbnail ở đây).
  - Lọc lại danh sách hoàn toàn ở CLIENT (dữ liệu đã tải hết 1 lần từ
    `initialItems`, không gọi lại server khi đổi filter) — số lượng bất
    thường thực tế nhỏ (hàng chục/hàng trăm dòng), không cần phân trang hay
    lọc server-side cho Pha 5.
  - CHƯA có nút đổi trạng thái ở Task 1 (Task 2 thêm) — hiển thị trạng thái
    dạng badge tĩnh là đủ cho task này.

**Không làm trong task này:** Server Action ghi dữ liệu, nút đổi trạng
thái, validate ngày khắc phục — đó là Task 2.

**Verify:**
- `npx tsc --noEmit` sạch.
- Seed thủ công (qua `psql` hoặc UI checksheet có sẵn) ít nhất 3 dòng
  `bat_thuong` với 3 `trang_thai` khác nhau trên local Supabase, mở
  `/admin/bat-thuong` bằng tài khoản admin, xác nhận: cả 3 dòng đúng dữ
  liệu join (thiết bị/nội dung/ngày khớp), bộ lọc trạng thái hoạt động
  đúng, tài khoản không phải admin bị redirect (đã có sẵn từ layout, chỉ
  cần xác nhận không bị phá vỡ).

## Task 2 — Đổi trạng thái bất thường (Server Action + wiring)

**Mục tiêu:** Admin/AdminM đổi được `trang_thai` của 1 bất thường
(Mở/Đang xử lý/Đã đóng) và đặt `ngay_khac_phuc` khi đóng, ngay từ trang
danh sách của Task 1.

**File mới:**
- `src/app/actions/batThuong.ts`:
  ```ts
  "use server";
  export type UpdateBatThuongState = { error: string | null; success?: boolean };

  export async function updateBatThuongStatus(
    _prevState: UpdateBatThuongState,
    formData: FormData,
  ): Promise<UpdateBatThuongState>
  ```
  - Gọi `requireAdmin()` đầu tiên (bắt lỗi, trả `{ error: ... }` — KHÔNG
    throw ra ngoài, đúng pattern `settings.ts`/`equipment.ts`).
  - Đọc `id` (uuid bắt buộc), `trangThai` (bắt buộc, phải là 1 trong 3 giá
    trị hợp lệ — validate ở app trước khi gửi DB để có thông báo tiếng Việt
    rõ ràng thay vì lộ lỗi CHECK constraint thô), `ngayKhacPhuc` (tuỳ chọn).
  - **Validate nghiệp vụ ở tầng app** (không có ở DB — xem Global
    Constraints): nếu `trangThai === "Đã đóng"` thì `ngayKhacPhuc` bắt buộc
    phải có giá trị → nếu thiếu, trả lỗi
    `"Phải nhập ngày khắc phục khi đóng bất thường"` và KHÔNG gọi update.
  - `supabase.from("bat_thuong").update({ trang_thai, ngay_khac_phuc })
    .eq("id", id)` — dùng `createClient()` thường (RLS tự chặn nếu không
    phải admin, nhưng đã chặn sớm hơn bằng `requireAdmin()` để có thông báo
    tiếng Việt thay vì lỗi Postgres thô).
  - Map lỗi Postgres (nếu có, vd vi phạm CHECK constraint do race condition
    hiếm) sang thông báo tiếng Việt chung chung — theo đúng pattern
    try/catch trong `src/app/actions/equipment.ts`.
  - `revalidatePath("/admin/bat-thuong")` khi thành công.

**File sửa:**
- `src/app/admin/bat-thuong/BatThuongList.tsx` — mỗi dòng thêm:
  - Dropdown `<select>` chọn trạng thái mới (3 giá trị cố định).
  - Input `type="date"` cho ngày khắc phục, **disabled trừ khi** dropdown
    đang chọn "Đã đóng" (UX phòng ngừa: không cho nhập ngày khắc phục vào
    lúc trạng thái khác "Đã đóng" để tránh hiểu nhầm — validate thật vẫn
    nằm ở Server Action).
  - Nút "Lưu" theo dòng, dùng `useActionState(updateBatThuongStatus, ...)`
    — theo đúng pattern đã dùng ở `SettingsForm.tsx`/`UsersTable.tsx` (1
    form độc lập mỗi dòng, KHÔNG dùng 1 form chung cho cả bảng — tránh 1
    lỗi ở dòng này chặn submit dòng khác).
  - Hiện lỗi tiếng Việt ngay dưới dòng đó nếu Server Action trả `error`.
  - Sau khi lưu thành công: cập nhật lại đúng dòng đó trong state cục bộ
    (không cần reload cả trang — `revalidatePath` đã đủ cho lần load sau,
    nhưng optimistic/refresh cục bộ giúp UX mượt hơn; **hoặc** đơn giản hơn
    và chấp nhận được: gọi `router.refresh()` sau khi Server Action trả
    `success: true` — chọn 1 trong 2 cách, ưu tiên cách nào ít code hơn vì
    khối lượng dữ liệu nhỏ).

**Verify:**
- `npx tsc --noEmit` sạch.
- Test thủ công qua UI (Playwright hoặc thao tác tay đều được — không bắt
  buộc Playwright cho task nhỏ này, nhưng nếu implementer có sẵn cách nhanh
  hơn để tự verify UI thật thì nên làm) trên local Supabase:
  1. Đổi 1 dòng "Mở" → "Đang xử lý" (không cần ngày khắc phục) → lưu thành
     công, trạng thái cập nhật đúng.
  2. Đổi 1 dòng sang "Đã đóng" mà KHÔNG nhập ngày khắc phục → bị chặn với
     thông báo tiếng Việt đúng, KHÔNG có request update nào tới DB (kiểm
     tra bằng cách xác nhận giá trị trong DB không đổi qua `psql` hoặc
     network tab).
  3. Đổi sang "Đã đóng" CÓ nhập ngày khắc phục → lưu thành công.
  4. Đăng nhập bằng tài khoản `user` thường, xác nhận không truy cập được
     `/admin/bat-thuong` (bị redirect bởi layout, hành vi đã có sẵn — chỉ
     cần xác nhận chưa bị phá vỡ bởi thay đổi của Pha 5).
