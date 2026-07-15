"use client";

import { useEffect, useRef } from "react";
import { cellKey, type CongViecRow, type KetQua, type ThucHienMap } from "@/lib/checksheet/types";
import type { EditabilityMap } from "@/lib/checksheet/editability";
import { stripDiacritics } from "@/lib/filters";
import { Cell, type PaintMode, type PaintOp } from "./Cell";

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
// hoá (bỏ dấu, lowercase -- stripDiacritics ở lib/filters) trước khi so khớp
// thay vì so chuỗi y nguyên.
const TAN_SUAT_COLUMNS = ["Ngày", "Tuần", "Tháng", "Quý"] as const;

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
            className="border border-[#dee2e6] px-1 py-1 text-center tabular-nums"
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
  thoiGian: 64,
  auto: 56,
  thaoTac: 96,
  // 52 (không phải 44): nhãn "THÁNG" ở thead CHỮ HOA đậm cần 48px, cột 44px cũ
  // làm chữ tràn sang cột "QUÝ" bên cạnh (đo thật sau khi đổi phong cách).
  tanSuat: 52,
  ngay: 32,
} as const;

// Mục 8: bộ bề rộng gọn hơn cho BẢN IN (A3 ngang, chữ 9px, không có cột
// Auto/Thao tác) -- với table-layout:fixed + width:100% các giá trị này đóng
// vai trò TỶ LỆ chia cột, tổng tuyệt đối không quan trọng bằng tương quan.
const PRINT_COL_WIDTHS = {
  so: 26,
  tenChiTiet: 140,
  dieuKienCoBan: 180,
  tieuChuan: 64,
  thoiGian: 36,
  auto: 0,
  thaoTac: 0,
  tanSuat: 26,
  ngay: 24,
} as const;

