# Việc 2 — Luồng đề xuất "Thêm hạng mục" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho người phụ trách thiết bị đề xuất "Thêm" công việc/chi tiết mới ngay trên `/checksheet` (duyệt theo Nhóm, hiệu lực đầu tháng sau), song song luồng Sửa/Loại bỏ đã có.

**Architecture:** Mở rộng bảng `de_xuat_congviec` + hàng đợi `/admin/de-xuat` + RPC `resolve_de_xuat_congviec` sẵn có (phương án ① trong spec). Thêm 3 RPC (`can_manage_thietbi`, `can_approve_thietbi_change`, `create_hang_muc_moi`) + 1 RPC checksheet gọi (`propose_them_hang_muc`). ID `CTxxxxx`/`CVxxxxx` tự sinh từ sequence. Toàn bộ quyền/khoá ở RPC/RLS; client chỉ ẩn/hiện.

**Tech Stack:** Postgres/Supabase (migration SQL, `security definer` RPC, RLS), Next.js 16 App Router + React 19 + TypeScript, Tailwind v4, `@supabase/supabase-js` (client RPC + server action đã có).

**Spec:** [docs/superpowers/specs/2026-07-18-them-hang-muc-de-xuat-design.md](../specs/2026-07-18-them-hang-muc-de-xuat-design.md)

## Global Constraints

- **Lằn ranh đỏ** (`docs/VIEC-KHONG-DUOC-LAM.md`): #1 không đổi phạm vi duyệt Nhóm (`nguoidung.kip` vs `thietbi.kip`); #4 dùng `hieu_luc_*`, KHÔNG `active=false` cho nghiệp vụ; #6 không UPDATE/DELETE `thuc_hien` lịch sử; #8 id tự sinh, không khoá chuỗi ghép; #9 quyền ở RPC/RLS, client chỉ ẩn/hiện; #10 UI mobile-friendly + chụp màn hình trước/sau cho thay đổi UI lớn.
- **Ngôn ngữ**: mọi chuỗi UI, comment, thông báo lỗi bằng **tiếng Việt**.
- **Hiệu lực**: hạng mục mới `hieu_luc_tu = (date_trunc('month', today_vn()) + interval '1 month')::date` — tính tại thời điểm áp dụng/duyệt (đề xuất treo qua tháng → tháng duyệt + 1).
- **Kiểu dữ liệu khoá**: `thietbi.id uuid`; `chitiet.id`/`congviec.id` text (`CT#####`/`CV#####`); `chitiet.stt int`.
- **Không test runner**: verify DB bằng script `pg` đọc `SUPABASE_DB_URL` (mẫu: `scripts/migrate/db.ts` dùng `node:assert`, chạy `node <file>.ts`), verify auth-gated + UI bằng app đang chạy (`npm run dev -p 4000` với env) + Playwright + ảnh màn hình. `npm run build` + `npm run lint` phải sạch (bỏ qua lỗi có sẵn `BatThuongModal.tsx:55`).
- **Áp migration lên PRODUCTION là việc của người dùng** (thao tác hướng ngoại, khó đảo) — plan chỉ áp/verify trên DB local hoặc dev mà `SUPABASE_DB_URL` trỏ tới; bước push production nằm ở Task 6, gọi ý người dùng thực hiện.

---

### Task 1: Migration `0019` — mở rộng schema `de_xuat_congviec`

**Files:**
- Create: `supabase/migrations/0019_de_xuat_them_hang_muc.sql`
- Test: `scripts/dev/them-hang-muc.smoke.ts` (tạo mới ở Task này, mở rộng dần ở Task 2–3)

**Interfaces:**
- Consumes: bảng `de_xuat_congviec` (0013), `thietbi/chitiet/congviec` (0001).
- Produces: cột mới trên `de_xuat_congviec` (`thietbi_id uuid`, `chitiet_id text`, `ten_chi_tiet_moi text`, `dieu_kien_co_ban_moi text`, `stt_moi int`, `loai_hoat_dong_moi text`); `congviec_id` nullable; `loai_de_xuat` cho phép `'them'`; constraint `chk_de_xuat_loai`; index `uq_de_xuat_them_pending`.

- [ ] **Step 1: Tạo file migration với phần schema**

Create `supabase/migrations/0019_de_xuat_them_hang_muc.sql`:

```sql
-- Việc 2 (mở rộng): luồng ĐỀ XUẤT -> DUYỆT cho THÊM hạng mục (công việc mới
-- vào chi tiết có sẵn, hoặc chi tiết mới kèm công việc đầu tiên), song song
-- với 'sua'/'loai_bo' của 0013. Tái dùng bảng de_xuat_congviec + hàng đợi
-- /admin/de-xuat + resolve_de_xuat_congviec (phương án ① trong spec
-- docs/superpowers/specs/2026-07-18-them-hang-muc-de-xuat-design.md).
--
-- Hiệu lực: hạng mục mới hieu_luc_tu = đầu tháng sau (nhất quán 0016). ID
-- chitiet/congviec tự sinh từ sequence (CTxxxxx/CVxxxxx), không khoá ghép.

-- ---------------------------------------------------------------------------
-- (1) Mở rộng bảng de_xuat_congviec cho loại 'them'
-- ---------------------------------------------------------------------------
alter table de_xuat_congviec alter column congviec_id drop not null;

-- Nới ràng buộc loai_de_xuat để nhận 'them'. Ràng buộc CHECK cũ do 0013 tạo
-- inline (không đặt tên) -> tìm và bỏ theo tên hệ thống rồi thêm lại có tên.
alter table de_xuat_congviec drop constraint de_xuat_congviec_loai_de_xuat_check;
alter table de_xuat_congviec add constraint de_xuat_congviec_loai_de_xuat_check
  check (loai_de_xuat in ('sua', 'loai_bo', 'them'));

alter table de_xuat_congviec
  add column thietbi_id uuid references thietbi (id) on delete cascade,
  add column chitiet_id text references chitiet (id) on delete cascade,
  add column ten_chi_tiet_moi text,
  add column dieu_kien_co_ban_moi text,
  add column stt_moi int,
  add column loai_hoat_dong_moi text;

-- Toàn vẹn theo loại: 'them' cần thietbi_id + loai_hoat_dong_moi, và ĐÚNG MỘT
-- trong (chitiet_id | ten_chi_tiet_moi) (num_nonnulls = 1); 'sua'/'loai_bo'
-- giữ nguyên hình dạng cũ (congviec_id not null, các cột 'them' để null).
alter table de_xuat_congviec add constraint chk_de_xuat_loai check (
  case
    when loai_de_xuat = 'them' then
      congviec_id is null
      and thietbi_id is not null
      and loai_hoat_dong_moi is not null
      and num_nonnulls(chitiet_id, ten_chi_tiet_moi) = 1
    else
      congviec_id is not null
      and thietbi_id is null
      and chitiet_id is null
      and ten_chi_tiet_moi is null
      and loai_hoat_dong_moi is null
  end
);

-- Chống 2 đề xuất 'them công việc vào chi tiết có sẵn' trùng đang chờ duyệt.
-- Kiểu 'chi tiết mới' không có khoá tự nhiên -> không chặn (admin từ chối bản dư).
create unique index uq_de_xuat_them_pending
  on de_xuat_congviec (chitiet_id, loai_hoat_dong_moi)
  where loai_de_xuat = 'them' and chitiet_id is not null and trang_thai = 'Chờ duyệt';

create index idx_de_xuat_congviec_thietbi on de_xuat_congviec (thietbi_id);
```

