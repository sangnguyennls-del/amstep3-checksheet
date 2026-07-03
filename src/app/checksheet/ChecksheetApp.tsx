"use client";

import { useMemo, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCongViecRows, getThucHien, parseNhanVienMsnv } from "@/lib/checksheet/queries";
import { getEditability, type EditabilityMap } from "@/lib/checksheet/editability";
import { gridReducer, initialGridState } from "@/lib/checksheet/gridReducer";
import { cellKey, type CongViecRow, type FilterOptions, type KetQua } from "@/lib/checksheet/types";
import { ChecksheetTable, listDaysInRange } from "./ChecksheetTable";

type ThietBiOption = FilterOptions["thietBi"][number];

/**
 * Tách "CV00001_2026-07-15" thành { congViecId: "CV00001", ngay: "2026-07-15" }
 * -- nghịch đảo của `cellKey()` (types.ts). An toàn vì `congViecId` (dạng
 * "CV00001") và `ngay` (ISO "YYYY-MM-DD") không bao giờ chứa dấu "_", nên chỉ
 * cần tách tại dấu "_" ĐẦU TIÊN.
 */
function parseCellKey(key: string): { congViecId: string; ngay: string } {
  const idx = key.indexOf("_");
  return { congViecId: key.slice(0, idx), ngay: key.slice(idx + 1) };
}

type RejectedCell = {
  congViecId: string;
  ngay: string;
  status: "skipped" | "conflict";
  reason: string | null;
};

