import { createClient } from "@/lib/supabase/server";
import { getDeXuatCongViecList } from "@/lib/checksheet/deXuatCongViecList";
import { DeXuatCongViecList } from "./de-xuat/DeXuatCongViecList";

// Trang chính /admin = hàng đợi đề xuất chờ duyệt (thay cho menu thẻ cũ) --
// đây là việc Admin cần xử lý nhanh nhất mỗi khi vào trang quản trị. Điều
// hướng tới Người dùng/Thiết bị/Bất thường/Thống kê/Cài đặt vẫn qua
// AdminNav (đã có sẵn trên mọi trang /admin/*, xem admin/layout.tsx).
// Nội dung y hệt /admin/de-xuat/page.tsx (giữ nguyên route đó luôn, không
// xoá -- AdminNav vẫn còn mục "Duyệt đề xuất" trỏ tới, trùng nội dung
// nhưng không hại gì).
export default async function AdminIndexPage({
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