export function ChecksheetTable({
  rows,
  thucHien,
  thangDau,
  thangCuoi,
  editability,
  todayIso,
  canManageCongViec,
  pendingCongViecIds,
  onEditCongViec,
  onRemoveCongViec,
  onSetPlan,
  onSetAct,
  onRequestBatThuong,
  selectedDay,
  onSelectDay,
  onAutoFillPlan,
  printMode = false,
  paintMode = "G",
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
  /** Việc C: gợi ý UI cho cột "Thao tác" (Sửa/Loại bỏ) -- CHỈ ẩn/hiện, quyền
   * thật do RPC `can_manage_congviec` quyết định (xem EditCongViecModal.tsx). */
  canManageCongViec: boolean;
  /** Việc 2: congViecId đang có đề xuất "Chờ duyệt" -- ẩn nút Sửa/Xoá + hiện
   * badge cho dòng đó, tránh tạo đề xuất trùng trong lúc chờ Admin duyệt. */
  pendingCongViecIds: Set<string>;
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
  /** Mục 8: chế độ BẢN IN -- KHÔNG render cột Auto + Thao tác (thay vì ẩn
   * bằng CSS `no-print` trên <col>, vốn không đáng tin với table-layout
   * fixed: cột bị ẩn nhưng slot bề rộng vẫn được phân bổ lệch), dùng bộ bề
   * rộng cột gọn PRINT_COL_WIDTHS. Chỉ PrintSheet bật cờ này. */
  printMode?: boolean;
  /** Chế độ tô đang chọn trên thanh công cụ (ChecksheetApp) -- truyền thẳng
   * xuống Cell. Mặc định "G" để PrintSheet/BatchPrint khỏi phải truyền. */
  paintMode?: PaintMode;
}) {
  const rowSpans = calcRowSpans(rows);
  const days = listDaysInRange(thangDau, thangCuoi);
  const [namNam, thangNam] = thangDau.split("-").map(Number);
  const colWidths = printMode ? PRINT_COL_WIDTHS : COL_WIDTHS;

  // Dòng tổng cuối bảng. Tổng theo ngày tính theo KẾ HOẠCH (cờ vàng) = thời
  // gian DỰ KIẾN của ngày đó -- quyết định người dùng 2026-07-14 (khớp mẫu giấy
  // cũ: ảnh chỉ có cờ vàng mà vẫn ra số).
  const tongThoiGianBang = rows.reduce((sum, r) => sum + (r.thoiGian ?? 0), 0);
  const tongTheoNgay = days.map((d) =>
    rows.reduce(
      (sum, r) => (thucHien[cellKey(r.congViecId, d)]?.keHoach ? sum + (r.thoiGian ?? 0) : sum),
      0,
    ),
  );

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
      <p className="rounded-md border border-[#dee2e6] bg-white p-4 text-center text-sm text-[#6c757d]">
        Không có hạng mục nào cho thiết bị/tháng đã chọn.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[#dee2e6] bg-white">
      <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          <col style={{ width: colWidths.so }} />
          <col style={{ width: colWidths.tenChiTiet }} />
          <col style={{ width: colWidths.dieuKienCoBan }} />
          <col style={{ width: colWidths.tieuChuan }} />
          <col style={{ width: colWidths.thoiGian }} />
          {printMode ? null : <col style={{ width: colWidths.auto }} />}
          {printMode ? null : <col className="no-print" style={{ width: colWidths.thaoTac }} />}
          {TAN_SUAT_COLUMNS.map((label) => (
            <col key={label} style={{ width: colWidths.tanSuat }} />
          ))}
          {days.map((d) => (
            <col key={d} style={{ width: colWidths.ngay }} />
          ))}
        </colgroup>
        <thead className="border-b bg-[#f8f9fa] text-left text-xs font-bold tracking-wide text-[#212529] uppercase">
          <tr>
            <th className="border border-[#dee2e6] px-2 py-1" rowSpan={2}>
              Số
            </th>
            <th className="border border-[#dee2e6] px-2 py-1" rowSpan={2}>
              Tên chi tiết
            </th>
            <th className="border border-[#dee2e6] px-2 py-1" rowSpan={2}>
              Điều kiện cơ bản
            </th>
            <th className="border border-[#dee2e6] px-2 py-1" rowSpan={2}>
              Tiêu chuẩn
            </th>
            <th className="border border-[#dee2e6] px-2 py-1" rowSpan={2}>
              Thời gian
            </th>
            {printMode ? null : (
              <th
                className="border border-[#dee2e6] px-1 py-1 text-center"
                rowSpan={2}
                title="Tự động tô Plan mỗi 4/8 ngày"
              >
                Auto
              </th>
            )}
            {printMode ? null : (
              <th className="no-print border border-[#dee2e6] px-1 py-1 text-center" rowSpan={2}>
                Thao tác
              </th>
            )}
            <th className="border border-[#dee2e6] px-1 py-1 text-center" colSpan={TAN_SUAT_COLUMNS.length}>
              Tần suất
            </th>
            <th className="border border-[#dee2e6] px-1 py-1 text-center" colSpan={days.length}>
              Tháng {thangNam} / Năm {namNam}
            </th>
          </tr>
          <tr>
            {TAN_SUAT_COLUMNS.map((label) => (
              <th key={label} className="border border-[#dee2e6] px-1 py-1 text-center">
                {label}
              </th>
            ))}
            {days.map((d) => (
              <th key={d} className="border border-[#dee2e6] px-1 py-1 text-center">
                {Number(d.slice(8, 10))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const span = rowSpans[idx];
            const isGroupStart = span > 0;
            // Mục 1 (0016): dòng có hieu_luc_den rơi trong tháng đang xem =
            // đã bị loại bỏ/thay thế, hiệu lực hết tháng này -- hiện badge
            // thay cho nút Sửa/Xoá (đề xuất tiếp trên dòng này sẽ bị RPC
            // chặn/quy về phiên bản mới, không cho bấm ngay từ UI).
            const isEndingThisMonth = row.hieuLucDen !== null && row.hieuLucDen <= thangCuoi;
            return (
              <tr key={row.congViecId} className="border-b last:border-0">
                {isGroupStart ? (
                  <>
                    <td className="border border-[#dee2e6] px-2 py-1 text-center align-top" rowSpan={span}>
                      {row.stt ?? ""}
                    </td>
                    <td className="border border-[#dee2e6] px-2 py-1 align-top" rowSpan={span}>
                      {row.tenChiTiet}
                    </td>
                    <td className="border border-[#dee2e6] px-2 py-1 align-top" rowSpan={span}>
                      {row.dieuKienCoBan ?? ""}
                    </td>
                  </>
                ) : null}
                <td className="border border-[#dee2e6] px-2 py-1">{row.loaiHoatDong}</td>
                {/* Mục 10: cột "Người chịu trách nhiệm" đã dời lên khối thông
                    tin đầu trang (cạnh Khu vực/Trưởng ca) -- không còn trong
                    bảng lưới. */}
                <td className="border border-[#dee2e6] px-2 py-1 text-center tabular-nums">
                  {row.thoiGian ?? ""}
                </td>
                {printMode ? null : (
                  <td className="border border-[#dee2e6] px-1 py-1 text-center">
                    {/* P4/P8: tô Plan mỗi 4/8 ngày bắt đầu từ "ngày vừa bấm" trong
                        chính hàng này (selectedDay) -- bấm 1 ô ngày trước, rồi bấm
                        P4/P8. Disable nếu chưa chọn ngày nào trong hàng. */}
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        className="rounded border border-[#6c757d] px-1 text-[10px] leading-4 text-[#6c757d] hover:bg-[#6c757d] hover:text-white disabled:opacity-40"
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
                        className="rounded border border-[#6c757d] px-1 text-[10px] leading-4 text-[#6c757d] hover:bg-[#6c757d] hover:text-white disabled:opacity-40"
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
                )}
                {printMode ? null : (
                <td className="no-print border border-[#dee2e6] px-1 py-1 text-center">
                  {isEndingThisMonth ? (
                    <span
                      className="rounded-full bg-[#e9ecef] px-1.5 py-0.5 text-[10px] font-medium text-[#6c757d]"
                      title={
                        row.thayTheBoi
                          ? "Đã duyệt sửa -- giá trị mới áp dụng từ tháng sau, tháng này giữ giá trị cũ"
                          : "Đã duyệt loại bỏ -- ngừng hiện trên checksheet từ tháng sau"
                      }
                    >
                      {row.thayTheBoi ? "Đổi từ tháng sau" : "Loại bỏ từ tháng sau"}
                    </span>
                  ) : pendingCongViecIds.has(row.congViecId) ? (
                    <span
                      className="rounded-full bg-[#fff3cd] px-1.5 py-0.5 text-[10px] font-medium text-[#664d03]"
                      title="Đề xuất đang chờ Admin duyệt"
                    >
                      Chờ duyệt
                    </span>
                  ) : canManageCongViec ? (
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        className="rounded border border-[#0d6efd] px-1.5 text-[10px] leading-4 text-[#0d6efd] hover:bg-[#0d6efd] hover:text-white"
                        title="Sửa thời gian/tần suất"
                        onClick={() => onEditCongViec(row)}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#dc3545] px-1.5 text-[10px] leading-4 text-[#dc3545] hover:bg-[#dc3545] hover:text-white"
                        title="Loại bỏ công việc này (giữ lịch sử)"
                        onClick={() => onRemoveCongViec(row)}
                      >
                        Xoá
                      </button>
                    </div>
                  ) : null}
                </td>
                )}
                <TanSuatCells row={row} />
                {days.map((d) => {
                  const cell = thucHien[cellKey(row.congViecId, d)];
                  const rowEditable = editability[row.congViecId] ?? DENY_EDITABLE;
                  return (
                    <td key={d} className="border border-[#dee2e6] p-0">
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
                        paintMode={paintMode}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[#fff3cd] font-bold text-[#212529]">
          <tr>
            {/* 4 cột trái (Số, Tên chi tiết, Điều kiện cơ bản, Tiêu chuẩn) gộp
                làm nhãn; cột "Thời gian" hiện tổng 1 vòng đầy đủ. */}
            <th colSpan={4} className="border border-[#dee2e6] px-2 py-1 text-right">
              TỔNG THỜI GIAN CHĂM SÓC (PHÚT)
            </th>
            <td className="border border-[#dee2e6] px-2 py-1 text-center tabular-nums">
              {tongThoiGianBang || ""}
            </td>
            {/* Auto + Thao tác chỉ tồn tại ở bản MÀN HÌNH (printMode bỏ 2 cột
                này) -- phải theo cùng điều kiện với thead/tbody, nếu hardcode
                colSpan thì bản in sẽ lệch cột. */}
            {printMode ? null : <td className="border border-[#dee2e6]" />}
            {printMode ? null : <td className="no-print border border-[#dee2e6]" />}
            <td colSpan={TAN_SUAT_COLUMNS.length} className="border border-[#dee2e6]" />
            {tongTheoNgay.map((tong, idx) => (
              <td
                key={days[idx]}
                className="border border-[#dee2e6] px-1 py-1 text-center tabular-nums"
              >
                {tong || ""}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
