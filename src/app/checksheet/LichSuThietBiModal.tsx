"use client";

// Đợt 5 #4: lịch sử thay đổi thiết bị -- 2 tab dễ đọc:
//  * CẤU HÌNH (dạng thẻ): loại + trạng thái + chi tiết/công việc + nội dung
//    thay đổi (cũ→mới) + thời gian thay đổi + thời gian áp dụng + người đề
//    xuất + người duyệt + lý do.
//  * CHẤM CÔNG: danh sách gọn, kèm tên chi tiết/công việc.
// Component THUẦN HIỂN THỊ: dữ liệu do ChecksheetApp nạp (fetch trong onClick).
// Portal ra body. Phân trang mỗi tab (dữ liệu có thể dài).
import { useState } from "react";
import { createPortal } from "react-dom";
import { Pagination } from "@/components/Pagination";
import {
  LOAI_DE_XUAT_LABEL,
  moTaChamCong,
  moTaThayDoiCauHinh,
  type CauHinhRow,
  type ChamCongRow,
  type LoaiDeXuat,
  type TrangThaiDeXuat,
} from "@/lib/checksheet/thietBiLichSu";

type Tab = "cau_hinh" | "cham_cong";

const PAGE_SIZE = 15;

const LOAI_BADGE: Record<LoaiDeXuat, string> = {
  sua: "bg-amber-100 text-amber-700",
  loai_bo: "bg-red-100 text-red-700",
  them: "bg-emerald-100 text-emerald-700",
  khoi_phuc: "bg-sky-100 text-sky-700",
};

const TRANG_THAI_BADGE: Record<TrangThaiDeXuat, string> = {
  "Chờ duyệt": "bg-yellow-100 text-yellow-700",
  "Đã duyệt": "bg-emerald-100 text-emerald-700",
  "Từ chối": "bg-gray-200 text-gray-600",
};

function formatThoiGian(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" bằng substring (tránh lệch múi giờ).
function formatNgay(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function CauHinhCard({ row }: { row: CauHinhRow }) {
  return (
    <li className="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LOAI_BADGE[row.loaiDeXuat]}`}>
          {LOAI_DE_XUAT_LABEL[row.loaiDeXuat]}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRANG_THAI_BADGE[row.trangThai]}`}>
          {row.trangThai}
        </span>
        <span className="font-medium text-gray-800">
          {row.loaiHoatDong ? `${row.loaiHoatDong} · ` : ""}
          {row.tenChiTiet || "—"}
        </span>
      </div>

      <p className="mt-1.5 text-gray-800">{moTaThayDoiCauHinh(row)}</p>

      <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-gray-500 sm:grid-cols-2">
        <div>
          <span className="text-gray-400">Thời gian: </span>
          {formatThoiGian(row.updatedAt || row.createdAt)}
        </div>
        <div>
          <span className="text-gray-400">Áp dụng từ: </span>
          {formatNgay(row.apDungTu)}
        </div>
        <div>
          <span className="text-gray-400">Người đề xuất: </span>
          <span title={row.nguoiDeXuat ?? undefined}>{row.nguoiDeXuatTen ?? row.nguoiDeXuat ?? "—"}</span>
        </div>
        <div>
          <span className="text-gray-400">Người duyệt: </span>
          <span title={row.nguoiDuyet ?? undefined}>{row.nguoiDuyetTen ?? row.nguoiDuyet ?? "—"}</span>
        </div>
      </dl>

      {row.lyDo ? <p className="mt-1 text-xs text-gray-500">Lý do: {row.lyDo}</p> : null}
      {row.lyDoTuChoi ? (
        <p className="mt-0.5 text-xs text-red-600">Lý do từ chối: {row.lyDoTuChoi}</p>
      ) : null}
    </li>
  );
}

function ChamCongCard({ row }: { row: ChamCongRow }) {
  return (
    <li className="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
          {row.loaiHoatDong ? `${row.loaiHoatDong} · ` : ""}
          {row.tenChiTiet || "—"}
        </span>
        <span>{formatThoiGian(row.thoiGian)}</span>
        <span title={row.nguoiMsnv ?? undefined}>{row.nguoiTen ?? row.nguoiMsnv ?? "—"}</span>
      </div>
      <p className="mt-1 text-gray-800">{moTaChamCong(row)}</p>
    </li>
  );
}

export function LichSuThietBiModal({
  open,
  tenThietBi,
  cauHinhRows,
  chamCongRows,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  tenThietBi: string;
  cauHinhRows: CauHinhRow[];
  chamCongRows: ChamCongRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("cau_hinh");
  const [page, setPage] = useState(1);

  if (!open) return null;

  // Cắt lát theo trang bằng các mốc số (tránh union-array phá generic của
  // paginate); mỗi tab render đúng kiểu thẻ riêng.
  const total = tab === "cau_hinh" ? cauHinhRows.length : chamCongRows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * PAGE_SIZE;

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
  }

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

        <div className="flex gap-2 border-b border-[#dee2e6] px-4 py-2">
          {([
            ["cau_hinh", `Cấu hình (${cauHinhRows.length})`],
            ["cham_cong", `Chấm công (${chamCongRows.length})`],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => switchTab(f)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                tab === f ? "bg-[#0d6efd] text-white" : "border border-[#ced4da] hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Đang tải lịch sử…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : total === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Chưa có lịch sử.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {tab === "cau_hinh"
                  ? cauHinhRows
                      .slice(start, start + PAGE_SIZE)
                      .map((r) => <CauHinhCard key={r.id} row={r} />)
                  : chamCongRows
                      .slice(start, start + PAGE_SIZE)
                      .map((r, i) => <ChamCongCard key={`${r.thoiGian}_${i}`} row={r} />)}
              </ul>
              <Pagination page={safePage} pageCount={pageCount} total={total} onPage={setPage} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