type UpsertResultRow = {
  congviec_id: string;
  ngay: string;
  status: "applied" | "skipped" | "conflict";
  reason: string | null;
};

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
  const [editability, setEditability] = useState<EditabilityMap>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rejectedCells, setRejectedCells] = useState<RejectedCell[]>([]);
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
    setSaveError(null);
    setRejectedCells([]);
    try {
      const supabase = createClient();
      const { thangDau, thangCuoi } = monthRange(monthValue);
      const congViecRows = await getCongViecRows(supabase, thietBiId, thangDau, thangCuoi);
      const congViecIds = congViecRows.map((r) => r.congViecId);
      const [map, editabilityMap] = await Promise.all([
        getThucHien(supabase, congViecIds, thangDau, thangCuoi),
        // get_editability: gọi 1 LẦN cho toàn bộ CONGVIEC đang hiển thị, KHÔNG
        // tự suy luận lại quy tắc diff tháng/lock-date/device-lock ở client --
        // đây là nguồn chân lý duy nhất (xem editability.ts).
        getEditability(supabase, congViecIds, thangDau),
      ]);
      setRows(congViecRows);
      dispatch({ type: "load", cells: map });
      setEditability(editabilityMap);
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
   *
   * Gate theo `editability[congViecId].plan` giống hệt đường click/kéo-tô ở
   * ChecksheetTable.handlePaintEnter/Cell.applyZone -- fix carry-over từ
   * review Task 2 (P4/P8 trước đây dispatch thẳng không kiểm tra quyền, có
   * thể lách qua đúng kiểm tra mà click/drag đã làm đúng). `is_plan_editable`
   * chỉ phụ thuộc congViecId + tháng đang xem (không phụ thuộc ngày cụ thể
   * trong tháng đó, xem can_edit_plan trong 0002_functions_triggers.sql) nên
   * kiểm tra 1 lần trước vòng lặp là đủ, không cần kiểm tra lại từng ngày.
   */
  function autoFillPlan(congViecId: string, startDay: string, interval: 4 | 8) {
    if (!editability[congViecId]?.plan) return;
    const { thangDau, thangCuoi } = monthRange(monthValue);
    const days = listDaysInRange(thangDau, thangCuoi);
    const startIdx = days.indexOf(startDay);
    if (startIdx === -1) return;
    for (let i = startIdx; i < days.length; i += interval) {
      dispatch({ type: "setPlan", congViecId, ngay: days[i], keHoach: true });
    }
  }

  /**
   * Lưu thật: gọi RPC `upsert_thuc_hien` với payload build TỪ `state.dirty`
   * (chỉ các ô đã đổi, không gửi cả 31 ô/hàng như hệ cũ).
   *
   * Phòng thủ "cấm ket_qua=R": lọc tường minh mọi ô vừa đổi sang R ra khỏi
   * payload (RPC sẽ raise exception nếu nhận R -- R chỉ được set qua
   * `set_ket_qua_r_with_bat_thuong`, Task 4). Task 2 không có UI nào tạo ra
   * giá trị này nhưng vẫn chặn ở đây theo đúng yêu cầu "phòng thủ nhiều lớp"
   * của brief Task 3.
   *
   * Optimistic concurrency: mỗi ô gửi kèm `expected_updated_at` lấy từ
   * `state.initial[key]?.updatedAt` (null nếu ô chưa từng có dòng thuc_hien
   * nào -- RPC coi null là "không kiểm tra xung đột", đúng cho trường hợp
   * tạo mới).
   *
   * Đọc lại toàn bộ kết quả trả về: `applied` -> gom lại để dispatch
   * `markSaved` 1 lần; `skipped`/`conflict` -> GIỮ NGUYÊN giá trị dirty hiện
   * tại (không dispatch gì), hiển thị danh sách kèm `reason`.
   *
   * `savedAt` cho `markSaved`: RPC không trả về `updated_at` mới, nên sau khi
   * có ít nhất 1 ô `applied`, gọi lại `getThucHien` cho đúng các CONGVIEC liên
   * quan để lấy `updated_at` THẬT từ server, dùng giá trị đó (không phải
   * đồng hồ client) làm `savedAt` -- vì `upsert_thuc_hien` chạy trong 1
   * transaction duy nhất, mọi dòng được `applied` trong CÙNG 1 lần gọi chia
   * sẻ ĐÚNG 1 giá trị `now()` (ngữ nghĩa transaction timestamp của Postgres,
   * xem cột `updated_at default now()` + trigger `fn_set_updated_at` ở
   * 0001/0002_*.sql) -- nên chỉ cần đọc `updated_at` của 1 ô bất kỳ trong lô
   * `applied` là đủ chính xác cho TẤT CẢ các ô còn lại trong cùng lô, không
   * cần đổi shape action `markSaved` (vốn chỉ nhận 1 `savedAt` chung).
   */
  async function handleSave() {
    if (gridState.dirty.size === 0) return;
    setSaving(true);
    setSaveError(null);
    setRejectedCells([]);
    try {
      const supabase = createClient();
      const { thangDau, thangCuoi } = monthRange(monthValue);

      const payloadItems: {
        congviec_id: string;
        ngay: string;
        ke_hoach: boolean | null;
        ket_qua: KetQua | null;
        expected_updated_at: string | null;
      }[] = [];
      const blockedRKeys: string[] = [];

      for (const key of gridState.dirty) {
        const cell = gridState.cells[key];
        if (!cell) continue;
        const initialCell = gridState.initial[key];
        const baseKeHoach = initialCell?.keHoach ?? false;
        const baseKetQua = initialCell?.ketQua ?? "N";

        // CẤM tường minh: KHÔNG BAO GIỜ gửi ket_qua="R" qua upsert_thuc_hien.
        if (cell.ketQua === "R" && baseKetQua !== "R") {
          blockedRKeys.push(key);
          continue;
        }

        const { congViecId, ngay } = parseCellKey(key);
        // CHỈ gửi field THẬT SỰ đổi so với `initial` cho ô này -- gửi cả 2
        // field vô điều kiện sẽ kích hoạt 1 hành vi lạ của RPC
        // `upsert_thuc_hien` (bất biến, không được sửa) cho ô CHƯA từng có
        // dòng thuc_hien: nhánh "insert mới" của RPC không so sánh field
        // không đổi với giá trị hiện có (vì chưa có gì để so) -- nó chỉ xét
        // quyền cho field đó rồi coi là "đã đổi" bất kể giá trị gửi lên có
        // giống mặc định hay không. Hậu quả đã xác nhận bằng test thủ công
        // (Playwright, xem report): gửi `ke_hoach:false` (không đổi, mặc
        // định) kèm `ket_qua:"G"` cho 1 ô Actual ngoài cửa sổ +-4 ngày khiến
        // RPC tạo dòng mới CHỈ vì field `ke_hoach` được phép (luôn được phép
        // trong tháng hiện tại trước lock date, không phụ thuộc ngày cụ thể)
        // -- trả về status "applied" cho CẢ dòng dù phần Actual (phần người
        // dùng thực sự muốn đổi) bị lặng lẽ bỏ qua. Gửi `null` cho field
        // không đổi loại bỏ hẳn khả năng này: RPC coi field null là "không
        // yêu cầu đổi", không xét quyền, không đóng góp vào cờ "đã đổi".
        const keHoachChanged = cell.keHoach !== baseKeHoach;
        const ketQuaChanged = cell.ketQua !== baseKetQua;
        payloadItems.push({
          congviec_id: congViecId,
          ngay,
          ke_hoach: keHoachChanged ? cell.keHoach : null,
          ket_qua: ketQuaChanged ? cell.ketQua : null,
          expected_updated_at: initialCell?.updatedAt ?? null,
        });
      }

      const blockedRejected: RejectedCell[] = blockedRKeys.map((key) => {
        const { congViecId, ngay } = parseCellKey(key);
        return {
          congViecId,
          ngay,
          status: "skipped",
          reason:
            'Ô Actual "R" (bất thường) cần nhập mô tả qua chức năng ghi nhận bất thường riêng, chưa hỗ trợ lưu qua nút Lưu thường.',
        };
      });

      if (payloadItems.length === 0) {
        setRejectedCells(blockedRejected);
        return;
      }

      const { data, error } = await supabase.rpc("upsert_thuc_hien", { payload: payloadItems });
      if (error) throw error;

      const results = (data ?? []) as UpsertResultRow[];
      const appliedKeys: string[] = [];
      const rejected: RejectedCell[] = [...blockedRejected];

      for (const r of results) {
        if (r.status === "applied") {
          appliedKeys.push(cellKey(r.congviec_id, r.ngay));
        } else {
          rejected.push({ congViecId: r.congviec_id, ngay: r.ngay, status: r.status, reason: r.reason });
        }
      }

      if (appliedKeys.length > 0) {
        const appliedCongViecIds = Array.from(
          new Set(appliedKeys.map((k) => parseCellKey(k).congViecId)),
        );
        const refreshed = await getThucHien(supabase, appliedCongViecIds, thangDau, thangCuoi);
        const savedAt = refreshed[appliedKeys[0]]?.updatedAt ?? new Date().toISOString();
        dispatch({ type: "markSaved", keys: appliedKeys, savedAt });
      }

      setRejectedCells(rejected);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không lưu được dữ liệu checksheet");
    } finally {
      setSaving(false);
    }
  }

  const canLoad = !!thietBiId && !!monthValue;
  const { thangDau, thangCuoi } = monthRange(monthValue);
  const showTable = loadedFor === `${thietBiId}_${monthValue}`;
  const hasDirty = gridState.dirty.size > 0;
  // "Hôm nay" chỉ dùng để tô gợi ý cửa sổ +-4 ngày ở Cell (xem actWindow.ts)
  // -- không ảnh hưởng gì tới quyết định lưu thật (server quyết định).
  const todayIso = new Date().toISOString().slice(0, 10);

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
      {saveError ? <p className="mb-3 text-sm text-red-600">{saveError}</p> : null}

      {rejectedCells.length > 0 ? (
        <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-medium">
            {rejectedCells.length} ô không được lưu (server từ chối hoặc cần xử lý riêng):
          </p>
          <ul className="list-inside list-disc">
            {rejectedCells.map((r, idx) => (
              <li key={`${r.congViecId}_${r.ngay}_${idx}`}>
                Ngày {Number(r.ngay.slice(8, 10))}, {r.congViecId}:{" "}
                {r.status === "conflict" ? "Xung đột dữ liệu" : "Bị từ chối"} —{" "}
                {r.reason ?? "Không rõ lý do"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
              disabled={!hasDirty || saving}
              onClick={handleSave}
              className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
          <ChecksheetTable
            rows={rows}
            thucHien={gridState.cells}
            thangDau={thangDau}
            thangCuoi={thangCuoi}
            editability={editability}
            todayIso={todayIso}
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
