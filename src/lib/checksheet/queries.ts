// Hàm truy vấn dữ liệu cho Pha 4 (Checksheet Grid). Nhận 1 Supabase client
// làm tham số (không tự tạo client bên trong) để dùng chung được từ cả
// Server Component (server client) lẫn Client Component (browser client).
import type { SupabaseClient } from "@supabase/supabase-js";
import { cellKey, type CongViecRow, type FilterOptions, type ThucHienMap } from "./types";

type ThietBiRow = {
  id: string;
  ma_thiet_bi: string;
  ten_thiet_bi: string;
  xuong: string | null;
  kip: string | null;
  cum: string | null;
  khu_vuc: string | null;
  lanh_dao: string | null;
  truong_ca: string | null;
  nguoi_phu_trach: string | null;
  anh_url: string | null;
  nguoidung: { ho_ten: string } | { ho_ten: string }[] | null;
};

function distinct(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== "")));
}

// PostgREST trả embed 1-1 (FK không unique ở phía "many") có thể là object
// hoặc mảng 1 phần tử tuỳ version — chuẩn hoá về 1 object|null cho chắc.
function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Tách "msnv" ra khỏi 1 phần tử FilterOptions.nhanVien (định dạng "msnv - ho_ten"). */
export function parseNhanVienMsnv(nhanVienDisplay: string): string {
  const idx = nhanVienDisplay.indexOf(" - ");
  return idx === -1 ? nhanVienDisplay : nhanVienDisplay.slice(0, idx);
}

/**
 * SELECT toàn bộ `thietbi` (join `nguoidung` lấy `ho_ten` qua
 * `nguoi_phu_trach`), suy ra danh sách xưởng/kíp/nhân viên/thiết bị distinct
 * dùng cho bộ lọc cascading Xưởng -> Nhóm -> Nhân viên -> Thiết bị.
 */
export async function getFilterOptions(supabase: SupabaseClient): Promise<FilterOptions> {
  const { data, error } = await supabase
    .from("thietbi")
    .select(
      "id, ma_thiet_bi, ten_thiet_bi, xuong, kip, cum, khu_vuc, lanh_dao, truong_ca, nguoi_phu_trach, anh_url, nguoidung(ho_ten)",
    )
    .order("ma_thiet_bi");

  if (error) throw error;

  const rows = (data ?? []) as unknown as ThietBiRow[];

  const thietBi = rows.map((r) => ({
    id: r.id,
    maThietBi: r.ma_thiet_bi,
    tenThietBi: r.ten_thiet_bi,
    xuong: r.xuong ?? "",
    kip: r.kip ?? "",
    cum: r.cum ?? null,
    khuVuc: r.khu_vuc ?? null,
    lanhDao: r.lanh_dao ?? null,
    truongCa: r.truong_ca ?? null,
    nguoiPhuTrach: r.nguoi_phu_trach ?? null,
    nguoiPhuTrachTen: firstOrNull(r.nguoidung)?.ho_ten ?? null,
    anhUrl: r.anh_url ?? null,
  }));

  const xuong = distinct(rows.map((r) => r.xuong)).sort();
  const kip = distinct(rows.map((r) => r.kip)).sort();

  const nhanVien = distinct(
    rows
      .filter((r) => r.nguoi_phu_trach)
      .map((r) => {
        const hoTen = firstOrNull(r.nguoidung)?.ho_ten;
        return hoTen ? `${r.nguoi_phu_trach} - ${hoTen}` : r.nguoi_phu_trach!;
      }),
  ).sort();

  return { xuong, kip, nhanVien, thietBi };
}

type CongViecJoinRow = {
  id: string;
  chitiet_id: string;
  loai_hoat_dong: string;
  thoi_gian: number | null;
  tan_suat_chu: string | null;
  tan_suat_so: number | null;
  chitiet:
    | { stt: number | null; ten_chi_tiet: string; dieu_kien_co_ban: string | null }
    | { stt: number | null; ten_chi_tiet: string; dieu_kien_co_ban: string | null }[]
    | null;
};

