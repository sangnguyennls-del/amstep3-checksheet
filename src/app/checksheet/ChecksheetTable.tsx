"use client";

import { useEffect, useRef } from "react";
import { cellKey, type CongViecRow, type KetQua, type ThucHienMap } from "@/lib/checksheet/types";
import type { EditabilityMap } from "@/lib/checksheet/editability";
import { Cell, type PaintOp } from "./Cell";

const DENY_EDITABLE = { plan: false, act: false };

/**
 * Rowspan merge: y hệt thuật toán `calcColSpan`/`renderTable` của hệ cũ
 * (mô tả trong .claude/CLAUDE.md "Client-side structure") -- CHỈ merge các
 * hàng LIỀN KỀ (contiguous) cùng bộ giá trị (stt, tenChiTiet, dieuKienCoBan)
 * theo đúng thứ tự lồng đó, không merge các hàng cùng giá trị nhưng cách xa
 * nhau. Trả về mảng cùng độ dài `rows`: giá trị > 0 tại chỉ số i nghĩa là
 * hàng i là hàng "đầu nhóm" và cần render với rowSpan đó; giá trị 0 nghĩa là
 * hàng i thuộc 1 nhóm đã render ở hàng đầu nhóm trước đó (bỏ qua 3 cột merge
 * khi render).
 */
