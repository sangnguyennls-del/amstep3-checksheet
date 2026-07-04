# Pha 8 — Audit trigger + GitHub Actions cron jobs

## Bối cảnh

Bảng `audit_log` (schema, RLS `audit_log_select`, grant `select` cho `authenticated`)
đã tồn tại từ Pha 1 (`supabase/migrations/0001_schema.sql` dòng 158-176,
`0003_rls_policies.sql` dòng ~130, `0004_grants.sql` dòng 23) — nhưng **chưa có
trigger nào ghi vào đó**. Pha 8 chỉ còn 2 việc theo CLAUDE.md mục F + "Pha 8":

1. Trigger `AFTER INSERT/UPDATE/DELETE` trên `THUC_HIEN`/`BAT_THUONG`, ghi
   `AUDIT_LOG` (jsonb OLD/NEW) — biến bảng đã có schema thành audit trail
   thật sự hoạt động.
2. GitHub Actions: job export+purge `AUDIT_LOG` định kỳ (tránh chạm trần
   500MB free tier) + (đã xác nhận vẫn cần, xem dưới) job ping giữ Supabase
   khỏi tạm ngưng.

**Đã xác nhận qua tìm hiểu thực tế (không phải đoán) — chính sách free-tier
Supabase 07/2026**: project free tier vẫn bị tạm ngưng (pause) sau **7 ngày
không có hoạt động DB thật** (không tính truy cập UI/API khác) — dữ liệu/schema
không mất, chỉ compute bị tắt, cần request đầu tiên "đánh thức" lại (~30s).
Do đó job ping giữ hoạt động **vẫn cần thiết**, không thể bỏ như ghi chú mở
trong CLAUDE.md gợi ý kiểm tra lại.

## Đọc trước khi code

- `supabase/migrations/0001_schema.sql` — schema `audit_log` đã có sẵn, KHÔNG
  được sửa đổi cấu trúc (chỉ thêm trigger ở migration mới).
- `supabase/migrations/0002_functions_triggers.sql` — quy ước hàm/trigger của
  dự án: `current_msnv()` (SECURITY DEFINER, đọc `auth.uid()` — hoạt động đúng
  xuyên suốt các lệnh gọi RPC lồng nhau vì dựa vào JWT claim, không phải
  `current_user`, nên KHÔNG dính bug `SECURITY DEFINER` che `current_user` đã
  phát hiện ở Pha 7 cho `fn_guard_vai_tro_change`), `fn_set_updated_at()`
  (1 hàm dùng chung nhiều bảng qua trigger riêng từng bảng — làm mẫu cho hàm
  audit dùng chung 2 bảng THUC_HIEN/BAT_THUONG), `fn_guard_vai_tro_change()`
  (mẫu cho việc khai báo `security definer` trên 1 trigger function để đảm bảo
  ghi được vào bảng phụ trợ (ở đây là `audit_log`) bất kể vai trò của người gọi
  gốc — vì mọi UPDATE/INSERT thật lên THUC_HIEN/BAT_THUONG đều đi qua RPC
  `upsert_thuc_hien`/`set_ket_qua_r_with_bat_thuong` (đã SECURITY DEFINER) hoặc
  qua kết nối `pg` trực tiếp bằng role `postgres` (script migrate Pha 7) — cả
  2 đường đều chạy với quyền cao, nhưng khai báo trigger audit là
  SECURITY DEFINER vẫn là lớp phòng thủ đúng đắn, nhất quán với
  `fn_guard_vai_tro_change`, để không bao giờ audit log bị RLS chặn ghi dù
  tương lai có thêm đường ghi khác).
- `supabase/migrations/0003_rls_policies.sql`, `0004_grants.sql` — xem đúng
  policy/grant hiện tại của `audit_log` (chỉ SELECT cho admin qua RLS, không
  có INSERT policy nào — đúng ý đồ: chỉ trigger SECURITY DEFINER được ghi,
  không role nào tự ý INSERT/UPDATE/DELETE trực tiếp vào audit_log).
- `package.json` — `pg` đã là devDependency (thêm ở Pha 7), tái dùng cho script
  export+purge, không cần thêm dependency mới.
