import { createClient } from "@/lib/supabase/server";
import { getDeXuatCongViecList } from "@/lib/checksheet/deXuatCongViecList";
import { DeXuatCongViecList } from "./DeXuatCongViecList";

// Next.js 16: `searchParams` là 1 Promise, phải await (xem
// src/app/admin/bat-thuong/page.tsx làm mẫu).
export default async function AdminDeXuatPage({
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
  // RLS de_xuat_congviec_select tự giới hạn kết quả theo người gọi (chính
  // người đề xuất, hoặc Admin có quyền duyệt đúng Nhóm/AdminM) -- không cần
  // lọc gì thêm ở đây ngoài trangThai.
  const items = await getDeXuatCongViecList(supabase, trangThaiFilter);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold tracking-tight text-gray-900">
        Duyệt đề xuất sửa/xoá công việc
      </h1>
      <DeXuatCongViecList initialItems={items} />
    </div>
  );
}
