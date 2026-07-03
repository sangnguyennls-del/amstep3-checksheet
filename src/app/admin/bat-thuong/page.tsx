import { createClient } from "@/lib/supabase/server";
import { getBatThuongList } from "@/lib/checksheet/batThuongList";
import { BatThuongList } from "./BatThuongList";

// Next.js 16: `searchParams` là 1 Promise, phải await (xem
// src/app/admin/equipment/[id]/page.tsx làm mẫu await params đúng convention).
export default async function AdminBatThuongPage({
  searchParams,
}: {
  searchParams: Promise<{ trangThai?: string | string[] }>;
}) {
  const params = await searchParams;
  const trangThaiParam = params.trangThai;
  const trangThaiFilter = trangThaiParam
    ? Array.isArray(trangThaiParam)
      ? trangThaiParam
      : [trangThaiParam]
    : undefined;

  const supabase = await createClient();
  const items = await getBatThuongList(supabase, trangThaiFilter);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Quản lý bất thường</h1>
      <BatThuongList initialItems={items} />
    </div>
  );
}
