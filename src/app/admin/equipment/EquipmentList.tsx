"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { createThietBi, deleteThietBi, type EquipmentActionState } from "@/app/actions/equipment";

export type ThietBiRow = {
  id: string;
  ma_thiet_bi: string;
  ten_thiet_bi: string;
  xuong: string | null;
  kip: string | null;
  nguoi_phu_trach: string | null;
};

const initialState: EquipmentActionState = { error: null };

function CreateThietBiForm() {
  const [state, formAction, isPending] = useActionState(createThietBi, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {open ? "Đóng" : "+ Thêm thiết bị"}
      </button>

      {open ? (
        <form
          action={formAction}
          className="mt-3 grid grid-cols-1 gap-3 rounded-md border bg-white p-4 sm:grid-cols-2 md:grid-cols-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Mã thiết bị</label>
            <input
              name="maThietBi"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tên thiết bị</label>
            <input
              name="tenThietBi"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Cụm</label>
            <input name="cum" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Khu vực</label>
            <input name="khuVuc" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Xưởng</label>
            <input name="xuong" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Kíp</label>
            <input name="kip" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Lãnh đạo</label>
            <input name="lanhDao" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Trưởng ca</label>
            <input name="truongCa" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">MSNV người phụ trách</label>
            <input
              name="nguoiPhuTrach"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {state.error ? (
            <p role="alert" className="col-span-full text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="col-span-full text-sm text-green-600">Tạo thiết bị thành công.</p>
          ) : null}

          <div className="col-span-full">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Đang tạo..." : "Tạo thiết bị"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function EquipmentList({ items }: { items: ThietBiRow[] }) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(item: ThietBiRow) {
    if (
      !confirm(
        `Xoá thiết bị ${item.ma_thiet_bi} - ${item.ten_thiet_bi}?\n\nHành động này XOÁ VĨNH VIỄN toàn bộ Chi tiết và Công việc con của thiết bị, không thể hoàn tác. Nếu chỉ muốn ngừng theo dõi một hạng mục, hãy dùng chức năng "loại bỏ dần" (đặt Active = false) ở trang Chi tiết thiết bị thay vì xoá ở đây.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteThietBi(item.id);
      if (result.error) {
        setDeleteError(result.error);
      }
    });
  }

  return (
    <div>
      <CreateThietBiForm />

      {deleteError ? <p className="mb-3 text-sm text-red-600">{deleteError}</p> : null}

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Xưởng</th>
              <th className="px-3 py-2">Kíp</th>
              <th className="px-3 py-2">Người phụ trách</th>
              <th className="px-3 py-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-3 py-2">{item.ma_thiet_bi}</td>
                <td className="px-3 py-2">{item.ten_thiet_bi}</td>
                <td className="px-3 py-2">{item.xuong ?? ""}</td>
                <td className="px-3 py-2">{item.kip ?? ""}</td>
                <td className="px-3 py-2">{item.nguoi_phu_trach ?? ""}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/equipment/${item.id}`}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Chi tiết
                    </Link>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(item)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Xoá
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  Chưa có thiết bị nào.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