export function calcRowSpans(rows: CongViecRow[]): number[] {
  const spans = new Array(rows.length).fill(0);
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (
      j < rows.length &&
      rows[j].stt === rows[i].stt &&
      rows[j].tenChiTiet === rows[i].tenChiTiet &&
      rows[j].dieuKienCoBan === rows[i].dieuKienCoBan
    ) {
      j++;
    }
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

/** Liệt kê các ngày ISO (YYYY-MM-DD) từ thangDau đến thangCuoi (bao gồm 2 đầu). */
export function listDaysInRange(thangDau: string, thangCuoi: string): string[] {
  const days: string[] = [];
  const start = new Date(`${thangDau}T00:00:00Z`);
  const end = new Date(`${thangCuoi}T00:00:00Z`);
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// 4 cột con của "Tần suất" đúng thứ tự trên mẫu giấy. `tan_suat_chu` là text
// tự do (không có CHECK constraint ở DB, xem 0001_schema.sql) nên phải chuẩn
// hoá (bỏ dấu, lowercase) trước khi so khớp thay vì so chuỗi y nguyên.
const TAN_SUAT_COLUMNS = ["Ngày", "Tuần", "Tháng", "Quý"] as const;

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const TAN_SUAT_KEYS = TAN_SUAT_COLUMNS.map(stripDiacritics);

/**
 * Trả về chỉ số cột con (0-3) khớp với `tanSuatChu`, hoặc null nếu không
 * khớp bất kỳ nhãn nào trong 4 nhãn chuẩn. Dữ liệu không khớp KHÔNG được bỏ
 * qua ở nơi gọi hàm này -- xem `TanSuatCells` bên dưới (rơi vào cột "Tháng"
 * kèm giá trị gốc trong `title` để không mất dữ liệu).
 */
function matchTanSuatCol(tanSuatChu: string | null): number | null {
  if (!tanSuatChu) return null;
  const key = stripDiacritics(tanSuatChu.trim());
  const idx = TAN_SUAT_KEYS.findIndex((k) => key === k || key.startsWith(k));
  return idx === -1 ? null : idx;
}

function TanSuatCells({ row }: { row: CongViecRow }) {
  const matched = matchTanSuatCol(row.tanSuatChu);
  const hasValue = row.tanSuatSo != null && row.tanSuatChu;
  // Không khớp 4 nhãn chuẩn: đặt tạm vào cột "Tháng" (phổ biến nhất) kèm chú
  // giải giá trị gốc qua `title` -- ưu tiên không mất dữ liệu hơn là đoán sai
  // vị trí, xem quyết định trong kế hoạch (Việc B3).
  const fallbackCol = matched ?? 2;
  return (
    <>
      {TAN_SUAT_COLUMNS.map((label, idx) => {
        const showHere = hasValue && (matched !== null ? idx === matched : idx === fallbackCol);
        return (
          <td
            key={label}
            className="border border-gray-200 px-1 py-1 text-center tabular-nums"
            title={showHere && matched === null ? `Đơn vị gốc: "${row.tanSuatChu}"` : undefined}
          >
            {showHere ? row.tanSuatSo : ""}
          </td>
        );
      })}
    </>
  );
}

const COL_WIDTHS = {
  so: 44,
  tenChiTiet: 190,
  dieuKienCoBan: 230,
  tieuChuan: 90,
  nguoiPhuTrach: 130,
  thoiGian: 64,
  auto: 56,
  thaoTac: 96,
  tanSuat: 44,
  ngay: 32,
} as const;

export function ChecksheetTable({
  rows,
  thucHien,
  thangDau,
  thangCuoi,
  editability,
  todayIso,
  nguoiPhuTrachTen,
  canManageCongViec,
  onEditCongViec,
  onRemoveCongViec,
  onSetPlan,
  onSetAct,
  onRequestBatThuong,
  selectedDay,
  onSelectDay,
  onAutoFillPlan,
}: {
  rows: CongViecRow[];
  thucHien: ThucHienMap;
  thangDau: string;
  thangCuoi: string;
  /** Giá trị THẬT lấy từ get_editability (per-CONGVIEC), theo `congViecId`.
   * Nguồn chân lý duy nhất -- không tự suy luận lại ở client. Thiếu key
   * (chưa tải xong, hoặc lỗi) mặc định KHÔNG cho sửa (an toàn hơn). */
  editability: EditabilityMap;
  /** Hôm nay (ISO) -- truyền xuống Cell chỉ để tô gợi ý cửa sổ +-4 ngày. */
  todayIso: string;
  /** Tên người phụ trách thiết bị (1 người/1 thiết bị, xem CLAUDE.md) -- hiện
   * lặp lại ở cột "Người chịu trách nhiệm" mỗi dòng đúng như mẫu giấy, không
   * rowSpan-merge (đây không phải field theo từng CONGVIEC trong DB). */
  nguoiPhuTrachTen: string | null;
  /** Việc C: gợi ý UI cho cột "Thao tác" (Sửa/Loại bỏ) -- CHỈ ẩn/hiện, quyền
   * thật do RPC `can_manage_congviec` quyết định (xem EditCongViecModal.tsx). */
  canManageCongViec: boolean;
  onEditCongViec: (row: CongViecRow) => void;
  onRemoveCongViec: (row: CongViecRow) => void;
  onSetPlan: (congViecId: string, ngay: string, keHoach: boolean) => void;
  onSetAct: (congViecId: string, ngay: string, ketQua: KetQua) => void;
  /** Task 4: mở modal ghi nhận bất thường (xem Cell.tsx). */
  onRequestBatThuong: (congViecId: string, ngay: string) => void;
  /** "Ngày vừa bấm" (mốc bắt đầu cho P4/P8) -- null nếu chưa bấm ô nào. */
  selectedDay: { congViecId: string; ngay: string } | null;
  onSelectDay: (congViecId: string, ngay: string) => void;
  onAutoFillPlan: (congViecId: string, startDay: string, interval: 4 | 8) => void;
}) {
  const rowSpans = calcRowSpans(rows);
  const days = listDaysInRange(thangDau, thangCuoi);
  const [namNam, thangNam] = thangDau.split("-").map(Number);

  // Kéo-tô: isPaintingRef bật khi pointerdown trên 1 ô, tắt khi pointerup ở
  // bất kỳ đâu (kể cả ngoài bảng) hoặc window mất focus -- currentOpRef lưu
  // ĐÚNG thao tác vừa dùng ở ô đầu tiên (Plan=Y/N cụ thể, hay 1 giá trị
  // Actual cụ thể) để áp LẠI Y HỆT giá trị đó cho các ô con trỏ đi qua tiếp
  // theo (không re-toggle theo giá trị hiện tại của từng ô).
  const isPaintingRef = useRef(false);
  const currentOpRef = useRef<PaintOp | null>(null);

  useEffect(() => {
    function stopPainting() {
      isPaintingRef.current = false;
      currentOpRef.current = null;
    }
    window.addEventListener("pointerup", stopPainting);
    window.addEventListener("blur", stopPainting);
    return () => {
      window.removeEventListener("pointerup", stopPainting);
      window.removeEventListener("blur", stopPainting);
    };
  }, []);

  function handlePaintStart(op: PaintOp) {
    isPaintingRef.current = true;
    currentOpRef.current = op;
  }

  function handlePaintEnter(congViecId: string, ngay: string) {
    if (!isPaintingRef.current || !currentOpRef.current) return;
    const rowEditable = editability[congViecId] ?? DENY_EDITABLE;
    const op = currentOpRef.current;
    if (op.kind === "plan") {
      if (!rowEditable.plan) return;
      onSetPlan(congViecId, ngay, op.keHoach);
    } else {
      if (!rowEditable.act) return;
      onSetAct(congViecId, ngay, op.ketQua);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md border bg-white p-4 text-center text-sm text-gray-400">
        Không có hạng mục nào cho thiết bị/tháng đã chọn.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          <col style={{ width: COL_WIDTHS.so }} />
          <col style={{ width: COL_WIDTHS.tenChiTiet }} />
          <col style={{ width: COL_WIDTHS.dieuKienCoBan }} />
          <col style={{ width: COL_WIDTHS.tieuChuan }} />
          <col style={{ width: COL_WIDTHS.nguoiPhuTrach }} />
          <col style={{ width: COL_WIDTHS.thoiGian }} />
          <col style={{ width: COL_WIDTHS.auto }} />
          <col className="no-print" style={{ width: COL_WIDTHS.thaoTac }} />
          {TAN_SUAT_COLUMNS.map((label) => (
            <col key={label} style={{ width: COL_WIDTHS.tanSuat }} />
          ))}
          {days.map((d) => (
            <col key={d} style={{ width: COL_WIDTHS.ngay }} />
          ))}
        </colgroup>
        <thead className="border-b bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="border border-gray-200 px-2 py-1" rowSpan={2}>
              Số
            </th>
            <th className="border border-gray-200 px-2 py-1" rowSpan={2}>
              Tên chi tiết
            </th>
            <th className="border border-gray-200 px-2 py-1" rowSpan={2}>
              Điều kiện cơ bản
            </th>
            <th className="border border-gray-200 px-2 py-1" rowSpan={2}>
              Tiêu chuẩn
            </th>
            <th className="border border-gray-200 px-2 py-1" rowSpan={2}>
              Người chịu trách nhiệm
            </th>
            <th className="border border-gray-200 px-2 py-1" rowSpan={2}>
              Thời gian
            </th>
            <th
              className="border border-gray-200 px-1 py-1 text-center"
              rowSpan={2}
              title="Tự động tô Plan mỗi 4/8 ngày"
            >
              Auto
            </th>
            <th className="no-print border border-gray-200 px-1 py-1 text-center" rowSpan={2}>
              Thao tác
            </th>
            <th className="border border-gray-200 px-1 py-1 text-center" colSpan={TAN_SUAT_COLUMNS.length}>
              Tần suất
            </th>
            <th className="border border-gray-200 px-1 py-1 text-center" colSpan={days.length}>
              Tháng {thangNam} / Năm {namNam}
            </th>
          </tr>
          <tr>
            {TAN_SUAT_COLUMNS.map((label) => (
              <th key={label} className="border border-gray-200 px-1 py-1 text-center">
                {label}
              </th>
            ))}
            {days.map((d) => (
              <th key={d} className="border border-gray-200 px-1 py-1 text-center">
                {Number(d.slice(8, 10))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const span = rowSpans[idx];
            const isGroupStart = span > 0;
            return (
              <tr key={row.congViecId} className="border-b last:border-0">
                {isGroupStart ? (
                  <>
                    <td className="border border-gray-200 px-2 py-1 text-center align-top" rowSpan={span}>
                      {row.stt ?? ""}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 align-top" rowSpan={span}>
                      {row.tenChiTiet}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 align-top" rowSpan={span}>
                      {row.dieuKienCoBan ?? ""}
                    </td>
                  </>
                ) : null}
                <td className="border border-gray-200 px-2 py-1">{row.loaiHoatDong}</td>
                <td className="border border-gray-200 px-2 py-1">{nguoiPhuTrachTen ?? ""}</td>
                <td className="border border-gray-200 px-2 py-1 text-center tabular-nums">
                  {row.thoiGian ?? ""}
                </td>
                <td className="border border-gray-200 px-1 py-1 text-center">
                  {/* P4/P8: tô Plan mỗi 4/8 ngày bắt đầu từ "ngày vừa bấm" trong
                      chính hàng này (selectedDay) -- bấm 1 ô ngày trước, rồi bấm
                      P4/P8. Disable nếu chưa chọn ngày nào trong hàng. */}
                  <div className="flex justify-center gap-1">
                    <button
                      type="button"
                      className="rounded border px-1 text-[10px] leading-4 hover:bg-gray-100 disabled:opacity-40"
                      disabled={selectedDay?.congViecId !== row.congViecId}
                      title="Tô Plan mỗi 4 ngày từ ngày đã chọn"
                      onClick={() =>
                        selectedDay?.congViecId === row.congViecId &&
                        onAutoFillPlan(row.congViecId, selectedDay.ngay, 4)
                      }
                    >
                      P4
                    </button>
                    <button
                      type="button"
                      className="rounded border px-1 text-[10px] leading-4 hover:bg-gray-100 disabled:opacity-40"
                      disabled={selectedDay?.congViecId !== row.congViecId}
                      title="Tô Plan mỗi 8 ngày từ ngày đã chọn"
                      onClick={() =>
                        selectedDay?.congViecId === row.congViecId &&
                        onAutoFillPlan(row.congViecId, selectedDay.ngay, 8)
                      }
                    >
                      P8
                    </button>
                  </div>
                </td>
                <td className="no-print border border-gray-200 px-1 py-1 text-center">
                  {canManageCongViec ? (
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        className="rounded border px-1.5 text-[10px] leading-4 hover:bg-gray-100"
                        title="Sửa thời gian/tần suất"
                        onClick={() => onEditCongViec(row)}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-300 px-1.5 text-[10px] leading-4 text-red-600 hover:bg-red-50"
                        title="Loại bỏ công việc này (giữ lịch sử)"
                        onClick={() => onRemoveCongViec(row)}
                      >
                        Xoá
                      </button>
                    </div>
                  ) : null}
                </td>
                <TanSuatCells row={row} />
                {days.map((d) => {
                  const cell = thucHien[cellKey(row.congViecId, d)];
                  const rowEditable = editability[row.congViecId] ?? DENY_EDITABLE;
                  return (
                    <td key={d} className="border border-gray-200 p-0">
                      <Cell
                        congViecId={row.congViecId}
                        ngay={d}
                        cell={cell}
                        editable={rowEditable}
                        todayIso={todayIso}
                        onSetPlan={onSetPlan}
                        onSetAct={onSetAct}
                        onRequestBatThuong={onRequestBatThuong}
                        onPaintStart={handlePaintStart}
                        onPaintEnter={() => handlePaintEnter(row.congViecId, d)}
                        onSelectDay={onSelectDay}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
