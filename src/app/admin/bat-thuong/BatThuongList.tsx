"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BatThuongListItem } from "@/lib/checksheet/batThuongList";
import {
  updateBatThuongStatus,
  updateBatThuongInitialState,
} from "@/app/actions/batThuong";

const TRANG_THAI_LIST = ["Mở", "Đang xử lý", "Đã đóng"] as const;

const TRANG_THAI_BADGE: Record<(typeof TRANG_THAI_LIST)[number], string> = {
  Mở: "bg-red-100 text-red-700",
  "Đang xử lý": "bg-yellow-100 text-yellow-700",
  "Đã đóng": "bg-gray-200 text-gray-600",
};

// Định dạng "YYYY-MM-DD" -> "DD/MM/YYYY" bằng substring, không dùng Date() để
// tránh lệch múi giờ -- cùng kỹ thuật đã dùng ở BatThuongModal.tsx (Pha 4).
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

// Mặc định chọn tất cả trạng thái TRỪ "Đã đóng" -- đa số công việc quản lý
// tập trung vào cái chưa đóng (xem brief Task 1).
const DEFAULT_SELECTED = new Set<string>(["Mở", "Đang xử lý"]);

// 1 form độc lập mỗi dòng (useActionState riêng) -- để lỗi ở dòng này không
// chặn submit dòng khác, đúng pattern UsersTable.tsx/EquipmentList.tsx.
function RowStatusForm({ item }: { item: BatThuongListItem }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateBatThuongStatus,
    updateBatThuongInitialState,
  );
  const [trangThai, setTrangThai] = useState<(typeof TRANG_THAI_LIST)[number]>(item.trangThai);
  const [ngayKhacPhuc, setNgayKhacPhuc] = useState(item.ngayKhacPhuc ?? "");

  // revalidatePath trong Server Action đã đủ cho lần load sau, nhưng
  // router.refresh() ở đây giúp bảng cập nhật ngay mà không cần code thêm
  // state cục bộ (đơn giản hơn, dữ liệu bảng này nhỏ nên chấp nhận được --
  // xem brief Task 2).
  //
  // Dùng `state` (identity của object) làm dependency thay vì `state.success`
  // (boolean) -- useActionState trả về 1 object MỚI mỗi lần action chạy
  // xong, kể cả khi `success` vẫn là `true` ở 2 lần submit liên tiếp thành
  // công của CÙNG 1 dòng. Nếu dùng `state.success` làm dependency,
  // Object.is(true, true) không đổi nên effect không chạy lại từ lần lưu
  // thành công thứ 2 trở đi -- bảng sẽ không tự refresh nữa dù DB đã ghi
  // đúng (bug tìm thấy ở review Task 2).
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={item.id} />
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          name="trangThai"
          value={trangThai}
          onChange={(e) => setTrangThai(e.target.value as (typeof TRANG_THAI_LIST)[number])}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs"
        >
          {TRANG_THAI_LIST.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="ngayKhacPhuc"
          value={ngayKhacPhuc}
          onChange={(e) => setNgayKhacPhuc(e.target.value)}
          disabled={trangThai !== "Đã đóng"}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-green-600">Đã lưu.</p> : null}
    </form>
  );
}

export function BatThuongList({ initialItems }: { initialItems: BatThuongListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(DEFAULT_SELECTED);

  function toggle(trangThai: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(trangThai)) {
        next.delete(trangThai);
      } else {
        next.add(trangThai);
      }
      return next;
    });
  }

  function showAll() {
    setSelected(new Set(TRANG_THAI_LIST));
  }

  const filtered = useMemo(
    () => initialItems.filter((item) => selected.has(item.trangThai)),
    [initialItems, selected],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TRANG_THAI_LIST.map((trangThai) => (
          <label
            key={trangThai}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(trangThai)}
              onChange={() => toggle(trangThai)}
            />
            {trangThai}
          </label>
        ))}
        <button
          type="button"
          onClick={showAll}
          className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-gray-50"
        >
          Hiện tất cả
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Thiết bị</th>
              <th className="px-3 py-2">Nội dung</th>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Mô tả bất thường</th>
              <th className="px-3 py-2">Ngày phát hiện</th>
              <th className="px-3 py-2">Ngày khắc phục</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Người ghi</th>
              <th className="px-3 py-2">Ảnh</th>
              <th className="px-3 py-2">Đổi trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.ngay)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {item.maThietBi} — {item.tenThietBi}
                </td>
                <td className="px-3 py-2">{item.tenChiTiet}</td>
                <td className="px-3 py-2 whitespace-nowrap">{item.loaiHoatDong}</td>
                <td className="px-3 py-2">{item.moTa}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.ngayPhatHien)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.ngayKhacPhuc)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRANG_THAI_BADGE[item.trangThai]}`}
                  >
                    {item.trangThai}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{item.nguoiGhi ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {item.anhUrl ? (
                    <a
                      href={item.anhUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Xem ảnh
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <RowStatusForm item={item} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                  Không có bất thường nào phù hợp bộ lọc.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