- [ ] **Step 2: Xác minh tên constraint CHECK cũ của `loai_de_xuat`**

Trước khi tin `de_xuat_congviec_loai_de_xuat_check` là tên đúng (Postgres tự đặt cho CHECK inline), kiểm tra:

Run:
```bash
node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.SUPABASE_DB_URL});await c.connect();const r=await c.query(\"select conname from pg_constraint where conrelid='de_xuat_congviec'::regclass and contype='c'\");console.log(r.rows);await c.end();})()"
```
Expected: in ra danh sách constraint, có `de_xuat_congviec_loai_de_xuat_check`. Nếu tên khác (vd hậu tố số), sửa dòng `drop constraint ...` ở Step 1 cho khớp.

- [ ] **Step 3: Áp migration lên DB local**

Run: `npx supabase db reset`
Expected: chạy lại toàn bộ migration tới 0019 không lỗi ("Applying migration 0019_de_xuat_them_hang_muc.sql...").

(Nếu môi trường không có Supabase local mà `SUPABASE_DB_URL` trỏ DB dev: `npx supabase migration up --db-url "$SUPABASE_DB_URL"`.)

- [ ] **Step 4: Viết smoke test cho ràng buộc (failing trước)**

Create `scripts/dev/them-hang-muc.smoke.ts`:

```ts
// Smoke test Việc 2 (Thêm hạng mục) — chạy sau khi migration 0019 đã áp lên DB
// mà SUPABASE_DB_URL trỏ tới (local Supabase khuyến nghị). Dùng pg trực tiếp +
// node:assert, mọi ghi nằm trong transaction ROLLBACK để không bẩn DB.
//   $env:SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//   node scripts/dev/them-hang-muc.smoke.ts
import assert from "node:assert";
import { Client } from "pg";

async function rolledBack<T>(c: Client, fn: () => Promise<T>): Promise<void> {
  await c.query("BEGIN");
  try {
    await fn();
  } finally {
    await c.query("ROLLBACK");
  }
}

async function run() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log("Bỏ qua: thiếu SUPABASE_DB_URL");
    return;
  }
  const c = new Client({ connectionString });
  await c.connect();
  try {
    // (A) CHECK chặn 'them' thiếu thietbi_id
    await rolledBack(c, async () => {
      await assert.rejects(
        () =>
          c.query(
            `insert into de_xuat_congviec (loai_de_xuat, loai_hoat_dong_moi, ten_chi_tiet_moi, ly_do, nguoi_de_xuat)
             values ('them','Kiểm tra','X','ly do', (select msnv from nguoidung limit 1))`,
          ),
        /chk_de_xuat_loai|violates check/i,
        "'them' thiếu thietbi_id phải bị CHECK chặn",
      );
    });

    // (B) CHECK chặn 'them' có CẢ chitiet_id lẫn ten_chi_tiet_moi (num_nonnulls=2)
    await rolledBack(c, async () => {
      const tb = await c.query(`select id from thietbi limit 1`);
      const ct = await c.query(`select id from chitiet limit 1`);
      if (!tb.rows[0] || !ct.rows[0]) return; // DB rỗng -> bỏ qua nhánh này
      await assert.rejects(
        () =>
          c.query(
            `insert into de_xuat_congviec (loai_de_xuat, thietbi_id, chitiet_id, ten_chi_tiet_moi, loai_hoat_dong_moi, ly_do, nguoi_de_xuat)
             values ('them',$1,$2,'X','Kiểm tra','ly do',(select msnv from nguoidung limit 1))`,
            [tb.rows[0].id, ct.rows[0].id],
          ),
        /chk_de_xuat_loai|violates check/i,
        "'them' có cả chitiet_id lẫn ten_chi_tiet_moi phải bị chặn",
      );
    });

    // (C) 'sua' hợp lệ vẫn insert được (không hồi quy)
    await rolledBack(c, async () => {
      const cv = await c.query(`select id from congviec limit 1`);
      if (!cv.rows[0]) return;
      await c.query(
        `insert into de_xuat_congviec (loai_de_xuat, congviec_id, thoi_gian_moi, ly_do, nguoi_de_xuat)
         values ('sua',$1,5,'ly do',(select msnv from nguoidung limit 1))`,
        [cv.rows[0].id],
      );
    });

    console.log("them-hang-muc.smoke.ts [Task 1]: PASS");
  } finally {
    await c.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Chạy smoke test — phải PASS sau khi migration áp đúng**

Run: `node scripts/dev/them-hang-muc.smoke.ts` (với `SUPABASE_DB_URL` đã set)
Expected: `them-hang-muc.smoke.ts [Task 1]: PASS`. Nếu FAIL vì CHECK không chặn → migration chưa áp hoặc CHECK sai, sửa Step 1.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0019_de_xuat_them_hang_muc.sql scripts/dev/them-hang-muc.smoke.ts
git commit -m "Viec 2 (Task 1): mo rong schema de_xuat_congviec cho loai 'them'"
```

---

### Task 2: RPC — `can_manage_thietbi`, `can_approve_thietbi_change`, `create_hang_muc_moi`

**Files:**
- Modify: `supabase/migrations/0019_de_xuat_them_hang_muc.sql` (thêm cuối file)
- Test: `scripts/dev/them-hang-muc.smoke.ts` (mở rộng)

**Interfaces:**
- Consumes: `current_msnv()`, `current_role_is_admin()`, `today_vn()`, `vai_tro_enum`, `auth.uid()`.
- Produces:
  - `can_manage_thietbi(p_thietbi_id uuid) returns boolean`
  - `can_approve_thietbi_change(p_thietbi_id uuid) returns boolean`
  - `create_hang_muc_moi(p_thietbi_id uuid, p_chitiet_id text, p_ten_chi_tiet text, p_dieu_kien_co_ban text, p_stt int, p_loai_hoat_dong text, p_thoi_gian numeric, p_tan_suat_chu text, p_tan_suat_so numeric, p_ly_do text) returns jsonb` — trả `{chitiet_id, chitiet_moi, congviec_id, hieu_luc_tu}`.

- [ ] **Step 1: Thêm 3 hàm vào cuối migration 0019**

Append vào `supabase/migrations/0019_de_xuat_them_hang_muc.sql`:

