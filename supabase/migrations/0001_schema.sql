-- Pha 1: Schema nền tảng cho "Checksheet AM Bước 3".
-- Thay thế sheet Config (phẳng) bằng 3 cấp THIETBI -> CHITIET -> CONGVIEC,
-- thay sheet Data (31 cột cố định) bằng THUC_HIEN lưu thưa,
-- thêm BAT_THUONG (tính năng mới) và AUDIT_LOG.
-- Xem .claude/CLAUDE.md mục B-J để biết đặc tả gốc.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CAI_DAT: key-value thay PropertiesService của Apps Script.
-- ---------------------------------------------------------------------------
create table cai_dat (
  key text primary key,
  value text not null
);

insert into cai_dat (key, value) values
  ('LOCK_DATE', '5'),
  ('ENABLE_LOCK_DATE', 'true'),
  ('ENABLE_TIME_LIMIT', 'true'),
  ('ENABLE_DEVICE_LOCK', 'true'),
  ('MAINTENANCE_MODE', 'false');

-- ---------------------------------------------------------------------------
-- NGUOIDUNG: thay sheet Users (bỏ mật khẩu plaintext, dùng Supabase Auth).
-- vai_tro dùng enum để triệt tiêu lỗi hoa/thường của hệ cũ
-- (nơi "admin" viết thường từng làm sai UI dù server vẫn chấp nhận).
-- ---------------------------------------------------------------------------
create type vai_tro_enum as enum ('user', 'admin', 'adminm');

create table nguoidung (
  id uuid primary key references auth.users (id) on delete cascade,
  msnv text not null unique,
  ho_ten text not null,
  don_vi text,
  vai_tro vai_tro_enum not null default 'user',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- THIETBI: gộp sheet Images + phân công phụ trách (1 người / 1 thiết bị).
-- ---------------------------------------------------------------------------
create table thietbi (
  id uuid primary key default gen_random_uuid(),
  ma_thiet_bi text not null unique,
  ten_thiet_bi text not null,
  cum text,
  khu_vuc text,
  xuong text,
  kip text,
  lanh_dao text,
  truong_ca text,
  nguoi_phu_trach text references nguoidung (msnv),
  anh_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_thietbi_nguoi_phu_trach on thietbi (nguoi_phu_trach);

-- ---------------------------------------------------------------------------
-- CHITIET: điểm kiểm tra cụ thể trên thiết bị (con của THIETBI).
-- id dùng mã ổn định dạng hiển thị được (CT00001...), độc lập với nội dung text
-- để sửa mô tả không làm mồ côi lịch sử THUC_HIEN (khác rowId ghép chuỗi của hệ cũ).
-- ---------------------------------------------------------------------------
create sequence chitiet_id_seq;

create function next_chitiet_id() returns text
language sql as $$
  select 'CT' || lpad(nextval('chitiet_id_seq')::text, 5, '0');
$$;

create table chitiet (
  id text primary key default next_chitiet_id(),
  thietbi_id uuid not null references thietbi (id) on delete cascade,
  stt int,
  ten_chi_tiet text not null,
  dieu_kien_co_ban text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chitiet_thietbi_id on chitiet (thietbi_id);

-- ---------------------------------------------------------------------------
-- CONGVIEC: từng loại hoạt động trên 1 CHITIET (con của CHITIET).
-- active/hieu_luc_tu/hieu_luc_den/ngay_loai_bo phục vụ cơ chế "loại bỏ dần"
-- (mục tiêu AM Step 3 - giảm giờ chăm sóc theo thời gian).
-- ---------------------------------------------------------------------------
create sequence congviec_id_seq;

create function next_congviec_id() returns text
language sql as $$
  select 'CV' || lpad(nextval('congviec_id_seq')::text, 5, '0');
$$;

create table congviec (
  id text primary key default next_congviec_id(),
  chitiet_id text not null references chitiet (id) on delete cascade,
  loai_hoat_dong text not null,
  thoi_gian numeric,
  tan_suat_chu text,
  tan_suat_so numeric,
  active boolean not null default true,
  hieu_luc_tu date,
  hieu_luc_den date,
  ngay_loai_bo date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_congviec_chitiet_id on congviec (chitiet_id);
create index idx_congviec_active on congviec (active);

-- ---------------------------------------------------------------------------
-- THUC_HIEN: thay 31 cột cố định của sheet Data bằng lưu thưa theo ngày thật.
-- legacy_row_id/legacy_month_year chỉ dùng để đối chiếu lúc migrate (Pha 7),
-- sẽ DROP sau khi verify xong.
-- ---------------------------------------------------------------------------
create type ket_qua_enum as enum ('G', 'R', 'N');

create table thuc_hien (
  id uuid primary key default gen_random_uuid(),
  congviec_id text not null references congviec (id) on delete cascade,
  ngay date not null,
  ke_hoach boolean not null default false,
  ket_qua ket_qua_enum not null default 'N',
  nguoi_thuc_hien text references nguoidung (msnv),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_row_id text,
  legacy_month_year text,
  unique (congviec_id, ngay)
);

create index idx_thuc_hien_congviec_id on thuc_hien (congviec_id);
create index idx_thuc_hien_ngay on thuc_hien (ngay);

-- ---------------------------------------------------------------------------
-- BAT_THUONG: tính năng mới, formaliza nghiệp vụ đứng sau ô "R" của hệ cũ.
-- Ràng buộc ket_qua='R' <=> có đúng 1 BAT_THUONG được enforce bằng trigger
-- ở 0003_functions_triggers.sql (deferred, chạy lúc COMMIT).
-- ---------------------------------------------------------------------------
create table bat_thuong (
  id uuid primary key default gen_random_uuid(),
  thuchien_id uuid not null unique references thuc_hien (id) on delete restrict,
  mo_ta text not null,
  anh_url text,
  ngay_phat_hien date not null default current_date,
  ngay_khac_phuc date,
  trang_thai text not null default 'Mở' check (trang_thai in ('Mở', 'Đang xử lý', 'Đã đóng')),
  nguoi_ghi text references nguoidung (msnv),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AUDIT_LOG: nâng cấp sheet Logs cũ (chỉ ghi tóm tắt) thành audit khôi phục
-- được ở mức từng dòng, đổ qua trigger AFTER trên THUC_HIEN/BAT_THUONG
-- (0003_functions_triggers.sql). Cần job định kỳ xuất-nén-xoá (Pha 8) để
-- không chạm trần 500MB free tier.
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  bang text not null,
  ban_ghi_id text not null,
  hanh_dong text not null check (hanh_dong in ('INSERT', 'UPDATE', 'DELETE')),
  gia_tri_cu jsonb,
  gia_tri_moi jsonb,
  nguoi_thuc_hien text,
  thoi_gian timestamptz not null default now()
);

create index idx_audit_log_bang_ban_ghi on audit_log (bang, ban_ghi_id);
create index idx_audit_log_thoi_gian on audit_log (thoi_gian);
