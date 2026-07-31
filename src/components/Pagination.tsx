"use client";

// Phân trang client-side dùng chung cho các bảng dài (thiết bị, người dùng,
// thống kê, bất thường, lịch sử). Dữ liệu đã tải sẵn ở client -> chỉ cắt lát,
// không thêm truy vấn. Thuần hiển thị: state `page` do component cha giữ.
// ponytail: slice client-side; chuyển phân trang server nếu 1 bảng vượt vài
// nghìn dòng (hiện chỉ vài trăm).
import { ui } from "@/lib/ui";

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
      <span>
        Trang {page}/{pageCount} — {total} mục
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={`${ui.buttonSecondary} px-3! py-1.5! disabled:cursor-not-allowed disabled:opacity-50`}
        >
          ‹ Trước
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className={`${ui.buttonSecondary} px-3! py-1.5! disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Sau ›
        </button>
      </div>
    </div>
  );
}

/**
 * Cắt `items` theo trang. Trả về trang đã kẹp trong [1, pageCount] để tránh
 * "trang trống" khi bộ lọc thu nhỏ danh sách (component cha vẫn nên reset page
 * về 1 khi filter đổi, nhưng đây là lưới an toàn cuối cùng).
 */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    pageCount,
    safePage,
    pageItems: items.slice(start, start + pageSize),
  };
}