```sql
-- ---------------------------------------------------------------------------
-- (2) Hàm quyền soi theo THIẾT BỊ (đề xuất 'them' chưa có congviec_id) —
-- mirror can_manage_congviec / can_approve_congviec_change của 0010/0013.
-- ---------------------------------------------------------------------------
create function can_manage_thietbi(p_thietbi_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_npt text;
begin
  if current_role_is_admin() then
    return true;
  end if;
  select nguoi_phu_trach into v_npt from thietbi where id = p_thietbi_id;
  return v_npt is not null and v_npt = current_msnv();
end;
$$;

grant execute on function can_manage_thietbi(uuid) to authenticated;

create function can_approve_thietbi_change(p_thietbi_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_vai_tro vai_tro_enum;
  v_kip_duyet text;
  v_kip_tb text;
begin
  select vai_tro, kip into v_vai_tro, v_kip_duyet from nguoidung where id = auth.uid();
  if v_vai_tro = 'adminm' then
    return true;
  end if;
  if v_vai_tro <> 'admin' then
    return false;
  end if;
  select kip into v_kip_tb from thietbi where id = p_thietbi_id;
  return v_kip_duyet is not null and v_kip_duyet = v_kip_tb;
end;
$$;

grant execute on function can_approve_thietbi_change(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (3) create_hang_muc_moi: tạo hạng mục THẬT. Dùng chung cho admin-áp-ngay và
-- resolve-duyệt (giống update_congviec_with_reason được chia sẻ). Tạo chitiet
-- mới nếu p_chitiet_id null (kiểu b), rồi tạo congviec hieu_luc_tu đầu tháng
-- sau. KHÔNG tạo sẵn thuc_hien. Ghi audit_log cho từng dòng mới.
-- ---------------------------------------------------------------------------
create function create_hang_muc_moi(
  p_thietbi_id uuid,
  p_chitiet_id text,
  p_ten_chi_tiet text,
  p_dieu_kien_co_ban text,
  p_stt int,
  p_loai_hoat_dong text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_chitiet_id text := p_chitiet_id;
  v_new_ct chitiet;
  v_new_cv congviec;
  v_tb_id uuid;
  v_effect date := (date_trunc('month', today_vn()) + interval '1 month')::date;
begin
  if p_loai_hoat_dong is null or trim(p_loai_hoat_dong) = '' then
    raise exception 'Loại hoạt động là bắt buộc';
  end if;

  if v_chitiet_id is null then
    if p_ten_chi_tiet is null or trim(p_ten_chi_tiet) = '' then
      raise exception 'Tên chi tiết là bắt buộc khi thêm chi tiết mới';
    end if;
    insert into chitiet (thietbi_id, stt, ten_chi_tiet, dieu_kien_co_ban)
    values (p_thietbi_id, p_stt, trim(p_ten_chi_tiet), p_dieu_kien_co_ban)
    returning * into v_new_ct;
    v_chitiet_id := v_new_ct.id;
    insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
    values ('chitiet', v_new_ct.id, 'INSERT', null, to_jsonb(v_new_ct), current_msnv(), p_ly_do);
  else
    select thietbi_id into v_tb_id from chitiet where id = v_chitiet_id;
    if v_tb_id is null then
      raise exception 'Không tìm thấy chi tiết %', v_chitiet_id;
    end if;
    if v_tb_id <> p_thietbi_id then
      raise exception 'Chi tiết % không thuộc thiết bị đã chọn', v_chitiet_id;
    end if;
  end if;

  insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu)
  values (v_chitiet_id, trim(p_loai_hoat_dong), p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, true, v_effect)
  returning * into v_new_cv;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values ('congviec', v_new_cv.id, 'INSERT', null, to_jsonb(v_new_cv), current_msnv(), p_ly_do);

  return jsonb_build_object(
    'chitiet_id', v_chitiet_id,
    'chitiet_moi', (p_chitiet_id is null),
    'congviec_id', v_new_cv.id,
    'hieu_luc_tu', v_effect
  );
end;
$$;

grant execute on function create_hang_muc_moi(uuid, text, text, text, int, text, numeric, text, numeric, text) to authenticated;
```

- [ ] **Step 2: Áp lại migration**

Run: `npx supabase db reset`
Expected: tới 0019 không lỗi.

- [ ] **Step 3: Mở rộng smoke test — gọi trực tiếp `create_hang_muc_moi` (as postgres)**

Thêm vào `run()` trong `scripts/dev/them-hang-muc.smoke.ts`, TRƯỚC dòng `console.log(... [Task 1] ...)` (đổi nhãn cuối thành `[Task 1-2]`):

```ts
    // (D) create_hang_muc_moi: chi tiết MỚI + công việc đầu tiên, hieu_luc_tu = đầu tháng sau
    await rolledBack(c, async () => {
      const tb = await c.query(`select id from thietbi limit 1`);
      if (!tb.rows[0]) return;
      const r = await c.query(
        `select create_hang_muc_moi($1,null,'CT test smoke','đk cơ bản',9,'Kiểm tra',3,'Ngày',1,'ly do') as res`,
        [tb.rows[0].id],
      );
      const res = r.rows[0].res;
      assert.match(res.chitiet_id, /^CT\d{5}$/, "chitiet_id phải dạng CT#####");
      assert.match(res.congviec_id, /^CV\d{5}$/, "congviec_id phải dạng CV#####");
      assert.strictEqual(res.chitiet_moi, true, "phải đánh dấu chi tiết mới");
      // hieu_luc_tu = ngày 1 của tháng sau (theo today_vn)
      const eff = await c.query(
        `select (date_trunc('month', today_vn()) + interval '1 month')::date::text as d`,
      );
      assert.strictEqual(res.hieu_luc_tu, eff.rows[0].d, "hieu_luc_tu phải là đầu tháng sau");
      // congviec vừa tạo phải tồn tại, active, đúng hieu_luc_tu
      const cv = await c.query(`select active, hieu_luc_tu::text from congviec where id=$1`, [res.congviec_id]);
      assert.strictEqual(cv.rows[0].active, true);
      assert.strictEqual(cv.rows[0].hieu_luc_tu, eff.rows[0].d);
    });

    // (E) create_hang_muc_moi: THÊM công việc vào chi tiết CÓ SẴN (không tạo chitiet mới)
    await rolledBack(c, async () => {
      const ct = await c.query(`select id, thietbi_id from chitiet limit 1`);
      if (!ct.rows[0]) return;
      const before = await c.query(`select count(*)::int n from congviec where chitiet_id=$1`, [ct.rows[0].id]);
      const r = await c.query(
        `select create_hang_muc_moi($1,$2,null,null,null,'Vệ sinh',2,'Tuần',1,'ly do') as res`,
        [ct.rows[0].thietbi_id, ct.rows[0].id],
      );
      assert.strictEqual(r.rows[0].res.chitiet_moi, false, "chi tiết có sẵn -> chitiet_moi=false");
      assert.strictEqual(r.rows[0].res.chitiet_id, ct.rows[0].id, "phải dùng đúng chi tiết đã chọn");
      const after = await c.query(`select count(*)::int n from congviec where chitiet_id=$1`, [ct.rows[0].id]);
      assert.strictEqual(after.rows[0].n, before.rows[0].n + 1, "phải thêm đúng 1 công việc");
    });
```

- [ ] **Step 4: Chạy smoke test — PASS**

Run: `node scripts/dev/them-hang-muc.smoke.ts`
Expected: `them-hang-muc.smoke.ts [Task 1-2]: PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_de_xuat_them_hang_muc.sql scripts/dev/them-hang-muc.smoke.ts
git commit -m "Viec 2 (Task 2): can_manage/approve_thietbi + create_hang_muc_moi"
```

---

### Task 3: RPC — `propose_them_hang_muc`, mở rộng `resolve_de_xuat_congviec`, RLS

**Files:**
- Modify: `supabase/migrations/0019_de_xuat_them_hang_muc.sql` (thêm cuối file)
- Test: `scripts/dev/them-hang-muc.smoke.ts` (mở rộng)

