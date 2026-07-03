// Gọi RPC `get_editability` (đã cài ở Pha 1, xem
// supabase/migrations/0002_functions_triggers.sql) -- nguồn chân lý DUY NHẤT
// cho quyền sửa Plan/Actual theo diff tháng + lock-date + device-lock. KHÔNG
// tự suy luận lại quy tắc này ở TypeScript (xem Global Constraints trong
// docs/plans/pha4-checksheet-grid.md). Gọi 1 LẦN cho toàn bộ CONGVIEC đang
// hiển thị trên lưới, không gọi lặp lại theo từng ô/hàng.
import type { SupabaseClient } from "@supabase/supabase-js";

export type EditabilityMap = Record<string, { plan: boolean; act: boolean }>;

type EditabilityRow = {
  congviec_id: string;
  is_plan_editable: boolean;
  is_act_editable: boolean;
};

/**
 * `thangDau` = ngày đầu tháng đang xem ("YYYY-MM-01"), truyền thẳng làm
 * `p_target_month` -- RPC dùng mức tháng (date_trunc bên trong), không phải
 * mức ngày, nên bất kỳ ngày nào trong tháng cũng cho cùng kết quả, nhưng
 * dùng `thangDau` cho nhất quán với cách gọi `getCongViecRows`/`getThucHien`.
 */
export async function getEditability(
  supabase: SupabaseClient,
  congViecIds: string[],
  thangDau: string,
): Promise<EditabilityMap> {
  if (congViecIds.length === 0) return {};

  const { data, error } = await supabase.rpc("get_editability", {
    p_congviec_ids: congViecIds,
    p_target_month: thangDau,
  });

  if (error) throw error;

  const rows = (data ?? []) as EditabilityRow[];
  const map: EditabilityMap = {};
  for (const r of rows) {
    map[r.congviec_id] = { plan: r.is_plan_editable, act: r.is_act_editable };
  }
  return map;
}