- Không có workflow GitHub Actions nào tồn tại trong repo (`.github/workflows/`
  chưa tồn tại) — Pha 8 là lần đầu thêm CI/CD tự động cho dự án này.

## Global Constraints

- **Không sửa đổi bất kỳ migration nào từ 0001-0008** — chỉ thêm migration mới
  (`0009_audit_triggers.sql`).
- Hàm trigger audit dùng chung cho cả 2 bảng (`THUC_HIEN`, `BAT_THUONG`) —
  1 hàm, 2 trigger riêng (mỗi bảng 1 trigger, giống mẫu `fn_set_updated_at`).
- `bang` = `TG_TABLE_NAME` (tên bảng thật lúc trigger chạy, không hardcode
  string trùng lặp cho mỗi trigger).
- `ban_ghi_id` = `id` của dòng bị tác động dạng text (`NEW.id::text` cho
  INSERT/UPDATE, `OLD.id::text` cho DELETE) — cả 2 bảng đều có cột `id uuid`.
- `hanh_dong` = `TG_OP` (khớp check constraint có sẵn `in ('INSERT','UPDATE','DELETE')`).
- `gia_tri_cu`/`gia_tri_moi`: `to_jsonb(OLD)`/`to_jsonb(NEW)` tương ứng, NULL ở
  vế không áp dụng (INSERT không có OLD, DELETE không có NEW).
- `nguoi_thuc_hien` = `current_msnv()` — sẽ là NULL cho các lệnh ghi không có
  JWT gốc (vd script migrate Pha 7 chạy qua kết nối `pg` trực tiếp bằng role
  `postgres`, không có `auth.uid()`) — đây là hành vi ĐÚNG và có chủ đích
  (không có "người dùng" thật đứng sau 1 lần import hàng loạt), không cần xử
  lý gì thêm.
- Trigger phải là **AFTER** (không phải BEFORE — audit ghi lại trạng thái sau
  khi thao tác xác nhận thành công, không phải trước khi biết chắc sẽ áp dụng)
  và **FOR EACH ROW** (mỗi dòng bị ảnh hưởng 1 bản ghi audit, không phải
  1 bản ghi cho cả câu lệnh).
- **Hệ quả cần lường trước, không phải lỗi**: khi Pha 9 chạy migrate dữ liệu
  thật lần cuối lên production, ~38500+ dòng THUC_HIEN/BAT_THUONG sẽ được
  INSERT — sau khi Pha 8 merge, quá trình đó sẽ tự động sinh ra ~38500+ dòng
  `audit_log` tương ứng (mỗi dòng 1 event "INSERT lúc migrate"). Đây là hành
  vi audit ĐÚNG (ghi nhận chính xác thời điểm dữ liệu được đưa vào hệ thống),
  không cần tắt trigger lúc migrate — chỉ cần lưu ý số liệu này khi ước tính
  dung lượng `audit_log` ban đầu (không phải điều Pha 8 cần code, chỉ là ghi
  chú vận hành cho Pha 9).
- Script export+purge và script ping đều đặt trong `scripts/audit/` (thư mục
  mới), viết TypeScript chạy thẳng bằng Node 24 native (`node script.ts`,
  không `tsx`/`ts-node`), theo đúng convention `scripts/migrate/*.ts` đã có.
- Không commit secret nào — mọi kết nối DB thật (production) chỉ được cấu hình
  qua GitHub Actions Secrets (`SUPABASE_DB_URL`), không hardcode ở bất kỳ đâu.
  Workflow chạy `workflow_dispatch` cho phép test thủ công.
- Ngưỡng giữ lại (retention) cho `audit_log` trước khi purge: mặc định
  **90 ngày** — đủ dài để phục vụ mục đích "khôi phục dữ liệu mất" (mục F
  CLAUDE.md) trong hầu hết tình huống thực tế, đủ ngắn để không chạm trần
  500MB free tier với tốc độ ghi ước tính (audit ở mức từng ô, mỗi thao tác
  chấm công tạo 1-2 dòng audit/ngày/CONGVIEC). Hardcode hằng số này trong
  script (không cần đưa vào `cai_dat`, đây không phải hành vi nghiệp vụ người
  dùng cuối cấu hình được).