**Interfaces:**
- Consumes: `can_manage_thietbi`, `can_approve_thietbi_change`, `create_hang_muc_moi` (Task 2); `update_congviec_with_reason`/`remove_congviec_with_reason` (0016).
- Produces:
  - `propose_them_hang_muc(p_thietbi_id uuid, p_chitiet_id text, p_ten_chi_tiet text, p_dieu_kien_co_ban text, p_stt int, p_loai_hoat_dong text, p_thoi_gian numeric, p_tan_suat_chu text, p_tan_suat_so numeric, p_ly_do text) returns jsonb` — trả `{applied: bool, result?|de_xuat_id}`.
  - `resolve_de_xuat_congviec(uuid, text, text)` — nay xử lý thêm nhánh `loai_de_xuat='them'`.
  - policy `de_xuat_congviec_select` — nay còn cho admin duyệt-thiết-bị thấy đề xuất 'them'.

- [ ] **Step 1: Thêm `propose_them_hang_muc` + thay policy RLS + thay `resolve_de_xuat_congviec` vào cuối migration**

Append vào `supabase/migrations/0019_de_xuat_them_hang_muc.sql`:

```sql
-- ---------------------------------------------------------------------------
-- (4) propose_them_hang_muc: checksheet gọi 1 điểm cho mọi role. Người phụ
-- trách -> tạo dòng 'Chờ duyệt'; Admin/AdminM -> áp dụng ngay (create_hang_muc_moi).
-- ---------------------------------------------------------------------------
create function propose_them_hang_muc(
  p_thietbi_id uuid,
  p_chitiet_id text,
  p_ten_chi_tiet text,
  p_dieu_kien_co_ban text,
  p_stt int,
  p_loai_hoat_dong text,
  p_thoi_gian numeric,
  p_tan_suat_chu text,
  p_tan_suat_so numeric,
  p_ly_do text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_de_xuat_id uuid;
  v_result jsonb;
  v_ten text := nullif(trim(coalesce(p_ten_chi_tiet, '')), '');
begin
  if p_ly_do is null or trim(p_ly_do) = '' then
    raise exception 'Lý do là bắt buộc';
  end if;
  if p_loai_hoat_dong is null or trim(p_loai_hoat_dong) = '' then
    raise exception 'Loại hoạt động là bắt buộc';
  end if;
  -- đúng MỘT kiểu: chi tiết có sẵn XOR chi tiết mới
  if (p_chitiet_id is null) = (v_ten is null) then
    raise exception 'Phải chọn chi tiết có sẵn HOẶC nhập tên chi tiết mới (đúng một)';
  end if;

  if not can_manage_thietbi(p_thietbi_id) then
    raise exception 'Không có quyền đề xuất thêm hạng mục cho thiết bị này (chỉ người phụ trách thiết bị hoặc Admin)';
  end if;

  if p_chitiet_id is not null
     and not exists (select 1 from chitiet where id = p_chitiet_id and thietbi_id = p_thietbi_id) then
    raise exception 'Chi tiết % không thuộc thiết bị đã chọn', p_chitiet_id;
  end if;

  if current_role_is_admin() then
    v_result := create_hang_muc_moi(p_thietbi_id, p_chitiet_id, v_ten, p_dieu_kien_co_ban,
      p_stt, p_loai_hoat_dong, p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do);
    return jsonb_build_object('applied', true, 'result', v_result);
  end if;

  begin
    insert into de_xuat_congviec (
      loai_de_xuat, thietbi_id, chitiet_id, ten_chi_tiet_moi, dieu_kien_co_ban_moi, stt_moi,
      loai_hoat_dong_moi, thoi_gian_moi, tan_suat_chu_moi, tan_suat_so_moi, ly_do, nguoi_de_xuat
    ) values (
      'them', p_thietbi_id, p_chitiet_id, v_ten, p_dieu_kien_co_ban, p_stt,
      trim(p_loai_hoat_dong), p_thoi_gian, p_tan_suat_chu, p_tan_suat_so, p_ly_do, current_msnv()
    ) returning id into v_de_xuat_id;
  exception when unique_violation then
    raise exception 'Đang có đề xuất thêm công việc này chờ duyệt';
  end;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values (
    'de_xuat_congviec', v_de_xuat_id::text, 'INSERT', null,
    jsonb_build_object('loai_de_xuat', 'them', 'thietbi_id', p_thietbi_id, 'chitiet_id', p_chitiet_id,
      'ten_chi_tiet_moi', v_ten, 'loai_hoat_dong_moi', p_loai_hoat_dong),
    current_msnv(), p_ly_do
  );

  return jsonb_build_object('applied', false, 'de_xuat_id', v_de_xuat_id);
end;
$$;

grant execute on function propose_them_hang_muc(uuid, text, text, text, int, text, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- (5) RLS select: đề xuất 'them' có congviec_id null -> can_approve_congviec_change
-- trả false cho admin, họ sẽ KHÔNG thấy trong hàng đợi. Bổ sung nhánh duyệt
-- theo thiết bị. (drop + create lại vì thay USING.)
-- ---------------------------------------------------------------------------
drop policy de_xuat_congviec_select on de_xuat_congviec;
create policy de_xuat_congviec_select on de_xuat_congviec
  for select to authenticated
  using (
    nguoi_de_xuat = current_msnv()
    or (congviec_id is not null and can_approve_congviec_change(congviec_id))
    or (thietbi_id is not null and can_approve_thietbi_change(thietbi_id))
  );

-- ---------------------------------------------------------------------------
-- (6) resolve_de_xuat_congviec: thêm nhánh 'them'. Giữ nguyên logic 'sua'/
-- 'loai_bo'; gate 'them' bằng can_approve_thietbi_change; duyệt -> create_hang_muc_moi.
-- ---------------------------------------------------------------------------
create or replace function resolve_de_xuat_congviec(
  p_de_xuat_id uuid,
  p_hanh_dong text,
  p_ly_do_tu_choi text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_de_xuat de_xuat_congviec;
  v_result jsonb;
  v_can_approve boolean;
begin
  if p_hanh_dong not in ('duyet', 'tu_choi') then
    raise exception 'Hành động không hợp lệ';
  end if;

  select * into v_de_xuat from de_xuat_congviec where id = p_de_xuat_id for update;
  if not found then
    raise exception 'Không tìm thấy đề xuất %', p_de_xuat_id;
  end if;

  if v_de_xuat.loai_de_xuat = 'them' then
    v_can_approve := can_approve_thietbi_change(v_de_xuat.thietbi_id);
  else
    v_can_approve := can_approve_congviec_change(v_de_xuat.congviec_id);
  end if;
  if not v_can_approve then
    raise exception 'Không có quyền duyệt đề xuất này (khác Nhóm phụ trách hoặc không phải Admin)';
  end if;

  if v_de_xuat.trang_thai <> 'Chờ duyệt' then
    raise exception 'Đề xuất đã được xử lý';
  end if;

  if p_hanh_dong = 'duyet' then
    if v_de_xuat.loai_de_xuat = 'them' then
      v_result := create_hang_muc_moi(
        v_de_xuat.thietbi_id, v_de_xuat.chitiet_id, v_de_xuat.ten_chi_tiet_moi,
        v_de_xuat.dieu_kien_co_ban_moi, v_de_xuat.stt_moi, v_de_xuat.loai_hoat_dong_moi,
        v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi, v_de_xuat.tan_suat_so_moi, v_de_xuat.ly_do
      );
    elsif v_de_xuat.loai_de_xuat = 'sua' then
      v_result := update_congviec_with_reason(
        v_de_xuat.congviec_id, v_de_xuat.thoi_gian_moi, v_de_xuat.tan_suat_chu_moi,
        v_de_xuat.tan_suat_so_moi, v_de_xuat.ly_do
      );
    else
      v_result := remove_congviec_with_reason(v_de_xuat.congviec_id, v_de_xuat.ly_do);
    end if;

    update de_xuat_congviec
      set trang_thai = 'Đã duyệt', nguoi_duyet = current_msnv(), updated_at = now()
      where id = p_de_xuat_id;

    insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
    values (
      'de_xuat_congviec', p_de_xuat_id::text, 'UPDATE',
      to_jsonb(v_de_xuat), jsonb_build_object('trang_thai', 'Đã duyệt'), current_msnv(), v_de_xuat.ly_do
    );

    return jsonb_build_object('trang_thai', 'Đã duyệt', 'result', v_result);
  end if;

  -- 'tu_choi'
  if p_ly_do_tu_choi is null or trim(p_ly_do_tu_choi) = '' then
    raise exception 'Lý do từ chối là bắt buộc';
  end if;

  update de_xuat_congviec
    set trang_thai = 'Từ chối', nguoi_duyet = current_msnv(), ly_do_tu_choi = p_ly_do_tu_choi, updated_at = now()
    where id = p_de_xuat_id;

  insert into audit_log (bang, ban_ghi_id, hanh_dong, gia_tri_cu, gia_tri_moi, nguoi_thuc_hien, ly_do)
  values (
    'de_xuat_congviec', p_de_xuat_id::text, 'UPDATE',
    to_jsonb(v_de_xuat), jsonb_build_object('trang_thai', 'Từ chối', 'ly_do_tu_choi', p_ly_do_tu_choi),
    current_msnv(), p_ly_do_tu_choi
  );

  return jsonb_build_object('trang_thai', 'Từ chối');
end;
$$;
```

