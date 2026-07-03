"use client";

import { cellKey, type CongViecRow, type ThucHienMap } from "@/lib/checksheet/types";
import styles from "./checksheet.module.css";

const EMPTY_CELL = { keHoach: false, ketQua: "N" as const };

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

function planClass(keHoach: boolean): string {
  return keHoach ? styles.bgY : styles.bgN;
}

function actClass(ketQua: "G" | "R" | "N"): string {
  if (ketQua === "G") return styles.bgG;
  if (ketQua === "R") return styles.bgR;
  return styles.bgN;
}

export function ChecksheetTable({
  rows,
  thucHien,
  thangDau,
  thangCuoi,
}: {
  rows: CongViecRow[];
  thucHien: ThucHienMap;
  thangDau: string;
  thangCuoi: string;
}) {
  const rowSpans = calcRowSpans(rows);
  const days = listDaysInRange(thangDau, thangCuoi);

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
                {days.map((d) => {
                  const cell = thucHien[cellKey(row.congViecId, d)] ?? EMPTY_CELL;
                  return (
                    <td key={d} className="border p-0">
                      <div className={styles.dayCell}>
                        <div className={`${styles.triPlan} ${planClass(cell.keHoach)}`} />
                        <div className={`${styles.triAct} ${actClass(cell.ketQua)}`} />
                      </div>
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
