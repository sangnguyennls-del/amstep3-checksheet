"use client";

import { useEffect, useRef } from "react";
import { cellKey, type CongViecRow, type KetQua, type ThucHienMap } from "@/lib/checksheet/types";
import { Cell, type PaintOp } from "./Cell";

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

export function ChecksheetTable({
  rows,
  thucHien,
  thangDau,
  thangCuoi,
  editable,
  onSetPlan,
  onSetAct,
  selectedDay,
  onSelectDay,
  onAutoFillPlan,
}: {
  rows: CongViecRow[];
  thucHien: ThucHienMap;
  thangDau: string;
  thangCuoi: string;
  /** Task 2: hardcode {plan:true, act:true} từ ChecksheetApp. Task 3 sẽ thay
   * bằng giá trị thật lấy từ get_editability (per-CONGVIEC), không đổi API
   * của Cell -- xem docs/plans/pha4-checksheet-grid.md Task 2/3. */
  editable: { plan: boolean; act: boolean };
  onSetPlan: (congViecId: string, ngay: string, keHoach: boolean) => void;
  onSetAct: (congViecId: string, ngay: string, ketQua: KetQua) => void;
  /** "Ngày vừa bấm" (mốc bắt đầu cho P4/P8) -- null nếu chưa bấm ô nào. */
  selectedDay: { congViecId: string; ngay: string } | null;
  onSelectDay: (congViecId: string, ngay: string) => void;
  onAutoFillPlan: (congViecId: string, startDay: string, interval: 4 | 8) => void;
}) {
  const rowSpans = calcRowSpans(rows);
  const days = listDaysInRange(thangDau, thangCuoi);

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
    const op = currentOpRef.current;
    if (op.kind === "plan") {
      if (!editable.plan) return;
      onSetPlan(congViecId, ngay, op.keHoach);
    } else {
      if (!editable.act) return;
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
      <table className="min-w-full border-collapse text-xs">
        <thead className="border-b bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="border px-2 py-1">STT</th>
            <th className="border px-2 py-1">Nội dung</th>
            <th className="border px-2 py-1">Tiêu chuẩn</th>
            <th className="border px-2 py-1">Loại</th>
            <th className="border px-2 py-1">Thời gian</th>
            <th className="border px-1 py-1 text-center" title="Tự động tô Plan mỗi 4/8 ngày">
              Auto
            </th>
            {days.map((d) => (
              <th key={d} className="border px-1 py-1 text-center">
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
                    <td className="border px-2 py-1 text-center align-top" rowSpan={span}>
                      {row.stt ?? ""}
                    </td>
                    <td className="border px-2 py-1 align-top" rowSpan={span}>
                      {row.tenChiTiet}
                    </td>
                    <td className="border px-2 py-1 align-top" rowSpan={span}>
                      {row.dieuKienCoBan ?? ""}
                    </td>
                  </>
                ) : null}
                <td className="border px-2 py-1">{row.loaiHoatDong}</td>
                <td className="border px-2 py-1 text-center">{row.thoiGian ?? ""}</td>
                <td className="border px-1 py-1 text-center">
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
                {days.map((d) => {
                  const cell = thucHien[cellKey(row.congViecId, d)];
                  return (
                    <td key={d} className="border p-0">
                      <Cell
                        congViecId={row.congViecId}
                        ngay={d}
                        cell={cell}
                        editable={editable}
                        onSetPlan={onSetPlan}
                        onSetAct={onSetAct}
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