- File export: JSON Lines nén gzip (`.ndjson.gz`), mỗi dòng 1 bản ghi audit_log
  đầy đủ (bao gồm cả `id` gốc) — đủ để khôi phục nguyên trạng nếu cần, dễ
  `zcat | jq` khi tra cứu thủ công. Tên file có timestamp
  (`audit-log-export-YYYYMMDD-HHmmss.ndjson.gz`).
- **Purge chỉ chạy sau khi export ra file thành công VÀ đã xác nhận số dòng
  trong file khớp số dòng dự kiến sẽ xoá** — không bao giờ xoá trước khi có
  bằng chứng dữ liệu đã được lưu ra ngoài. Nếu export thất bại (lỗi ghi file,
  lỗi query), KHÔNG được chạy phần xoá, thoát với lỗi rõ ràng.
- Workflow export+purge: upload file `.ndjson.gz` làm GitHub Actions artifact
  (`actions/upload-artifact`, đặt `retention-days: 400` — mức tối đa cho phép,
  để giữ được nhiều kỳ export mà không cần thêm hạ tầng lưu trữ khác, đúng
  tinh thần "chi phí 0đ" của dự án). KHÔNG commit file export vào git (dữ liệu
  sản xuất, có thể chứa tên/MSNV người dùng thật — không nên nằm trong lịch sử
  git).
- Job ping giữ Supabase khỏi tạm ngưng: chạy tối thiểu **mỗi 3 ngày**
  (an toàn dưới ngưỡng 7 ngày pause, đủ dư để chịu được vài lần workflow bị
  trễ/lỗi liên tiếp mà vẫn không bị tạm ngưng) — chỉ cần 1 câu SELECT đơn giản
  vô hại (vd `select 1` hoặc `select count(*) from cai_dat`), không ghi gì
  vào DB, không cần export/log riêng cho job này (khác hẳn mục đích job
  export+purge).
- 2 workflow (export+purge, ping giữ hoạt động) tách thành 2 file YAML riêng
  trong `.github/workflows/` — lịch chạy khác nhau, mục đích khác nhau, không
  nên gộp chung 1 job.

## Kiến trúc file

- `supabase/migrations/0009_audit_triggers.sql` (mới) — hàm `fn_audit_log_change()`
  + 2 trigger (`trg_audit_thuc_hien`, `trg_audit_bat_thuong`).
- `scripts/audit/exportAndPurge.ts` (mới) — logic export+purge, gọi được từ
  CLI (`node scripts/audit/exportAndPurge.ts [--commit]`, mặc định dry-run
  giống quy ước `scripts/migrate/run.ts`) VÀ từ GitHub Actions.
- `scripts/audit/ping.ts` (mới) — logic ping giữ hoạt động, 1 câu SELECT đơn
  giản qua `pg`.
- `.github/workflows/audit-log-export-purge.yml` (mới) — lịch `cron` (hàng
  tuần, vd Chủ nhật 02:00 UTC) + `workflow_dispatch`, chạy
  `scripts/audit/exportAndPurge.ts --commit`, upload artifact.
- `.github/workflows/supabase-keep-alive.yml` (mới) — lịch `cron` mỗi 3 ngày +
  `workflow_dispatch`, chạy `scripts/audit/ping.ts`.
- `docs/plans/pha8-audit-cron.md` — file này.

## Task 1 — Migration SQL: trigger audit trên THUC_HIEN/BAT_THUONG

**Mục tiêu:** tạo `supabase/migrations/0009_audit_triggers.sql` implement đúng
Global Constraints ở trên, verify bằng cách sửa/xoá/thêm dữ liệu thật trên
local Supabase và xác nhận `audit_log` ghi đúng OLD/NEW.

**Việc cần làm:**
- Viết `fn_audit_log_change()` (plpgsql, `security definer`,
  `set search_path = public`) — logic theo đúng Global Constraints (`TG_OP`,
  `TG_TABLE_NAME`, `to_jsonb(OLD)`/`to_jsonb(NEW)`, `current_msnv()`).
- Tạo 2 trigger: `trg_audit_thuc_hien after insert or update or delete on
  thuc_hien for each row execute function fn_audit_log_change();` và tương tự
  cho `bat_thuong`.
