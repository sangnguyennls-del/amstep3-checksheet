import { createClient } from "@/lib/supabase/server";
import { getPlanStats } from "@/lib/checksheet/planStats";
import { StatsTable } from "./StatsTable";

// Next.js 16: `searchParams` là 1 Promise, phải await (xem
// src/app/admin/equipment/[id]/page.tsx làm mẫu await params đúng convention).
export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string }>;
}) {
  const params = await searchParams;

  // Mặc định tháng hiện tại nếu không có `?thang=`. `thang` ở dạng
  // "YYYY-MM" (giá trị chuẩn của <input type="month">), RPC cần
  // "YYYY-MM-01" (ngày bất kỳ trong tháng).
  const now = new Date();
  const defaultThang = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thang = params.thang ?? defaultThang;
  const targetMonth = `${thang}-01`;

  const supabase = await createClient();
  const rows = await getPlanStats(supabase, targetMonth);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Thống kê hoàn thành Plan</h1>
      <StatsTable initialRows={rows} initialMonth={thang} />
    </div>
  );
}
