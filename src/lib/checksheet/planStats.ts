// Hàm truy vấn thống kê hoàn thành Plan cho trang quản trị (Pha 6, Task 1).
// Đọc-only: gọi thẳng RPC `get_plan_stats` (đã định nghĩa sẵn ở
// supabase/migrations/0002_functions_triggers.sql:487) -- không tính lại
// `status` ở đây, dùng thẳng giá trị SQL trả về ('Đã cập nhật' /
// 'Chưa cập nhật') để tránh lệch logic giữa 2 tầng.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanStatsRow = {
  thietBiId: string;
  xuong: string | null;
  kip: string | null;
  nguoiPhuTrach: string | null;
  tenThietBi: string;
  totalTasks: number;
  plannedTasks: number;
  status: "Đã cập nhật" | "Chưa cập nhật";
};

type PlanStatsRpcRow = {
  thietbi_id: string;
  xuong: string | null;
  kip: string | null;
  nguoi_phu_trach: string | null;
  ten_thiet_bi: string;
  total_tasks: number;
  planned_tasks: number;
  status: "Đã cập nhật" | "Chưa cập nhật";
};

/**
 * `targetMonth`: "YYYY-MM-01" (ngày bất kỳ trong tháng cần xem -- RPC chỉ
 * dùng date_trunc('month', ...) nên ngày trong tháng không quan trọng).
 */
export async function getPlanStats(
  supabase: SupabaseClient,
  targetMonth: string,
): Promise<PlanStatsRow[]> {
  const { data, error } = await supabase.rpc("get_plan_stats", {
    p_target_month: targetMonth,
  });
  if (error) throw error;

  const rows = (data ?? []) as PlanStatsRpcRow[];

  return rows.map((r) => ({
    thietBiId: r.thietbi_id,
    xuong: r.xuong ?? null,
    kip: r.kip ?? null,
    nguoiPhuTrach: r.nguoi_phu_trach ?? null,
    tenThietBi: r.ten_thiet_bi,
    totalTasks: Number(r.total_tasks),
    plannedTasks: Number(r.planned_tasks),
    status: r.status,
  }));
}