- **Verify (chạy thật trên `npx supabase db reset` + local Supabase, dùng
  Supabase JS client hoặc `psql`/`pg` trực tiếp qua các RPC đã có sẵn
  `upsert_thuc_hien`/`set_ket_qua_r_with_bat_thuong`, KHÔNG viết RPC test mới)**:
  - Tạo 1 user test qua `auth.admin.createUser` + `nguoidung` (msnv bất kỳ,
    vd `TEST001`), đăng nhập lấy JWT thật (qua `signInWithPassword`), gọi
    `upsert_thuc_hien` với JWT đó (không phải role `postgres` trần) để xác
    nhận `current_msnv()` trong context RPC lồng trigger vẫn resolve đúng MSNV
    của user test — đây là điểm quan trọng nhất cần verify thật, không chỉ đọc
    code suy luận.
  - INSERT 1 dòng THUC_HIEN mới qua `upsert_thuc_hien` → xác nhận `audit_log`
    có đúng 1 dòng mới: `bang='thuc_hien'`, `hanh_dong='INSERT'`,
    `gia_tri_cu is null`, `gia_tri_moi` chứa đúng toàn bộ dòng vừa tạo (so
    khớp từng field), `nguoi_thuc_hien` = đúng MSNV user test.
  - UPDATE dòng đó (đổi `ke_hoach`) qua `upsert_thuc_hien` lần nữa → xác nhận
    thêm 1 dòng `audit_log` mới: `hanh_dong='UPDATE'`, `gia_tri_cu` khớp giá
    trị TRƯỚC khi đổi, `gia_tri_moi` khớp giá trị SAU khi đổi.
  - Gọi `set_ket_qua_r_with_bat_thuong` cho 1 CONGVIEC khác → xác nhận CẢ 2
    dòng `audit_log` được tạo (1 cho UPDATE/INSERT trên `thuc_hien`, 1 cho
    INSERT trên `bat_thuong`), đúng bảng/hành động tương ứng.
  - Xoá 1 dòng CONGVIEC test (cascade xoá THUC_HIEN con, với điều kiện dòng đó
    KHÔNG có BAT_THUONG — nếu có sẽ bị chặn bởi `on delete restrict`, chọn
    dòng test phù hợp) → xác nhận `audit_log` có dòng `hanh_dong='DELETE'`,
    `gia_tri_cu` chứa dòng vừa mất, `gia_tri_moi is null`.
  - Xác nhận migrate qua kết nối `pg` trực tiếp bằng role `postgres` (dùng lại
    `scripts/migrate/db.ts` — chỉ INSERT thử 1 dòng THUC_HIEN test rồi xoá
    ngay sau khi verify, KHÔNG chạy lại toàn bộ pipeline Pha 7) cũng tạo được
    dòng `audit_log` với `nguoi_thuc_hien is null` (đúng như Global Constraints
    dự đoán, không phải lỗi).
  - `npx tsc --noEmit` sạch, `npx supabase db reset` dọn dẹp sau verify.

## Task 2 — Script export+purge + script ping + 2 GitHub Actions workflow

**Mục tiêu:** tự động hoá việc giữ `audit_log` dưới trần dung lượng free tier
và giữ project Supabase khỏi bị tạm ngưng, chạy được cả qua `workflow_dispatch`
thủ công lẫn theo lịch.

