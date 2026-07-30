// #3: đọc lịch sử thay đổi của 1 thiết bị (RPC get_thietbi_lich_su, migration
// 0022) và format phía TS thành dòng đọc được. RPC (security definer) trả dữ
// liệu thô từ audit_log; hiển thị lo ở đây (lazy split: SQL lấy data, TS format).
import type { SupabaseClient } from "@supabase/supabase-js";

export type LichSuBang = "chitiet" | "congviec" | "thuc_hien";
export type NhomLichSu = "cau_hinh" | "cham_cong";

export type LichSuRow = {
  thoiGian: string;
  bang: LichSuBang;
  hanhDong: "INSERT" | "UPDATE" | "DELETE";
  giaTriCu: Record<string, unknown> | null;
  giaTriMoi: Record<string, unknown> | null;
  nguoiMsnv: string | null;
  nguoiTen: string | null;
  lyDo: string | null;
};

type RpcRow = {
  thoi_gian: string;
  bang: string;
  hanh_dong: string;
  gia_tri_cu: Record<string, unknown> | null;
  gia_tri_moi: Record<string, unknown> | null;
  nguoi_msnv: string | null;
  nguoi_ten: string | null;
  ly_do: string | null;
};

export async function getThietBiLichSu(
  supabase: SupabaseClient,
  thietBiId: string,
): Promise<LichSuRow[]> {
  const { data, error } = await supabase.rpc("get_thietbi_lich_su", { p_thietbi_id: thietBiId });
  if (error) throw error;
  return ((data ?? []) as RpcRow[]).map((r) => ({
    thoiGian: r.thoi_gian,
    bang: r.bang as LichSuBang,
    hanhDong: r.hanh_dong as LichSuRow["hanhDong"],
    giaTriCu: r.gia_tri_cu,
    giaTriMoi: r.gia_tri_moi,
    nguoiMsnv: r.nguoi_msnv,
    nguoiTen: r.nguoi_ten,
    lyDo: r.ly_do,
  }));
}

export function nhomCuaLichSu(bang: LichSuBang): NhomLichSu {
  return bang === "thuc_hien" ? "cham_cong" : "cau_hinh";
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "có" : "không";
  return String(v);
}

// Mô tả gọn 1 dòng lịch sử để hiển thị.
export function moTaLichSu(row: LichSuRow): string {
  if (row.bang === "thuc_hien") {
    const v = (row.giaTriMoi ?? row.giaTriCu ?? {}) as Record<string, unknown>;
    const ngay = String(v.ngay ?? "");
    const day = ngay ? `Ngày ${Number(ngay.slice(8, 10))}: ` : "";
    if (row.hanhDong === "DELETE") return `${day}xoá ô chấm`;
    const ke = v.ke_hoach ? "có kế hoạch" : "không kế hoạch";
    const kq = String(v.ket_qua ?? "N");
    const kqLabel = kq === "G" ? "Tốt" : kq === "R" ? "Bất thường" : "Chưa/không";
    return `${day}${ke}, kết quả ${kqLabel}`;
  }

  const ten = row.bang === "congviec" ? "công việc" : "chi tiết";
  if (row.hanhDong === "INSERT") {
    const v = (row.giaTriMoi ?? {}) as Record<string, unknown>;
    const label =
      row.bang === "congviec" ? String(v.loai_hoat_dong ?? "") : String(v.ten_chi_tiet ?? "");
    return `Thêm ${ten}${label ? `: ${label}` : ""}`;
  }
  if (row.hanhDong === "DELETE") return `Xoá ${ten}`;

  // UPDATE: liệt kê các trường thực sự đổi.
  const cu = (row.giaTriCu ?? {}) as Record<string, unknown>;
  const moi = (row.giaTriMoi ?? {}) as Record<string, unknown>;
  const fields: [string, string][] = [
    ["loai_hoat_dong", "Loại hoạt động"],
    ["thoi_gian", "Thời gian"],
    ["tan_suat_chu", "Tần suất (đơn vị)"],
    ["tan_suat_so", "Tần suất (số)"],
    ["ten_chi_tiet", "Tên chi tiết"],
    ["dieu_kien_co_ban", "Điều kiện cơ bản"],
    ["stt", "STT"],
    ["hieu_luc_tu", "Hiệu lực từ"],
    ["hieu_luc_den", "Hiệu lực đến"],
    ["active", "Active"],
    ["ngay_loai_bo", "Ngày loại bỏ"],
  ];
  const changes: string[] = [];
  for (const [k, label] of fields) {
    if (JSON.stringify(cu[k] ?? null) !== JSON.stringify(moi[k] ?? null)) {
      changes.push(`${label}: ${fmtVal(cu[k])} → ${fmtVal(moi[k])}`);
    }
  }
  return changes.length ? `Sửa ${ten} — ${changes.join("; ")}` : `Sửa ${ten}`;
}
