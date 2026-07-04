import { createClient } from "@/lib/supabase/server";
import { getPlanStats } from "@/lib/checksheet/planStats";
import { vnTodayIso } from "@/lib/checksheet/vnDate";
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
  //
  // Dùng `vnTodayIso()` (giờ VN, Asia/Ho_Chi_Minh) thay vì `new Date()` server
  // local time -- server chạy UTC (Vercel/Cloudflare) sẽ tính sai tháng mặc
  // định trong ~7 giờ đầu ngày 1 hàng tháng theo giờ VN (UTC+7), y hệt lỗi
  // `vnTodayIso()` đã ghi rõ mình sinh ra để tránh (xem docstring hàm đó).
  const defaultThang = vnTodayIso().slice(0, 7);
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