- [ ] **Step 2: Áp lại migration**

Run: `npx supabase db reset`
Expected: tới 0019 không lỗi (đặc biệt `resolve_de_xuat_congviec` replace thành công — chữ ký `(uuid, text, text)` không đổi).

- [ ] **Step 3: Mở rộng smoke test — gọi propose không có auth phải bị chặn quyền**

Không có JWT (`auth.uid()` null) → `can_manage_thietbi` trả false → propose phải raise lỗi quyền. Thêm vào `run()` (đổi nhãn cuối thành `[Task 1-3]`):

```ts
    // (F) propose_them_hang_muc KHÔNG auth -> chặn quyền (không phải admin, không phải chủ)
    await rolledBack(c, async () => {
      const tb = await c.query(`select id from thietbi limit 1`);
      if (!tb.rows[0]) return;
      await assert.rejects(
        () =>
          c.query(
            `select propose_them_hang_muc($1,null,'CT x',null,null,'Kiểm tra',3,'Ngày',1,'ly do')`,
            [tb.rows[0].id],
          ),
        /Không có quyền/i,
        "propose không auth phải bị chặn quyền",
      );
    });

    // (G) propose_them_hang_muc thiếu lý do -> lỗi validate (chặn trước cả quyền)
    await rolledBack(c, async () => {
      const tb = await c.query(`select id from thietbi limit 1`);
      if (!tb.rows[0]) return;
      await assert.rejects(
        () =>
          c.query(
            `select propose_them_hang_muc($1,null,'CT x',null,null,'Kiểm tra',3,'Ngày',1,'')`,
            [tb.rows[0].id],
          ),
        /Lý do là bắt buộc/i,
        "propose thiếu lý do phải lỗi",
      );
    });
```

- [ ] **Step 4: Chạy smoke test — PASS**

Run: `node scripts/dev/them-hang-muc.smoke.ts`
Expected: `them-hang-muc.smoke.ts [Task 1-3]: PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_de_xuat_them_hang_muc.sql scripts/dev/them-hang-muc.smoke.ts
git commit -m "Viec 2 (Task 3): propose_them_hang_muc + resolve nhanh 'them' + RLS"
```

> **Lưu ý duyệt-theo-Nhóm & admin-áp-ngay** (cần JWT) được kiểm ở Task 6 trên app thật — smoke test pg không có ngữ cảnh auth nên chỉ khẳng định được nhánh chặn quyền.

---

### Task 4: Admin queue `/admin/de-xuat` hiển thị đề xuất 'them'

**Files:**
- Modify: `src/lib/checksheet/deXuatCongViecList.ts` (type + select + map)
- Modify: `src/app/admin/de-xuat/DeXuatCongViecList.tsx` (label + cột "Thay đổi")
- Create: `src/lib/checksheet/chiTietOptions.ts` (helper thuần, dùng lại ở Task 5)
- Test: `scripts/dev/chiTietOptions.smoke.ts`

**Interfaces:**
- Consumes: bảng `de_xuat_congviec` mở rộng (Task 1); `CongViecRow` (`src/lib/checksheet/types.ts`).
- Produces:
  - `chiTietOptions(rows): { id: string; ten: string }[]` — danh sách chi tiết distinct theo thứ tự xuất hiện.
  - `DeXuatCongViecItem` thêm `loaiDeXuat: "sua" | "loai_bo" | "them"` + các trường `tenChiTietMoi`, `dieuKienCoBanMoi`, `sttMoi`, `loaiHoatDongMoi`, `chiTietChonTen` (tên chi tiết có sẵn khi kiểu a).

- [ ] **Step 1: Viết test cho `chiTietOptions` (failing)**

Create `scripts/dev/chiTietOptions.smoke.ts`:

```ts
import assert from "node:assert";
import { chiTietOptions } from "../../src/lib/checksheet/chiTietOptions.ts";

const rows = [
  { chiTietId: "CT00001", tenChiTiet: "Ổ trục" },
  { chiTietId: "CT00001", tenChiTiet: "Ổ trục" }, // trùng -> gộp
  { chiTietId: "CT00002", tenChiTiet: "Dây curoa" },
] as Parameters<typeof chiTietOptions>[0];

const out = chiTietOptions(rows);
assert.deepStrictEqual(out, [
  { id: "CT00001", ten: "Ổ trục" },
  { id: "CT00002", ten: "Dây curoa" },
]);
console.log("chiTietOptions.smoke.ts: PASS");
```

- [ ] **Step 2: Chạy — FAIL (module chưa có)**

Run: `node scripts/dev/chiTietOptions.smoke.ts`
Expected: FAIL `Cannot find module .../chiTietOptions.ts`.

- [ ] **Step 3: Viết `chiTietOptions`**

Create `src/lib/checksheet/chiTietOptions.ts`:

```ts
// Danh sách chi tiết DISTINCT của thiết bị đang xem, dựng từ các dòng công
// việc đã load (CongViecRow) — dùng cho dropdown "Thêm công việc vào chi tiết
// có sẵn" (ThemHangMucModal) mà không cần truy vấn thêm. Giữ thứ tự xuất hiện.
export function chiTietOptions(
  rows: { chiTietId: string; tenChiTiet: string }[],
): { id: string; ten: string }[] {
  const seen = new Set<string>();
  const out: { id: string; ten: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.chiTietId)) continue;
    seen.add(r.chiTietId);
    out.push({ id: r.chiTietId, ten: r.tenChiTiet });
  }
  return out;
}
```

