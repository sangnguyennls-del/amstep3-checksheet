"use client";

import { useMemo, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCongViecRows, getThucHien, parseNhanVienMsnv } from "@/lib/checksheet/queries";
import { gridReducer, initialGridState } from "@/lib/checksheet/gridReducer";
import type { CongViecRow, FilterOptions, KetQua } from "@/lib/checksheet/types";
import { ChecksheetTable, listDaysInRange } from "./ChecksheetTable";

// Task 2: mọi ô đều editable cứng {plan:true, act:true} -- Task 3 sẽ thay
// bằng giá trị thật lấy từ get_editability(...), không đổi API của Cell.
const HARDCODED_EDITABLE = { plan: true, act: true };

type ThietBiOption = FilterOptions["thietBi"][number];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** "YYYY-MM" -> { thangDau: "YYYY-MM-01", thangCuoi: "YYYY-MM-<số ngày cuối tháng>" }. */
export function monthRange(monthValue: string): { thangDau: string; thangCuoi: string } {
  const [yStr, mStr] = monthValue.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    thangDau: `${yStr}-${mStr}-01`,
    thangCuoi: `${yStr}-${mStr}-${pad2(lastDay)}`,
  };
}

const selectClass =
  "rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400";

export function ChecksheetApp({
  currentUser,
  filterOptions,
}: {
  currentUser: { msnv: string | null; hoTen: string };
  filterOptions: FilterOptions;
}) {
  const [xuong, setXuong] = useState("");
  const [kip, setKip] = useState("");
  const [nhanVienMsnv, setNhanVienMsnv] = useState("");
  const [thietBiId, setThietBiId] = useState("");
  const [monthValue, setMonthValue] = useState(defaultMonthValue());

  const [rows, setRows] = useState<CongViecRow[]>([]);
  const [gridState, dispatch] = useReducer(gridReducer, initialGridState());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // "Ngày vừa bấm" trong 1 hàng cụ thể -- mốc bắt đầu cho nút P4/P8 auto-fill
  // của hàng đó (xem ChecksheetTable/Cell.onSelectDay).
  const [selectedDay, setSelectedDay] = useState<{ congViecId: string; ngay: string } | null>(
    null,
  );

  // Cascading: thu hẹp thietBi theo các lựa chọn cấp cao hơn đã chọn, thu hẹp
  // kip/nhanVien theo xuong đã chọn -- đúng thuật toán hệ cũ (App.applyFilters
  // trong Javascript.html): lọc mảng thietBi theo các trường đã chọn, distinct
  // lại cho từng cấp dropdown kế tiếp.
  const thietBiAfterXuong = useMemo(
    () => filterOptions.thietBi.filter((tb) => !xuong || tb.xuong === xuong),
    [filterOptions.thietBi, xuong],
  );

  const kipOptions = useMemo(
    () => Array.from(new Set(thietBiAfterXuong.map((tb) => tb.kip).filter(Boolean))).sort(),
    [thietBiAfterXuong],
  );

  const thietBiAfterKip = useMemo(
    () => thietBiAfterXuong.filter((tb) => !kip || tb.kip === kip),
    [thietBiAfterXuong, kip],
  );

  const nhanVienOptions = useMemo(() => {
    const msnvSet = new Set(
      thietBiAfterKip.map((tb) => tb.nguoiPhuTrach).filter((v): v is string => !!v),
    );
    return filterOptions.nhanVien.filter((display) => msnvSet.has(parseNhanVienMsnv(display)));
  }, [thietBiAfterKip, filterOptions.nhanVien]);

  const thietBiAfterNhanVien = useMemo(
    () => thietBiAfterKip.filter((tb) => !nhanVienMsnv || tb.nguoiPhuTrach === nhanVienMsnv),
    [thietBiAfterKip, nhanVienMsnv],
  );

  const selectedThietBi: ThietBiOption | undefined = thietBiAfterNhanVien.find(
    (tb) => tb.id === thietBiId,
  );

  function handleXuongChange(value: string) {
    setXuong(value);
    setKip("");
    setNhanVienMsnv("");
    setThietBiId("");
  }

  function handleKipChange(value: string) {
    setKip(value);
    setNhanVienMsnv("");
    setThietBiId("");
  }

  function handleNhanVienChange(value: string) {
    setNhanVienMsnv(value);
    setThietBiId("");
  }

  async function handleLoad() {
    if (!thietBiId || !monthValue) return;
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const { thangDau, thangCuoi } = monthRange(monthValue);
      const congViecRows = await getCongViecRows(supabase, thietBiId, thangDau, thangCuoi);
      const map = await getThucHien(
        supabase,
        congViecRows.map((r) => r.congViecId),
        thangDau,
        thangCuoi,
      );
      setRows(congViecRows);
      dispatch({ type: "load", cells: map });
      setSelectedDay(null);
      setLoadedFor(`${thietBiId}_${monthValue}`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được dữ liệu checksheet");
    } finally {
      setLoading(false);
    }
  }

  function handleSetPlan(congViecId: string, ngay: string, keHoach: boolean) {
    dispatch({ type: "setPlan", congViecId, ngay, keHoach });
  }

  function handleSetAct(congViecId: string, ngay: string, ketQua: KetQua) {
    dispatch({ type: "setAct", congViecId, ngay, ketQua });
  }

  function handleSelectDay(congViecId: string, ngay: string) {
    setSelectedDay({ congViecId, ngay });
  }

  /**
   * P4/P8: tô Plan=true mỗi 4/8 ngày bắt đầu từ `startDay`, tới hết tháng --
   * thuật toán y hệt `onAutoFill` của hệ cũ (CLAUDE.md "Client-side
   * structure"): CHỈ tiến về phía trước (startDay, startDay+interval, ...),
   * KHÔNG BAO GIỜ lùi về ngày trước `startDay`.
   */
  function autoFillPlan(congViecId: string, startDay: string, interval: 4 | 8) {
    const { thangDau, thangCuoi } = monthRange(monthValue);
    const days = listDaysInRange(thangDau, thangCuoi);
    const startIdx = days.indexOf(startDay);
    if (startIdx === -1) return;
    for (let i = startIdx; i < days.length; i += interval) {
      dispatch({ type: "setPlan", congViecId, ngay: days[i], keHoach: true });
    }
  }

  function handleSaveStub() {
    // STUB tạm thời -- Task 2 CHƯA nối dây lưu server thật. Task 3 sẽ thay
    // hẳn hàm này bằng upsert_thuc_hien + xử lý applied/skipped/conflict.
    console.log("Sẽ nối dây lưu thật ở Task 3. Các ô dirty:", Array.from(gridState.dirty));
    alert('Chức năng "Lưu" sẽ được nối dây với server ở Task 3. Xem console để thấy danh sách ô đã đổi.');
  }

  const canLoad = !!thietBiId && !!monthValue;
  const { thangDau, thangCuoi } = monthRange(monthValue);
  const showTable = loadedFor === `${thietBiId}_${monthValue}`;
  const hasDirty = gridState.dirty.size > 0;

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Đăng nhập: {currentUser.hoTen}
        {currentUser.msnv ? ` (${currentUser.msnv})` : ""}
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Xưởng</label>
          <select
            className={selectClass}
            value={xuong}
            onChange={(e) => handleXuongChange(e.target.value)}
          >
            <option value="">-- Tất cả --</option>
            {filterOptions.xuong.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Kíp</label>
          <select
            className={selectClass}
            value={kip}
            onChange={(e) => handleKipChange(e.target.value)}
          >
            <option value="">-- Tất cả --</option>
            {kipOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Nhân viên phụ trách</label>
          <select
            className={selectClass}
            value={nhanVienMsnv}
            onChange={(e) => handleNhanVienChange(e.target.value)}
          >
            <option value="">-- Tất cả --</option>
            {nhanVienOptions.map((display) => {
              const msnv = parseNhanVienMsnv(display);
              return (
                <option key={msnv} value={msnv}>
                  {display}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Thiết bị</label>
          <select
            className={selectClass}
            value={thietBiId}
            onChange={(e) => setThietBiId(e.target.value)}
          >
            <option value="">-- Chọn thiết bị --</option>
            {thietBiAfterNhanVien.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {tb.maThietBi} - {tb.tenThietBi}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Tháng</label>
          <input
            type="month"
            className={selectClass}
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
          />
        </div>

        <button
          type="button"
          disabled={!canLoad || loading}
          onClick={handleLoad}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Đang tải..." : "Xem checksheet"}
        </button>
      </div>

      {selectedThietBi ? (
        <p className="mb-3 text-sm text-gray-500">
          Thiết bị: <span className="font-medium">{selectedThietBi.tenThietBi}</span> — Xưởng{" "}
          {selectedThietBi.xuong || "-"} / Kíp {selectedThietBi.kip || "-"}
        </p>
      ) : null}

      {loadError ? <p className="mb-3 text-sm text-red-600">{loadError}</p> : null}

      {showTable ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {hasDirty
                ? `${gridState.dirty.size} ô đã đổi, chưa lưu.`
                : "Không có thay đổi nào chưa lưu."}
            </p>
            <button
              type="button"
              disabled={!hasDirty}
              onClick={handleSaveStub}
              className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
            >
              Lưu
            </button>
          </div>
          <ChecksheetTable
            rows={rows}
            thucHien={gridState.cells}
            thangDau={thangDau}
            thangCuoi={thangCuoi}
            editable={HARDCODED_EDITABLE}
            onSetPlan={handleSetPlan}
            onSetAct={handleSetAct}
            selectedDay={selectedDay}
            onSelectDay={handleSelectDay}
            onAutoFillPlan={autoFillPlan}
          />
        </>
      ) : (
        <p className="rounded-md border bg-white p-4 text-center text-sm text-gray-400">
          Chọn Thiết bị và Tháng rồi bấm &quot;Xem checksheet&quot; để tải dữ liệu.
        </p>
      )}
    </div>
  );
}
