"use client";

// Popup nhắc việc chưa thực hiện, bật khi NGƯỜI PHỤ TRÁCH load thiết bị của
// mình và còn việc đã tới hạn nhưng chưa tô xanh (xem getViecChuaLam ở
// lib/checksheet/nhacViec.ts cho quy tắc 0..4 ngày trễ).

import { tongThoiGian, type ViecChuaLam } from "@/lib/checksheet/nhacViec";

/** "2026-07-09" -> "09/07/2026" */
function ngayVn(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function NhacViecModal({
  open,
  viec,
  onClose,
}: {
  open: boolean;
  viec: ViecChuaLam[];
  onClose: () => void;
}) {
  if (!open || viec.length === 0) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {/* max-h + flex-col: danh sách dài thì CUỘN phần bảng, giữ tiêu đề và nút
          đóng luôn nhìn thấy (quan trọng trên điện thoại). */}
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 bg-amber-400 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            ⚠ Nhắc nhở công việc chưa thực hiện
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="rounded p-1 text-xl leading-none text-gray-900 hover:bg-amber-500"
          >
            ×
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b bg-gray-50 px-4 py-2.5">
          <span className="text-sm text-gray-600">Tổng thời gian dự kiến:</span>
          <span className="text-lg font-semibold text-red-600">{tongThoiGian(viec)} phút</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white text-left text-gray-600 shadow-sm">
              <tr>
                <th className="border-b px-3 py-2 font-medium">STT</th>
                <th className="border-b px-3 py-2 font-medium">Nội dung công việc</th>
                <th className="border-b px-3 py-2 font-medium">Tiêu chuẩn</th>
                <th className="border-b px-3 py-2 font-medium">Ngày Plan</th>
                <th className="border-b px-3 py-2 text-right font-medium">T.Gian (phút)</th>
              </tr>
            </thead>
            <tbody>
              {viec.map((v) => (
                <tr key={`${v.congViecId}_${v.ngay}`} className="hover:bg-gray-50">
                  <td className="border-b px-3 py-2 text-gray-500 tabular-nums">{v.stt ?? ""}</td>
                  <td className="border-b px-3 py-2 text-gray-900">{v.tenChiTiet}</td>
                  <td className="border-b px-3 py-2 text-gray-500">{v.loaiHoatDong}</td>
                  <td className="border-b px-3 py-2 font-medium text-blue-700 tabular-nums">
                    {ngayVn(v.ngay)}
                  </td>
                  <td className="border-b px-3 py-2 text-right font-medium text-red-600 tabular-nums">
                    {v.thoiGian ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t p-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-md bg-gray-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
          >
            ĐÃ HIỂU VÀ ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
}
