// Chuông thông báo trên trang checksheet (Pha 6, Task 2). Gọi RPC
// `get_notifications` (0002_functions_triggers.sql) rồi tự gộp các dòng thô
// thành tối đa 2 nhóm hiển thị -- đúng ngữ nghĩa hệ cũ (badge đếm SỐ NHÓM,
// không phải số dòng thô, xem CLAUDE.md phần "AdminCustom"/chuông).
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tên sự kiện `window` dispatch sau khi lưu checksheet (Plan/Actual hoặc bất
 * thường) thành công -- dùng chung giữa ChecksheetApp.tsx (nơi dispatch) và
 * NotificationBell.tsx (nơi lắng nghe) để tránh hardcode chuỗi lặp lại. */
export const CHECKSHEET_SAVED_EVENT = "checksheet:saved";

export type NotificationGroup = {
  loai: "plan" | "act";
  tieuDe: string;
  noiDung: string;
};

type RawNotificationRow = {
  loai: "plan" | "act";
  thiet_bi: string;
  noi_dung: string | null;
};

export async function getNotificationGroups(
  supabase: SupabaseClient,
  msnv: string,
): Promise<NotificationGroup[]> {
  if (!msnv) return [];

  const { data, error } = await supabase.rpc("get_notifications", { p_msnv: msnv });
  if (error) throw error;

  const rows = (data ?? []) as RawNotificationRow[];
  const groups: NotificationGroup[] = [];

  const planRows = rows.filter((r) => r.loai === "plan");
  if (planRows.length > 0) {
    const thietBiList = Array.from(new Set(planRows.map((r) => r.thiet_bi)));
    groups.push({
      loai: "plan",
      tieuDe: "Nhắc nhở lập kế hoạch",
      noiDung: "Vui lòng cập nhật Plan cho: " + thietBiList.join(", "),
    });
  }

  const actRows = rows.filter((r) => r.loai === "act");
  if (actRows.length > 0) {
    const byThietBi = new Map<string, string[]>();
    for (const r of actRows) {
      const list = byThietBi.get(r.thiet_bi) ?? [];
      if (r.noi_dung) list.push(r.noi_dung);
      byThietBi.set(r.thiet_bi, list);
    }
    const noiDung = Array.from(byThietBi.entries())
      .map(([thietBi, noiDungList]) => `${thietBi}: ${noiDungList.join("; ")}`)
      .join("\n");
    groups.push({
      loai: "act",
      tieuDe: "Nhắc nhở hoàn tất checksheet",
      noiDung,
    });
  }

  return groups;
}