> Kiểm tên trường thật của `CongViecRow` trong `src/lib/checksheet/types.ts`; nếu là `chiTietId`/`tenChiTiet` thì giữ nguyên, nếu khác thì sửa cho khớp (và sửa test tương ứng).

- [ ] **Step 4: Chạy — PASS**

Run: `node scripts/dev/chiTietOptions.smoke.ts`
Expected: `chiTietOptions.smoke.ts: PASS`.

- [ ] **Step 5: Mở rộng `deXuatCongViecList.ts` cho 'them'**

Trong `src/lib/checksheet/deXuatCongViecList.ts`:

1. `DeXuatCongViecItem.loaiDeXuat`: đổi `"sua" | "loai_bo"` → `"sua" | "loai_bo" | "them"`. Thêm trường:
```ts
  // Chỉ có với loaiDeXuat === "them":
  tenChiTietMoi: string | null;
  dieuKienCoBanMoi: string | null;
  sttMoi: number | null;
  loaiHoatDongMoi: string | null;
  chiTietChonTen: string | null; // tên chi tiết có sẵn (kiểu a); null nếu chi tiết mới
```

2. `DeXuatJoinRow` thêm cột đọc từ DB: `loai_de_xuat: "sua" | "loai_bo" | "them"`, `thietbi_id`, `chitiet_id`, `ten_chi_tiet_moi`, `dieu_kien_co_ban_moi`, `stt_moi`, `loai_hoat_dong_moi`, và join phụ để lấy tên chi tiết/thiết bị cho 'them' (congviec join hiện là `!inner` → đổi thành left join, và thêm join `thietbi`/`chitiet` trực tiếp qua `thietbi_id`/`chitiet_id`).

3. `.select(...)`: đổi `congviec!inner (...)` → `congviec (...)` (bỏ `!inner` để dòng 'them' congviec_id null không bị loại); thêm:
```
       thietbi_id, chitiet_id, ten_chi_tiet_moi, dieu_kien_co_ban_moi, stt_moi, loai_hoat_dong_moi,
       thietbi ( ma_thiet_bi, ten_thiet_bi ),
       chitiet ( ten_chi_tiet )
```
(PostgREST tự nhận quan hệ qua FK `thietbi_id`/`chitiet_id` mới thêm.)

4. Trong `.map(...)`: với dòng 'them', `maThietBi`/`tenThietBi` lấy từ join `thietbi` (fallback nếu `congviec` null); set các trường mới:
```ts
      loaiDeXuat: r.loai_de_xuat,
      tenChiTietMoi: r.ten_chi_tiet_moi ?? null,
      dieuKienCoBanMoi: r.dieu_kien_co_ban_moi ?? null,
      sttMoi: r.stt_moi ?? null,
      loaiHoatDongMoi: r.loai_hoat_dong_moi ?? null,
      chiTietChonTen: firstOrNull(r.chitiet)?.ten_chi_tiet ?? null,
```
Với `maThietBi`/`tenThietBi`: `const tbTrucTiep = firstOrNull(r.thietbi);` rồi `maThietBi: thietBi?.ma_thiet_bi ?? tbTrucTiep?.ma_thiet_bi ?? ""` (tương tự tenThietBi). `tenChiTiet` cho dòng 'them' để `""` (đã có cột riêng).

- [ ] **Step 6: Cập nhật UI danh sách cho 'them'**

Trong `src/app/admin/de-xuat/DeXuatCongViecList.tsx`:

1. `LOAI_DE_XUAT_LABEL` thêm `them: "Thêm hạng mục"`. Đổi kiểu Record key thành `DeXuatCongViecItem["loaiDeXuat"]` (đã tự mở rộng).
2. `ChangeSummary` thêm nhánh 'them' ở đầu:
```tsx
  if (item.loaiDeXuat === "them") {
    const tsGoc = [item.tanSuatChuMoi, item.tanSuatSoMoi].filter((x) => x != null && x !== "").join(" ");
    const congViec = `${item.loaiHoatDongMoi ?? "—"}${item.thoiGianMoi != null ? ` · ${item.thoiGianMoi} phút` : ""}${tsGoc ? ` · ${tsGoc}` : ""}`;
    return (
      <div className="flex flex-col gap-0.5 text-xs">
        {item.chiTietChonTen ? (
          <span>+ Công việc vào chi tiết «{item.chiTietChonTen}»</span>
        ) : (
          <span>
            + Chi tiết mới: <strong>{item.tenChiTietMoi}</strong>
            {item.sttMoi != null ? ` (STT ${item.sttMoi})` : ""}
            {item.dieuKienCoBanMoi ? ` — ĐK: ${item.dieuKienCoBanMoi}` : ""}
          </span>
        )}
        <span>{congViec}</span>
      </div>
    );
  }
```
3. Cột "Chi tiết / Loại" (`item.tenChiTiet` / `item.loaiHoatDong`): với 'them', hiển thị `item.chiTietChonTen ?? item.tenChiTietMoi ?? "—"` và loại `item.loaiHoatDongMoi ?? ""` — sửa 2 chỗ đọc để fallback theo `loaiDeXuat === "them"`.

- [ ] **Step 7: Build + lint**