**Việc cần làm:**
- `scripts/audit/exportAndPurge.ts`:
  - Đọc `SUPABASE_DB_URL` từ env (tái dùng `getPgClient()` từ
    `scripts/migrate/db.ts` nếu tiện, hoặc tự tạo client `pg` riêng nếu import
    chéo thư mục `scripts/migrate` không hợp lý về mặt tổ chức — tự quyết định,
    ưu tiên không lặp code).
  - Query toàn bộ `audit_log` có `thoi_gian < now() - interval '90 days'`.
  - Nếu 0 dòng: log rõ "không có gì để export/purge", thoát thành công, không
    tạo file rỗng.
  - Nếu có dòng: ghi ra file `.ndjson.gz` (dùng `node:zlib` `gzip`/`gzipSync`
    hoặc stream, không cần dependency ngoài), đường dẫn
    `scripts/audit/tmp/audit-log-export-<timestamp>.ndjson.gz` (thư mục `tmp/`
    đã được gitignore theo convention `scripts/migrate/tmp/` — thêm dòng
    tương ứng cho `scripts/audit/tmp/` vào `.gitignore` nếu pattern hiện tại
    chưa bao trùm).
  - Đọc lại file vừa ghi, đếm số dòng, so khớp CHÍNH XÁC với số dòng query
    được — nếu lệch, DỪNG NGAY, KHÔNG xoá gì, thoát lỗi rõ ràng.
  - Chỉ khi khớp VÀ có cờ `--commit` (mặc định dry-run, giống quy ước
    `scripts/migrate/run.ts`): `DELETE FROM audit_log WHERE thoi_gian < now() -
    interval '90 days'` — dùng đúng điều kiện đã query (không xoá theo id list
    thu thập trước đó để tránh race condition với audit log mới sinh ra giữa
    lúc export và lúc xoá vô tình lọt vào ngưỡng cũ — về lý thuyết real-time
    audit log mới luôn có `thoi_gian` = now() nên không thể rơi vào điều kiện
    "< now() - 90 ngày" tại thời điểm query lần 2, an toàn dùng lại cùng
    điều kiện thời gian).
  - In ra số dòng đã export, số dòng đã xoá, đường dẫn file, kích thước file.
- `scripts/audit/ping.ts`:
  - Đọc `SUPABASE_DB_URL` từ env, kết nối `pg`, chạy `select 1`, đóng kết nối,
    log thành công/thất bại rõ ràng. Không có `--commit`/dry-run (không có gì
    để "ghi thật" ngoài việc kết nối reset đồng hồ tạm ngưng của Supabase).
- `.github/workflows/audit-log-export-purge.yml`:
  - `on: schedule: cron` hàng tuần (vd `0 2 * * 0`) + `workflow_dispatch`.
  - Steps: checkout, setup Node 24, `npm ci`, chạy
    `node scripts/audit/exportAndPurge.ts --commit` với
    `SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}`, sau đó
    `actions/upload-artifact@v4` với `path` trỏ đúng thư mục
    `scripts/audit/tmp/*.ndjson.gz`, `retention-days: 400`,
    `if-no-files-found: ignore` (trường hợp không có gì để export tuần đó).
- `.github/workflows/supabase-keep-alive.yml`:
  - `on: schedule: cron` mỗi 3 ngày (vd `0 3 */3 * *`) + `workflow_dispatch`.
  - Steps: checkout, setup Node 24, `npm ci`, chạy `node scripts/audit/ping.ts`
    với `SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}`.
- **Verify**:
  - `npx tsc --noEmit` sạch.
  - Chạy `node scripts/audit/exportAndPurge.ts` (dry-run) trên local Supabase
    đã có sẵn vài dòng `audit_log` cũ giả lập (tự chèn thẳng vài dòng test với
    `thoi_gian` cố ý set về quá khứ >90 ngày qua `pg`, đánh dấu rõ đây là dữ
    liệu test) → xác nhận KHÔNG xoá gì, báo đúng số dòng SẼ export/xoá.
  - Chạy `--commit` → xác nhận file `.ndjson.gz` được tạo, giải nén ra đúng
    nội dung (đối chiếu vài dòng ngẫu nhiên với dữ liệu test đã chèn), các
    dòng cũ đã bị xoá khỏi `audit_log`, các dòng KHÔNG đủ điều kiện (mới hơn
    90 ngày) vẫn còn nguyên.
  - Chạy `node scripts/audit/ping.ts` xác nhận kết nối+SELECT thành công.
  - Vì không thể chạy thật GitHub Actions từ môi trường agent (không có
    quyền trigger workflow qua `gh` với secret thật) — xác nhận cú pháp YAML
    hợp lệ bằng cách đọc kỹ + (nếu có `gh` CLI khả dụng) thử
    `gh workflow list`/validate cấu trúc, KHÔNG cần trigger thật; nêu rõ hạn
    chế này trong báo cáo, giống cách Pha 7 xử lý hạn chế "không có trình
    duyệt".
  - `npx supabase db reset` dọn dẹp dữ liệu test sau verify.
