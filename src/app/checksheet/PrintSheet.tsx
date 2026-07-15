"use client";

// Mục 8: bố cục BẢN IN A3 ngang dùng chung cho nút "In" của /checksheet và
// in hàng loạt /admin/stats (trước đây batch in không có khối đầu trang --
// nay 2 đường in ra cùng 1 mẫu, khớp mẫu giấy gốc).
//
// Phần tử gốc mang class `print-sheet` (print.css): trên MÀN HÌNH nó nằm
// off-screen (position absolute, left -20000px) với bề rộng đúng vùng in A3
// -- vẫn được render thật để printFit.ts đo scrollHeight rồi đặt zoom cho
// vừa 1 trang; khi IN nó trở về position static và là phần duy nhất hiện ra.

import { AppLogo } from "@/components/AppLogo";
import type { CongViecRow, FilterOptions, ThucHienMap } from "@/lib/checksheet/types";
import { ChecksheetTable } from "./ChecksheetTable";
import { LanCapNhatCuoi } from "./LanCapNhatCuoi";
import { toDriveImageSrc } from "./EquipmentImageModal";
import checksheetStyles from "./checksheet.module.css";

const EMPTY_PENDING = new Set<string>();
const noop = () => {};

export type PrintThietBi = FilterOptions["thietBi"][number];

export function PrintSheet({
  thietBi,
  rows,
  thucHien,
  thangDau,
  thangCuoi,
  todayIso,
}: {
  thietBi: PrintThietBi;
  rows: CongViecRow[];
  thucHien: ThucHienMap;
  thangDau: string;
  thangCuoi: string;
  todayIso: string;
}) {
  const anhUrl = thietBi.anhUrl?.trim() ?? "";
  return (
    <div className="print-sheet" aria-hidden="true">
      <div className="flex items-stretch gap-2">
        {anhUrl !== "" ? (
          // Mục 8: ảnh nằm trong khung có viền + padding riêng (trước đây
          // <img> tự mang viền và căng hết chiều cao nên ảnh đè lên vạch kẻ
          // của bảng bên cạnh), thu nhỏ w-64 -> w-44.
          <div className="flex w-44 shrink-0 items-center justify-center border border-gray-400 bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Google Drive bên ngoài, chỉ dùng khi in */}
            <img
              src={toDriveImageSrc(anhUrl)}
              alt={`Sơ đồ thiết bị ${thietBi.tenThietBi}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <table className="border-collapse border border-gray-400 text-center text-[10px]">
            <tbody>
              <tr>
                <th rowSpan={2} className="border border-gray-400 px-2 py-1 align-top">
                  <div className="flex items-center gap-1.5">
                    <AppLogo heightPx={20} />
                    <div className="text-left">
                      <p className="font-semibold">CHECKSHEET BƯỚC 3</p>
                      <p className="font-normal">
                        Ngày lập: {todayIso.split("-").reverse().join("/")}
                      </p>
                    </div>
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="border border-gray-400 px-2 py-1 text-left align-top font-normal"
                >
                  <p>Nhóm nhỏ: {thietBi.nhom ?? ""}</p>
                  <p>Cụm: {thietBi.cum ?? ""}</p>
                </th>
                <th className="border border-gray-400 px-2 py-1">Phòng/xưởng</th>
                <th className="border border-gray-400 px-2 py-1">Khu vực</th>
                <th className="border border-gray-400 px-2 py-1">Tên thiết bị</th>
                <th className="border border-gray-400 px-2 py-1">Lãnh đạo xưởng</th>
                <th className="border border-gray-400 px-2 py-1">Trưởng ca</th>
                {/* Mục 10: người chịu trách nhiệm nằm ở hàng header (cùng
                    hàng Khu vực/Trưởng ca), không còn là cột trong bảng lưới. */}
                <th className="border border-gray-400 px-2 py-1">Người chịu trách nhiệm</th>
                <th className="border border-gray-400 px-2 py-1">Kế hoạch / Thực tế</th>
              </tr>
              <tr>
                <td className="border border-gray-400 px-2 py-1 font-semibold">
                  {thietBi.xuong ?? ""}
                </td>
                <td className="border border-gray-400 px-2 py-1 font-semibold">
                  {thietBi.khuVuc ?? ""}
                </td>
                <td className="border border-gray-400 px-2 py-1 font-semibold">
                  {thietBi.tenThietBi}
                </td>
                <td className="border border-gray-400 px-2 py-1 font-semibold">
                  {thietBi.lanhDao ?? ""}
                </td>
                <td className="border border-gray-400 px-2 py-1 font-semibold">
                  {thietBi.truongCa ?? ""}
                </td>
                <td className="border border-gray-400 px-2 py-1 font-semibold">
                  {thietBi.nguoiPhuTrachTen ?? ""}
                </td>
                <td className="border border-gray-400 px-1 py-1">
                  <div className="flex items-center justify-center gap-1">
                    <span className={`inline-block h-2.5 w-2.5 ${checksheetStyles.bgY}`} />
                    <span className={`inline-block h-2.5 w-2.5 ${checksheetStyles.bgG}`} />
                    <span className={`inline-block h-2.5 w-2.5 ${checksheetStyles.bgR}`} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <ChecksheetTable
            printMode
            rows={rows}
            thucHien={thucHien}
            thangDau={thangDau}
            thangCuoi={thangCuoi}
            editability={{}}
            todayIso={todayIso}
            canManageCongViec={false}
            pendingCongViecIds={EMPTY_PENDING}
            onEditCongViec={noop}
            onRemoveCongViec={noop}
            onSetPlan={noop}
            onSetAct={noop}
            onRequestBatThuong={noop}
            selectedDay={null}
            onSelectDay={noop}
            onAutoFillPlan={noop}
          />
          <LanCapNhatCuoi thucHien={thucHien} />
        </div>
      </div>
    </div>
  );
}