Run: `npm run build && npm run lint`
Expected: build PASS; lint không lỗi mới (chỉ còn lỗi có sẵn `BatThuongModal.tsx:55`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/checksheet/chiTietOptions.ts scripts/dev/chiTietOptions.smoke.ts src/lib/checksheet/deXuatCongViecList.ts src/app/admin/de-xuat/DeXuatCongViecList.tsx
git commit -m "Viec 2 (Task 4): hang doi /admin/de-xuat hien de xuat 'them'"
```

---

### Task 5: `ThemHangMucModal` + gắn nút trên checksheet

**Files:**
- Create: `src/app/checksheet/ThemHangMucModal.tsx`
- Modify: `src/app/checksheet/ChecksheetApp.tsx` (state + nút "+ Đề xuất thêm hạng mục" + render modal)
- (tham chiếu khuôn: `src/app/checksheet/EditCongViecModal.tsx`, `BatThuongModal.tsx`)

**Interfaces:**
- Consumes: `chiTietOptions` (Task 4); RPC `propose_them_hang_muc` (Task 3) qua `createClient()` (`@/lib/supabase/client`); `selectedThietBi` (có `id: uuid`, `nguoiPhuTrach`), `rows: CongViecRow[]`, `currentUser` (msnv, vai trò), tất cả đã có trong `ChecksheetApp`.
- Produces: `ThemHangMucModal` component; callback `onSuccess(applied: boolean)`.

- [ ] **Step 1: Đọc `ChecksheetApp.tsx` xác định điểm gắn**

Run: mở `src/app/checksheet/ChecksheetApp.tsx`, tìm nơi render `EditCongViecModal` và nơi có `selectedThietBi`, `rows`, `currentUser`, cách xác định admin (vd `currentUser.vaiTro`/`isAdmin`). Ghi lại tên biến thật để dùng đúng ở Step 3–4.

- [ ] **Step 2: Viết `ThemHangMucModal`**

Create `src/app/checksheet/ThemHangMucModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { chiTietOptions } from "@/lib/checksheet/chiTietOptions";

// Modal ĐỀ XUẤT "Thêm hạng mục" trên /checksheet (Việc 2). Hai kiểu:
// (a) thêm công việc vào chi tiết có sẵn; (b) thêm chi tiết mới + công việc đầu
// tiên. Người phụ trách -> tạo đề xuất chờ duyệt; Admin -> áp dụng ngay (RPC
// propose_them_hang_muc tự phân nhánh; quyền do RPC quyết định, nút mở chỉ là
// gợi ý). Hiệu lực đầu tháng sau. Khuôn responsive giống EditCongViecModal.
export function ThemHangMucModal({
  open,
  thietBiId,
  chiTietList,
  onClose,
  onSuccess,
}: {
  open: boolean;
  thietBiId: string | null;
  chiTietList: { id: string; ten: string }[];
  onClose: () => void;
  onSuccess: (applied: boolean) => void;
}) {
  const [kieu, setKieu] = useState<"co_san" | "moi">(chiTietList.length > 0 ? "co_san" : "moi");
  const [chiTietId, setChiTietId] = useState(() => chiTietList[0]?.id ?? "");
  const [tenChiTiet, setTenChiTiet] = useState("");
  const [dieuKien, setDieuKien] = useState("");
  const [stt, setStt] = useState("");
  const [loaiHoatDong, setLoaiHoatDong] = useState("Kiểm tra");
  const [thoiGian, setThoiGian] = useState("");
  const [tanSuatChu, setTanSuatChu] = useState("");
  const [tanSuatSo, setTanSuatSo] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !thietBiId) return null;

  const lyDoError = lyDo.trim().length === 0 ? "Lý do là bắt buộc" : null;
  const tenMoiError = kieu === "moi" && tenChiTiet.trim().length === 0 ? "Tên chi tiết là bắt buộc" : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!thietBiId) return;
    if (lyDoError || tenMoiError) {
      setError(lyDoError ?? tenMoiError);
      return;
    }
    const thoiGianNum = thoiGian.trim() ? Number(thoiGian) : null;
    const tanSuatSoNum = tanSuatSo.trim() ? Number(tanSuatSo) : null;
    const sttNum = stt.trim() ? Number(stt) : null;
    if (
      (thoiGian.trim() && !Number.isFinite(thoiGianNum)) ||
      (tanSuatSo.trim() && !Number.isFinite(tanSuatSoNum)) ||
      (stt.trim() && !Number.isInteger(sttNum))
    ) {
      setError("Thời gian/Tần suất số/STT phải là số hợp lệ");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("propose_them_hang_muc", {
        p_thietbi_id: thietBiId,
        p_chitiet_id: kieu === "co_san" ? chiTietId : null,
        p_ten_chi_tiet: kieu === "moi" ? tenChiTiet.trim() : null,
        p_dieu_kien_co_ban: kieu === "moi" ? dieuKien.trim() || null : null,
        p_stt: kieu === "moi" ? sttNum : null,
        p_loai_hoat_dong: loaiHoatDong.trim(),
        p_thoi_gian: thoiGianNum,
        p_tan_suat_chu: tanSuatChu.trim() || null,
        p_tan_suat_so: tanSuatSoNum,
        p_ly_do: lyDo.trim(),
      });
      if (rpcError) throw rpcError;
      onSuccess(!!data?.applied);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được đề xuất");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-md border border-[#dee2e6] bg-white p-4 shadow-lg">
        <h2 className="mb-1 text-base font-semibold text-gray-800">Đề xuất thêm hạng mục</h2>
        <p className="mb-3 text-sm text-gray-500">
          Hạng mục mới sẽ có hiệu lực từ đầu tháng sau (sau khi được duyệt).
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="kieu" checked={kieu === "co_san"} disabled={chiTietList.length === 0} onChange={() => setKieu("co_san")} />
              Thêm công việc vào chi tiết có sẵn
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="kieu" checked={kieu === "moi"} onChange={() => setKieu("moi")} />
              Thêm chi tiết mới
            </label>
          </div>

          {kieu === "co_san" ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Chi tiết</label>
              <select className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={chiTietId} onChange={(e) => setChiTietId(e.target.value)}>
                {chiTietList.map((c) => (
                  <option key={c.id} value={c.id}>{c.ten}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Tên chi tiết <span className="text-red-600">*</span></label>
                <input type="text" className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={tenChiTiet} onChange={(e) => setTenChiTiet(e.target.value)} />
                {tenChiTiet.length > 0 && tenMoiError ? <p className="text-xs text-red-600">{tenMoiError}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Điều kiện cơ bản</label>
                  <input type="text" className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={dieuKien} onChange={(e) => setDieuKien(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">STT trên sơ đồ</label>
                  <input type="number" className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={stt} onChange={(e) => setStt(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Loại hoạt động <span className="text-red-600">*</span></label>
            <select className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={loaiHoatDong} onChange={(e) => setLoaiHoatDong(e.target.value)}>
              <option>Kiểm tra</option>
              <option>Vệ sinh</option>
              <option>Bôi trơn</option>
              <option>Siết chặt</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Thời gian (phút)</label>
              <input type="number" step="any" className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={thoiGian} onChange={(e) => setThoiGian(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Tần suất</label>
              <input type="text" className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={tanSuatChu} onChange={(e) => setTanSuatChu(e.target.value)} placeholder="Ngày/Tuần/Tháng" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Số</label>
              <input type="number" step="any" className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" value={tanSuatSo} onChange={(e) => setTanSuatSo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Lý do <span className="text-red-600">*</span></label>
            <textarea className="rounded-md border border-[#ced4da] px-3 py-2 text-sm" rows={2} value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="Vì sao cần thêm hạng mục này..." required />
            {lyDo.length > 0 && lyDoError ? <p className="text-xs text-red-600">{lyDoError}</p> : null}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="rounded-full border px-3 py-2 text-sm hover:bg-gray-50" onClick={onClose} disabled={submitting}>Huỷ</button>
            <button type="submit" className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7] disabled:opacity-50" disabled={submitting || !!lyDoError || !!tenMoiError}>
              {submitting ? "Đang gửi..." : "Gửi đề xuất"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Gắn state + nút vào `ChecksheetApp.tsx`**

Thêm import: `import { ThemHangMucModal } from "./ThemHangMucModal";` và `import { chiTietOptions } from "@/lib/checksheet/chiTietOptions";`

Thêm state (cạnh state modal Sửa/Loại bỏ đã có):
```tsx
  const [themOpen, setThemOpen] = useState(false);
```

Thêm nút — đặt cuối bảng thiết bị (dưới `ChecksheetTable`), chỉ hiện khi là chủ thiết bị hoặc admin. Dùng đúng biến thật tìm ở Step 1 (ví dụ `selectedThietBi`, `currentUser`, cờ admin):
```tsx
  {selectedThietBi &&
  (selectedThietBi.nguoiPhuTrach === currentUser.msnv || isAdmin) ? (
    <button
      type="button"
      onClick={() => setThemOpen(true)}
      className="no-print mt-2 rounded-md border border-[#0d6efd] px-3 py-2 text-sm font-medium text-[#0d6efd] hover:bg-[#0d6efd]/5"
    >
      + Đề xuất thêm hạng mục
    </button>
  ) : null}
```

- [ ] **Step 4: Render modal + xử lý onSuccess**

Cạnh chỗ render `EditCongViecModal`:
```tsx
  <ThemHangMucModal
    open={themOpen}
    thietBiId={selectedThietBi?.id ?? null}
    chiTietList={chiTietOptions(rows)}
    onClose={() => setThemOpen(false)}
    onSuccess={(applied) => {
      setThemOpen(false);
      // Hạng mục mới thuộc THÁNG SAU -> không mutate lưới tháng đang xem.
      // Dùng đúng cơ chế banner/thông báo sẵn có (giống onSuccess của
      // EditCongViecModal) để báo: applied ? "Đã thêm, hiệu lực tháng sau"
      //                                     : "Đã gửi đề xuất, chờ duyệt".
    }}
  />
```
Thay comment cuối bằng lời gọi thật tới cơ chế thông báo mà `ChecksheetApp` đang dùng cho `EditCongViecModal.onSuccess` (tìm ở Step 1). Nếu `rows`/`selectedThietBi.id`/`currentUser.msnv`/`isAdmin` có tên khác trong file, thay cho khớp.

- [ ] **Step 5: Build + lint**

Run: `npm run build && npm run lint`
Expected: build PASS; không lỗi lint mới.

- [ ] **Step 6: Commit**

```bash
git add src/app/checksheet/ThemHangMucModal.tsx src/app/checksheet/ChecksheetApp.tsx
git commit -m "Viec 2 (Task 5): ThemHangMucModal + nut de xuat them tren checksheet"
```

---

### Task 6: Nghiệm thu end-to-end trên app + ảnh màn hình + bàn giao áp production

**Files:** không sửa mã (trừ khi phát hiện lỗi). Tạo ảnh trong scratchpad.

**Interfaces:** Consumes toàn bộ Task 1–5.

- [ ] **Step 1: Chạy app với env production/dev + đăng nhập**

Run: `npm run dev` (port 4000), mở `http://localhost:4000`, đăng nhập tài khoản người phụ trách (tài khoản test người dùng cấp). **Kỷ luật đọc/ghi tối thiểu**: chỉ tạo đúng các bản ghi cần cho nghiệm thu; nếu chạy trên DB production, ưu tiên dùng thiết bị nháp hoặc dọn lại (từ chối/loại bỏ) sau khi test, và ghi rõ đã làm gì.

- [ ] **Step 2: Đề xuất "Thêm" (kiểu a & b) với vai người phụ trách**

Trên checksheet thiết bị mình phụ trách: bấm "+ Đề xuất thêm hạng mục", thử **kiểu a** (chọn chi tiết có sẵn) và **kiểu b** (chi tiết mới). Kỳ vọng: thông báo "Đã gửi đề xuất, chờ duyệt"; **lưới tháng hiện tại KHÔNG đổi**. Chụp màn hình modal (desktop + viewport hẹp ~390px cho mobile — red-line #10).

- [ ] **Step 3: Kiểm hàng đợi + duyệt với vai Admin cùng Nhóm**

Đăng nhập Admin cùng Nhóm, mở `/admin/de-xuat`: thấy 2 đề xuất 'them' (badge "Thêm hạng mục", cột "Thay đổi" mô tả đúng). Bấm **Duyệt**. Kỳ vọng: thành công. Chụp màn hình hàng đợi.

- [ ] **Step 4: Xác minh hiệu lực tháng sau**

Mở checksheet thiết bị đó ở **tháng sau**: hạng mục mới xuất hiện. Ở **tháng hiện tại**: KHÔNG có. (Nếu UI chọn tháng khó, xác minh bằng `pg`: `select id, hieu_luc_tu, active from congviec where chitiet_id=... order by created_at desc limit 2` → `hieu_luc_tu` = đầu tháng sau.)

- [ ] **Step 5: Kiểm 2 nhánh quyền**

(a) Admin/AdminM tự bấm "+ Đề xuất thêm hạng mục" → **áp dụng ngay** (thông báo "Đã thêm, hiệu lực tháng sau", không vào hàng đợi). (b) Người phụ trách thiết bị **khác Nhóm mình** không thấy nút / hoặc nếu gọi RPC vẫn bị chặn (kiểm bằng cách đề xuất trên thiết bị không thuộc mình → lỗi quyền). Ghi lại kết quả.

- [ ] **Step 6: Tổng kết + bàn giao áp production**

Xác nhận `npm run build` + `npm run lint` sạch. Báo người dùng:
- Ảnh trước/sau (modal desktop + mobile, hàng đợi).
- **Áp migration lên production là việc của người dùng** (hoặc xin phép rõ ràng trước khi chạy): `npx supabase db push` trên project đã link, HOẶC dán nội dung `0019_de_xuat_them_hang_muc.sql` vào SQL editor của Supabase. Vercel tự deploy phần frontend từ master sau khi push code.
- Nhắc: nếu đã tạo bản ghi test trên production, đã dọn/để lại ra sao.

- [ ] **Step 7: Commit (nếu có sửa lỗi phát sinh)**

```bash
git add -A
git commit -m "Viec 2 (Task 6): sua loi phat hien khi nghiem thu"
```

---

## Self-Review

**Spec coverage:**
- §5 schema (congviec_id nullable, cột mới, CHECK, unique index) → Task 1. ✓
- §6.1 hàm quyền thiết bị → Task 2. ✓ §6.2 create_hang_muc_moi → Task 2. ✓ §6.3 propose_them_hang_muc → Task 3. ✓ §6.4 resolve mở rộng → Task 3. ✓ §6.5 RLS → Task 3. ✓
- §7.1/7.2 nút + ThemHangMucModal → Task 5. ✓ §7.3 hàng đợi → Task 4. ✓
- §8 lằn ranh đỏ → Global Constraints + kiểm ở Task 6. ✓ §9 nghiệm thu → Task 6. ✓

**Placeholder scan:** Không có TBD/TODO. Các bước "đọc ChecksheetApp để lấy tên biến thật" (Task 5 Step 1) là chủ đích — component lớn chưa đọc hết, phải khớp tên thật lúc thực thi; code mẫu đầy đủ, chỉ thay tên biến. Không phải placeholder logic.

**Type consistency:** `create_hang_muc_moi` chữ ký `(uuid, text, text, text, int, text, numeric, text, numeric, text)` dùng nhất quán ở Task 2 (định nghĩa), Task 3 (propose + resolve gọi). `propose_them_hang_muc` cùng thứ tự tham số. `chiTietOptions(rows) -> {id, ten}[]` dùng ở Task 4 (def/test) và Task 5 (`chiTietList` prop). `DeXuatCongViecItem.loaiDeXuat` mở rộng `"them"` đồng bộ Task 4 (type) ↔ Task 4 UI. `thietbi_id uuid` khớp `thietbi.id uuid`; `chitiet_id/congviec_id text` khớp schema.

**Ghi chú rủi ro thực thi:** (1) Tên constraint CHECK cũ của `loai_de_xuat` — Task 1 Step 2 xác minh trước khi drop. (2) Tên trường `CongViecRow` (`chiTietId`/`tenChiTiet`) — Task 4 Step 3 dặn kiểm `types.ts`. (3) Tên biến trong `ChecksheetApp` (`selectedThietBi`/`rows`/`currentUser`/`isAdmin`/cơ chế thông báo) — Task 5 Step 1 đọc xác định. Cả 3 đều có bước kiểm tường minh, không đoán mù.
