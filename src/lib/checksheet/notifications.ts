// Chuông thông báo trên trang checksheet. Gọi RPC `get_notifications`
// (0002_functions_triggers.sql) cho nhắc-việc Plan/Actual, VÀ đọc thẳng
// `de_xuat_congviec` cho kết quả đề xuất (được duyệt / bị từ chối) của chính
// người dùng. Tải lúc mount + sau khi lưu checksheet (không polling).
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tên sự kiện `window` dispatch sau khi lưu checksheet (Plan/Actual hoặc bất
 * thường) thành công -- dùng chung giữa ChecksheetApp.tsx (nơi dispatch) và
 * NotificationBell.tsx (nơi lắng nghe) để tránh hardcode chuỗi lặp lại. */
export const CHECKSHEET_SAVED_EVENT = "checksheet:saved";

export type NotificationGroup = {
  loai: "plan" | "act" | "de_xuat";
  tieuDe: string;
  items: string[];
};

/** Kết quả 1 đề xuất đã xử lý của người dùng -- kèm `updatedAt` để chuông lọc
 * "chưa xem" (localStorage), tránh lặp lại thông báo cũ. */
export type DeXuatOutcome = {
  text: string;
  updatedAt: string;
};

export type NotificationData = {
  groups: NotificationGroup[];
  deXuat: DeXuatOutcome[];
};

type RawNotificationRow = {
  loai: "plan" | "act";
  thiet_bi: string;
  noi_dung: string | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const LOAI_DE_XUAT_LABEL: Record<string, string> = {
  sua: "Sửa",
  loai_bo: "Loại bỏ",
  them: "Thêm",
  khoi_phuc: "Khôi phục",
};

type DeXuatRow = {
  loai_de_xuat: string;
  trang_thai: string;
  ly_do_tu_choi: string | null;
  updated_at: string;
  loai_hoat_dong_moi: string | null;
  ten_chi_tiet_moi: string | null;
  nguoi_duyet_nd: { ho_ten: string } | { ho_ten: string }[] | null;
  congviec: {
    loai_hoat_dong: string;
    chitiet: { ten_chi_tiet: string } | { ten_chi_tiet: string }[] | null;
  } | { loai_hoat_dong: string; chitiet: { ten_chi_tiet: string } | { ten_chi_tiet: string }[] | null }[] | null;
};

async function getPlanActGroups(supabase: SupabaseClient, msnv: string): Promise<NotificationGroup[]> {
  const { data, error } = await supabase.rpc("get_notifications", { p_msnv: msnv });
  if (error) throw error;

  const rows = (data ?? []) as RawNotificationRow[];
  const groups: NotificationGroup[] = [];

  const planRows = rows.filter((r) => r.loai === "plan");
  if (planRows.length > 0) {
    const thietBiList = Array.from(new Set(planRows.map((r) => r.thiet_bi)));
    groups.push({ loai: "plan", tieuDe: "Chưa lập kế hoạch", items: thietBiList });
  }

  const actRows = rows.filter((r) => r.loai === "act");
  if (actRows.length > 0) {
    const byThietBi = new Map<string, string[]>();
    for (const r of actRows) {
      const list = byThietBi.get(r.thiet_bi) ?? [];
      if (r.noi_dung) list.push(r.noi_dung);
      byThietBi.set(r.thiet_bi, list);
    }
    // 1 dòng ngắn / thiết bị (thay vì 1 câu dài nối bằng dấu phẩy).
    const items = Array.from(byThietBi.entries()).map(([thietBi, list]) =>
      list.length ? `${thietBi} — ${list.join("; ")}` : thietBi,
    );
    groups.push({ loai: "act", tieuDe: "Chưa hoàn tất checksheet", items });
  }

  return groups;
}

// Kết quả đề xuất của chính người dùng (RLS de_xuat_congviec_select cho phép
// người đề xuất đọc row của mình). Chỉ lấy đã xử lý gần đây (bound 30 ngày để
// không phình); chuông tự lọc "chưa xem" theo localStorage.
async function getDeXuatOutcomes(supabase: SupabaseClient, msnv: string): Promise<DeXuatOutcome[]> {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("de_xuat_congviec")
    .select(
      `loai_de_xuat, trang_thai, ly_do_tu_choi, updated_at, loai_hoat_dong_moi, ten_chi_tiet_moi,
       nguoi_duyet_nd:nguoidung!nguoi_duyet ( ho_ten ),
       congviec ( loai_hoat_dong, chitiet ( ten_chi_tiet ) )`,
    )
    .eq("nguoi_de_xuat", msnv)
    .in("trang_thai", ["Đã duyệt", "Từ chối"])
    .gte("updated_at", from)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  return ((data ?? []) as unknown as DeXuatRow[]).map((r) => {
    const cv = firstOrNull(r.congviec);
    const ct = firstOrNull(cv?.chitiet ?? null);
    const chiTiet = ct?.ten_chi_tiet ?? r.ten_chi_tiet_moi ?? "";
    const loaiHd = cv?.loai_hoat_dong ?? r.loai_hoat_dong_moi ?? "";
    const loaiLabel = LOAI_DE_XUAT_LABEL[r.loai_de_xuat] ?? r.loai_de_xuat;
    const nhan = [loaiLabel, loaiHd, chiTiet].filter(Boolean).join(" · ");
    let text: string;
    if (r.trang_thai === "Đã duyệt") {
      const ten = firstOrNull(r.nguoi_duyet_nd)?.ho_ten;
      text = `✅ «${nhan}» đã được DUYỆT${ten ? ` bởi ${ten}` : ""}`;
    } else {
      text = `❌ «${nhan}» bị TỪ CHỐI${r.ly_do_tu_choi ? `: ${r.ly_do_tu_choi}` : ""}`;
    }
    return { text, updatedAt: r.updated_at };
  });
}

export async function getNotifications(
  supabase: SupabaseClient,
  msnv: string,
): Promise<NotificationData> {
  if (!msnv) return { groups: [], deXuat: [] };
  const [groups, deXuat] = await Promise.all([
    getPlanActGroups(supabase, msnv),
    // Lỗi phần đề xuất không được chặn nhắc-việc chính -> nuốt lỗi, trả rỗng.
    getDeXuatOutcomes(supabase, msnv).catch(() => [] as DeXuatOutcome[]),
  ]);
  return { groups, deXuat };
}
