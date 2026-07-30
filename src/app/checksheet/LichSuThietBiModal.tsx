"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { moTaLichSu, nhomCuaLichSu, type LichSuRow, type NhomLichSu } from "@/lib/checksheet/thietBiLichSu";

// #3: xem lịch sử thay đổi của thiết bị ngay trong tab checksheet -- gồm CẢ
// thay đổi cấu hình (thêm/sửa/loại bỏ chi tiết & công việc) LẪN nhật ký chấm
// công (thuc_hien). Component THUẦN HIỂN THỊ: dữ liệu do ChecksheetApp nạp
// (fetch trong onClick, không dùng useEffect -> tránh lint set-state-in-effect
// mà BatThuongModal đang mắc). Portal ra body cho nhất quán.
type Filter = "all" | NhomLichSu;

const NHOM_LABEL: Record<NhomLichSu, string> = {
  cau_hinh: "Cấu hình",
  cham_cong: "Chấm công",
};

const NHOM_BADGE: Record<NhomLichSu, string> = {
  cau_hinh: "bg-indigo-100 text-indigo-700",
  cham_cong: "bg-sky-100 text-sky-700",
};

function formatThoiGian(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function LichSuThietBiModal({
  open,
  tenThietBi,
  rows,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  tenThietBi: string;
  rows: LichSuRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  if (!open) return null;

  const filtered = rows.filter((r) => filter === "all" || nhomCuaLichSu(r.bang) === filter);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-[#dee2e6] bg-white shadow-lg"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#dee2e6] px-4 py-3">
          <h2 className="text-base font-semibold text-gray-800">Lịch sử thay đổi — {tenThietBi}</h2>
          <button
            type="button"
            className="rounded-full border px-3 py-1 text-sm hover:bg-gray-50"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[#dee2e6] px-4 py-2">
          {(["all", "cau_hinh", "cham_cong"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                filter === f ? "bg-[#0d6efd] text-white" : "border border-[#ced4da] hover:bg-gray-50"
              }`}
            >
              {f === "all" ? "Tất cả" : NHOM_LABEL[f]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Đang tải lịch sử…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Chưa có lịch sử phù hợp.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((r, idx) => {
                const nhom = nhomCuaLichSu(r.bang);
                return (
                  <li
                    key={`${r.thoiGian}_${idx}`}
                    className="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${NHOM_BADGE[nhom]}`}>
                        {NHOM_LABEL[nhom]}
                      </span>
                      <span>{formatThoiGian(r.thoiGian)}</span>
                      <span title={r.nguoiMsnv ?? undefined}>{r.nguoiTen ?? r.nguoiMsnv ?? "—"}</span>
                    </div>
                    <p className="mt-1 text-gray-800">{moTaLichSu(r)}</p>
                    {r.lyDo ? <p className="mt-0.5 text-xs text-gray-500">Lý do: {r.lyDo}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