/**
 * SELECT `congviec` join `chitiet` where `chitiet.thietbi_id = thietBiId`,
 * áp điều kiện lọc "loại bỏ dần" (xem Global Constraints trong plan):
 *   active = true
 *   AND (hieu_luc_tu IS NULL OR hieu_luc_tu <= thangCuoi)
 *   AND (hieu_luc_den IS NULL OR hieu_luc_den >= thangDau)
 *
 * Quyết định triển khai: viết thuần bằng PostgREST filter chain
 * (`.eq()` + 2 lần `.or()`), KHÔNG viết SQL function riêng. Lý do: PostgREST
 * AND nhiều điều kiện lọc trên các param khác nhau theo mặc định (kể cả khi
 * lặp lại cùng 1 "cột ảo" `or`, xem docs PostgREST về "same column multiple
 * times" áp dụng tương tự cho các toán tử and/or/not) -- nên 2 lệnh gọi
 * `.or()` liên tiếp cho ra đúng AND(active=true, OR(...), OR(...)) mong
 * muốn mà không cần thêm 1 SQL function chỉ để biểu diễn 1 biểu thức bất
 * đẳng thức ngày tháng đơn giản. Đã verify bằng script Node thực tế (xem
 * report Task 1) chạy trên Supabase local: dòng CONGVIEC ngoài khoảng hiệu
 * lực của tháng xem KHÔNG xuất hiện trong kết quả trả về.
 */
export async function getCongViecRows(
  supabase: SupabaseClient,
  thietBiId: string,
  thangDau: string,
  thangCuoi: string,
): Promise<CongViecRow[]> {
  const { data, error } = await supabase
    .from("congviec")
    .select(
      "id, chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu, hieu_luc_den, chitiet!inner(stt, ten_chi_tiet, dieu_kien_co_ban, thietbi_id)",
    )
    .eq("chitiet.thietbi_id", thietBiId)
    .eq("active", true)
    .or(`hieu_luc_tu.is.null,hieu_luc_tu.lte.${thangCuoi}`)
    .or(`hieu_luc_den.is.null,hieu_luc_den.gte.${thangDau}`)
    .order("stt", { referencedTable: "chitiet" })
    .order("loai_hoat_dong");

  if (error) throw error;

  const rows = (data ?? []) as unknown as CongViecJoinRow[];

  return rows.map((r) => {
    const chiTiet = firstOrNull(r.chitiet);
    return {
      congViecId: r.id,
      chiTietId: r.chitiet_id,
      stt: chiTiet?.stt ?? null,
      tenChiTiet: chiTiet?.ten_chi_tiet ?? "",
      dieuKienCoBan: chiTiet?.dieu_kien_co_ban ?? null,
      loaiHoatDong: r.loai_hoat_dong,
      thoiGian: r.thoi_gian,
      tanSuatChu: r.tan_suat_chu,
      tanSuatSo: r.tan_suat_so,
    };
  });
}

type ThucHienJoinRow = {
  id: string;
  congviec_id: string;
  ngay: string;
  ke_hoach: boolean;
  ket_qua: "G" | "R" | "N";
  updated_at: string;
  // Embed ngược từ `thuc_hien` sang `bat_thuong` (FK nằm ở bat_thuong.thuchien_id,
  // unique -- xem 0001_schema.sql) -- Task 4: chỉ có giá trị (0 hoặc 1 phần tử)
  // khi ket_qua='R' và đã có bản ghi bat_thuong tương ứng. PostgREST trả embed
  // 1-1 dạng object hoặc mảng 1 phần tử tuỳ version, chuẩn hoá bằng firstOrNull().
  bat_thuong: { mo_ta: string; trang_thai: string } | { mo_ta: string; trang_thai: string }[] | null;
};

/**
 * SELECT `thuc_hien` where `congviec_id = any(congViecIds) and ngay between
 * thangDau and thangCuoi`, build map bằng `cellKey()`. Task 4: join thêm
 * `bat_thuong.mo_ta`/`trang_thai` để Cell.tsx hiện tooltip hover cho các ô
 * ket_qua='R' mà không cần gọi API riêng cho từng ô.
 */
export async function getThucHien(
  supabase: SupabaseClient,
  congViecIds: string[],
  thangDau: string,
  thangCuoi: string,
): Promise<ThucHienMap> {
  if (congViecIds.length === 0) return {};

  const { data, error } = await supabase
    .from("thuc_hien")
    .select("id, congviec_id, ngay, ke_hoach, ket_qua, updated_at, bat_thuong(mo_ta, trang_thai)")
    .in("congviec_id", congViecIds)
    .gte("ngay", thangDau)
    .lte("ngay", thangCuoi);

  if (error) throw error;

  const rows = (data ?? []) as ThucHienJoinRow[];

  const map: ThucHienMap = {};
  for (const r of rows) {
    const batThuong = firstOrNull(r.bat_thuong);
    map[cellKey(r.congviec_id, r.ngay)] = {
      id: r.id,
      keHoach: r.ke_hoach,
      ketQua: r.ket_qua,
      updatedAt: r.updated_at,
      batThuongMoTa: batThuong?.mo_ta ?? null,
    };
  }
  return map;
}
