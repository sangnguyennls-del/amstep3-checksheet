"use client";

import { useMemo, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCongViecRows, getThucHien, parseNhanVienMsnv } from "@/lib/checksheet/queries";
import { getEditability, type EditabilityMap } from "@/lib/checksheet/editability";
import { gridReducer, initialGridState } from "@/lib/checksheet/gridReducer";
import { CHECKSHEET_SAVED_EVENT } from "@/lib/checksheet/notifications";
import { cellKey, type CongViecRow, type FilterOptions, type KetQua } from "@/lib/checksheet/types";
import { vnTodayIso } from "@/lib/checksheet/vnDate";
import { ui } from "@/lib/ui";
import { AppLogo } from "@/components/AppLogo";
import { ChecksheetTable, listDaysInRange } from "./ChecksheetTable";
import { BatThuongModal } from "./BatThuongModal";
import { EditCongViecModal, type EditCongViecResult, type EditCongViecTarget } from "./EditCongViecModal";
import { EquipmentImageModal, toDriveImageSrc } from "./EquipmentImageModal";
import checksheetStyles from "./checksheet.module.css";
import "./print.css";

type ThietBiOption = FilterOptions["thietBi"][number];

/** 1 ô nhãn/giá trị trong khối thông tin đầu trang (đúng bố cục mẫu giấy). */
function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value || "-"}</dd>
    </div>
  );
}

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
  // "partial" = status server trả về là 'applied' nhưng CHỈ 1 trong 2 field
  // (Plan/Actual) thực sự được áp dụng -- field còn lại bị từ chối trong
  // CÙNG lần lưu đó (xem finding review Task 3: server trước đây báo
  // 'applied' cho cả dòng, che mất việc 1 field bị âm thầm rớt).
  status: "skipped" | "conflict" | "partial";
  reason: string | null;
};

type UpsertResultRow = {
  congviec_id: string;
  ngay: string;
  status: "applied" | "skipped" | "conflict";
  reason: string | null;
  // Thêm ở migration 0006: null = field không nằm trong request; true/false =
  // field có được yêu cầu và có/không được áp dụng. Trước đây client chỉ đọc
  // `status` chung cho cả dòng, không phân biệt được field nào trong 1 dòng
  // 'applied' đã thực sự bị từ chối.
  plan_applied: boolean | null;
  act_applied: boolean | null;
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

const selectClass = ui.input;

export function ChecksheetApp({
  currentUser,
  filterOptions,
}: {
  currentUser: {
    msnv: string | null;
    hoTen: string;
    vaiTro: string | null;
    xuong: string | null;
    kip: string | null;
    nhom: string | null;
  };
  filterOptions: FilterOptions;
}) {
  // Việc 1: mặc định lọc theo hồ sơ người đang đăng nhập (áp dụng mọi role,
  // kể cả Admin/AdminM), người dùng vẫn tự do đổi lại sau đó. Nhân viên phụ
  // trách chỉ mặc định về "chính mình" nếu msnv đó thực sự đứng tên phụ
  // trách ít nhất 1 thiết bị khớp Xưởng/Kíp/Nhóm nhỏ đã mặc định -- nếu
  // không, mặc định về msnv sẽ lọc rỗng toàn bộ danh sách thiết bị (đa số
  // user thường không phải nguoi_phu_trach của thiết bị nào).
  const [xuong, setXuong] = useState(() => currentUser.xuong ?? "");
  const [kip, setKip] = useState(() => currentUser.kip ?? "");
  const [nhom, setNhom] = useState(() => currentUser.nhom ?? "");
  const [nhanVienMsnv, setNhanVienMsnv] = useState(() => {
    if (!currentUser.msnv) return "";
    const isOwnerOfSomeDevice = filterOptions.thietBi.some(
      (tb) =>
        (!currentUser.xuong || tb.xuong === currentUser.xuong) &&
        (!currentUser.kip || tb.kip === currentUser.kip) &&
        (!currentUser.nhom || tb.nhom === currentUser.nhom) &&
        tb.nguoiPhuTrach === currentUser.msnv,
    );
    return isOwnerOfSomeDevice ? currentUser.msnv : "";
  });
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
  // Task 4: ô đang chờ nhập mô tả bất thường (mở BatThuongModal) -- null nếu
  // không có modal nào đang mở. Xem Cell.tsx: onRequestBatThuong.
  const [batThuongTarget, setBatThuongTarget] = useState<{ congViecId: string; ngay: string } | null>(
    null,
  );
  const [imageModalOpen, setImageModalOpen] = useState(false);
  // Việc C: modal "Sửa thời gian/tần suất" hoặc "Loại bỏ" 1 công việc, mở từ
  // nút trên ChecksheetTable -- null khi không có modal nào đang mở.
  const [editTarget, setEditTarget] = useState<{
    mode: "edit" | "remove";
    target: EditCongViecTarget;
  } | null>(null);
  // Việc 2: congViecId nào đang có đề xuất "Chờ duyệt" -- ẩn nút Sửa/Xoá +
  // hiện badge cho dòng đó (tránh đề xuất trùng), tải lại mỗi khi load
  // checksheet hoặc ngay sau khi 1 đề xuất mới được tạo.
  const [pendingCongViecIds, setPendingCongViecIds] = useState<Set<string>>(new Set());

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

  const nhomOptions = useMemo(
    () =>
      Array.from(
        new Set(thietBiAfterKip.map((tb) => tb.nhom).filter((v): v is string => !!v)),
      ).sort(),
    [thietBiAfterKip],
  );

  const thietBiAfterNhom = useMemo(
    () => thietBiAfterKip.filter((tb) => !nhom || tb.nhom === nhom),
    [thietBiAfterKip, nhom],
  );

  const nhanVienOptions = useMemo(() => {
    const msnvSet = new Set(
      thietBiAfterNhom.map((tb) => tb.nguoiPhuTrach).filter((v): v is string => !!v),
    );
    return filterOptions.nhanVien.filter((display) => msnvSet.has(parseNhanVienMsnv(display)));
  }, [thietBiAfterNhom, filterOptions.nhanVien]);

  const thietBiAfterNhanVien = useMemo(
    () => thietBiAfterNhom.filter((tb) => !nhanVienMsnv || tb.nguoiPhuTrach === nhanVienMsnv),
    [thietBiAfterNhom, nhanVienMsnv],
  );

  const selectedThietBi: ThietBiOption | undefined = thietBiAfterNhanVien.find(
    (tb) => tb.id === thietBiId,
  );

  // Việc C: gợi ý UI cho nút "Sửa"/"Loại bỏ" trên ChecksheetTable -- CHỈ để
  // ẩn/hiện, không phải nguồn chân lý (quyền thật do RPC `can_manage_congviec`
  // quyết định, xem migration 0010). Admin/AdminM hoặc đúng người phụ trách
  // thiết bị đang xem mới thấy các nút này.
  const isAdminRole = currentUser.vaiTro === "admin" || currentUser.vaiTro === "adminm";
  const canManageDevice =
    isAdminRole || (!!selectedThietBi && !!currentUser.msnv && selectedThietBi.nguoiPhuTrach === currentUser.msnv);

  function handleXuongChange(value: string) {
    setXuong(value);
    setKip("");
    setNhom("");
    setNhanVienMsnv("");
    setThietBiId("");
  }

  function handleKipChange(value: string) {
    setKip(value);
    setNhom("");
    setNhanVienMsnv("");
    setThietBiId("");
  }

  function handleNhomChange(value: string) {
    setNhom(value);
    setNhanVienMsnv("");
    setThietBiId("");
  }

  function handleNhanVienChange(value: string) {
    setNhanVienMsnv(value);
    setThietBiId("");
  }

  // Việc 2: nạp lại danh sách congViecId đang "Chờ duyệt" -- RLS
  // (de_xuat_congviec_select) tự giới hạn kết quả theo người gọi (chính
  // người đề xuất hoặc Admin có quyền duyệt Nhóm đó), nên không cần lọc gì
  // thêm ở client ngoài .in(congViecIds) để giới hạn đúng phạm vi đang xem.
  async function refreshPendingCongViec(congViecIds: string[]) {
    if (congViecIds.length === 0) {
      setPendingCongViecIds(new Set());
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("de_xuat_congviec")
      .select("congviec_id")
      .eq("trang_thai", "Chờ duyệt")
      .in("congviec_id", congViecIds);
    setPendingCongViecIds(new Set((data ?? []).map((r) => r.congviec_id as string)));
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
        refreshPendingCongViec(congViecIds),
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

  // Task 4: mở BatThuongModal cho đúng ô vừa click (Cell.applyZone chỉ gọi
  // hàm này khi chu trình Actual SẮP đổi thành "R" -- không dispatch state gì
  // ở đây, chỉ mở modal chờ người dùng nhập mô tả).
  function handleRequestBatThuong(congViecId: string, ngay: string) {
    setBatThuongTarget({ congViecId, ngay });
  }

  // Modal đã gọi RPC `set_ket_qua_r_with_bat_thuong` THÀNH CÔNG (lưu server
  // xong) -- CHỈ bây giờ mới dispatch `applyBatThuong` để tô đỏ ô trên UI,
  // đúng nguyên tắc "không optimistic" của luồng R (khác Plan/Actual G/N vốn
  // tô trước, lưu sau qua nút Lưu thường -- xem docstring action
  // `applyBatThuong` ở gridReducer.ts).
  function handleBatThuongSuccess(result: {
    congViecId: string;
    ngay: string;
    thuChienId: string;
    updatedAt: string;
    moTa: string;
  }) {
    dispatch({
      type: "applyBatThuong",
      congViecId: result.congViecId,
      ngay: result.ngay,
      thuChienId: result.thuChienId,
      updatedAt: result.updatedAt,
      moTa: result.moTa,
    });
    setBatThuongTarget(null);
    // Ghi nhận bất thường cũng là 1 lần lưu Actual thật -- có thể vừa xoá 1
    // mục "thiếu Actual" khỏi chuông, nên báo cho NotificationBell tải lại.
    window.dispatchEvent(new Event(CHECKSHEET_SAVED_EVENT));
  }

  // Việc C: mở modal "Sửa"/"Loại bỏ" cho đúng công việc vừa bấm nút trên
  // ChecksheetTable (xem nút "Thao tác" mới trong ChecksheetTable.tsx).
  function handleOpenEditCongViec(mode: "edit" | "remove", row: CongViecRow) {
    setEditTarget({
      mode,
      target: {
        congViecId: row.congViecId,
        tenChiTiet: row.tenChiTiet,
        loaiHoatDong: row.loaiHoatDong,
        thoiGian: row.thoiGian,
        tanSuatChu: row.tanSuatChu,
        tanSuatSo: row.tanSuatSo,
      },
    });
  }

  // Modal đã gọi RPC (update_congviec_with_reason/remove_congviec_with_reason)
  // THÀNH CÔNG -- cập nhật state cục bộ, KHÔNG tải lại cả trang: "edit" sửa
  // tại chỗ 3 field vừa đổi; "remove" lọc hẳn dòng khỏi mảng `rows` (đúng
  // hành vi loại bỏ mềm -- dòng biến mất khỏi checksheet dù DB vẫn còn
  // active=false, xem docstring RPC).
  function handleEditCongViecSuccess(result: EditCongViecResult) {
    if (!result.applied) {
      // Việc 2: người phụ trách (không phải admin) vừa tạo đề xuất "Chờ
      // duyệt" -- công việc CHƯA đổi thật sự, chỉ đánh dấu pending để hiện
      // badge + ẩn nút Sửa/Xoá (tránh đề xuất trùng), không mutate `rows`.
      setPendingCongViecIds((prev) => new Set(prev).add(result.congViecId));
      setEditTarget(null);
      return;
    }
    if (result.mode === "remove") {
      setRows((prev) => prev.filter((r) => r.congViecId !== result.congViecId));
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.congViecId === result.congViecId
            ? { ...r, thoiGian: result.thoiGian, tanSuatChu: result.tanSuatChu, tanSuatSo: result.tanSuatSo }
            : r,
        ),
      );
    }
    setEditTarget(null);
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
    // Khai báo NGOÀI try để nhánh catch (lỗi mạng/RPC throw trước khi có kết
    // quả) vẫn hiển thị được các ô bị chặn ở client (ket_qua="R" gửi qua nút
    // Lưu thường) -- fix Minor finding: trước đây blockedRejected chỉ được
    // set vào state ở nhánh thành công, nên nếu RPC throw (network lỗi, RLS
    // lỗi không liên quan...) thì các ô bị chặn này biến mất khỏi UI dù đã
    // được tính đúng.
    let blockedRejectedForCatch: RejectedCell[] = [];
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

      blockedRejectedForCatch = blockedRejected;

      if (payloadItems.length === 0) {
        setRejectedCells(blockedRejected);
        return;
      }

      const { data, error } = await supabase.rpc("upsert_thuc_hien", { payload: payloadItems });
      if (error) throw error;

      const results = (data ?? []) as UpsertResultRow[];
      // Dùng "markFieldsApplied" (không phải "markSaved") cho MỌI dòng
      // status='applied' -- kể cả khi cả 2 field đều applied, action này vẫn
      // cho kết quả đúng (tương đương markSaved), nhưng còn xử lý ĐÚNG trường
      // hợp CHỈ 1 field applied: field bị từ chối (`plan_applied`/`act_applied`
      // === false, thêm ở migration 0006) sẽ KHÔNG được ghi vào `initial`,
      // nên ô đó vẫn hiện dirty/chưa lưu cho đúng phần bị rớt -- đây chính là
      // fix cho finding "Important" (server trả 'applied' cho cả dòng dù 1
      // field bị âm thầm từ chối).
      const appliedEntries: {
        congViecId: string;
        ngay: string;
        planApplied: boolean;
        actApplied: boolean;
      }[] = [];
      const rejected: RejectedCell[] = [...blockedRejected];

      for (const r of results) {
        const planApplied = r.plan_applied === true;
        const actApplied = r.act_applied === true;
        const planDenied = r.plan_applied === false;
        const actDenied = r.act_applied === false;

        if (r.status === "applied") {
          appliedEntries.push({ congViecId: r.congviec_id, ngay: r.ngay, planApplied, actApplied });

          // Lưu MỘT PHẦN: dòng được báo 'applied' (ít nhất 1 field áp dụng
          // thành công) nhưng field còn lại (được yêu cầu) bị từ chối trong
          // CÙNG lần lưu -- ví dụ tô cả Plan lẫn Actual trên 1 ô rồi Lưu,
          // Plan hợp lệ nhưng Actual ngoài cửa sổ +-4 ngày. Phải cảnh báo
          // riêng, KHÔNG được để lẫn với "đã lưu sạch".
          if (planDenied || actDenied) {
            const savedParts: string[] = [];
            if (planApplied) savedParts.push("Plan đã lưu");
            if (actApplied) savedParts.push("Actual đã lưu");
            const deniedParts: string[] = [];
            if (planDenied) deniedParts.push("Plan bị từ chối");
            if (actDenied) deniedParts.push("Actual bị từ chối");
            const savedText = savedParts.length > 0 ? savedParts.join(", ") : "Không có field nào được lưu";
            rejected.push({
              congViecId: r.congviec_id,
              ngay: r.ngay,
              status: "partial",
              reason: `${savedText}, nhưng ${deniedParts.join(", ")}${r.reason ? ` (${r.reason})` : ""}.`,
            });
          }
        } else {
          rejected.push({ congViecId: r.congviec_id, ngay: r.ngay, status: r.status, reason: r.reason });
        }
      }

      if (appliedEntries.length > 0) {
        const appliedCongViecIds = Array.from(new Set(appliedEntries.map((e) => e.congViecId)));
        const refreshed = await getThucHien(supabase, appliedCongViecIds, thangDau, thangCuoi);
        const firstKey = cellKey(appliedEntries[0].congViecId, appliedEntries[0].ngay);
        const savedAt = refreshed[firstKey]?.updatedAt ?? new Date().toISOString();
        dispatch({ type: "markFieldsApplied", entries: appliedEntries, savedAt });
        // Có field được áp dụng thật -- báo cho NotificationBell tải lại (có
        // thể vừa xoá 1 mục "thiếu Plan/Actual" khỏi chuông). KHÔNG dispatch
        // nếu toàn bộ payload bị skipped/conflict (nhánh này không chạy tới).
        window.dispatchEvent(new Event(CHECKSHEET_SAVED_EVENT));
      }

      setRejectedCells(rejected);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không lưu được dữ liệu checksheet");
      if (blockedRejectedForCatch.length > 0) {
        setRejectedCells(blockedRejectedForCatch);
      }
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
  const todayIso = vnTodayIso();

  return (
    <div>
      {/* .no-print (print.css): ẩn toàn bộ phần điều khiển khi in, chỉ hiện
          bảng checksheet (.print-area bên dưới) -- xem nút "In". */}
      <p className="no-print mb-4 text-sm text-gray-500">
        Đăng nhập: {currentUser.hoTen}
        {currentUser.msnv ? ` (${currentUser.msnv})` : ""}
      </p>

      <div className={`no-print mb-4 flex flex-wrap items-end gap-3 ${ui.card}`}>
        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
          <label className={ui.label}>Xưởng</label>
          <select
            className={`w-full min-w-0 ${selectClass}`}
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

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
          <label className={ui.label}>Kíp</label>
          <select
            className={`w-full min-w-0 ${selectClass}`}
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

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
          <label className={ui.label}>Nhóm nhỏ</label>
          <select
            className={`w-full min-w-0 ${selectClass}`}
            value={nhom}
            onChange={(e) => handleNhomChange(e.target.value)}
          >
            <option value="">-- Tất cả --</option>
            {nhomOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
          <label className={ui.label}>Nhân viên phụ trách</label>
          <select
            className={`w-full min-w-0 ${selectClass}`}
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

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
          <label className={ui.label}>Thiết bị</label>
          <select
            className={`w-full min-w-0 ${selectClass}`}
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

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
          <label className={ui.label}>Tháng</label>
          <input
            type="month"
            className={`w-full min-w-0 ${selectClass}`}
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
          />
        </div>

        <button
          type="button"
          disabled={!canLoad || loading}
          onClick={handleLoad}
          className={`w-full sm:w-auto ${ui.buttonPrimary}`}
        >
          {loading ? "Đang tải..." : "Xem checksheet"}
        </button>
      </div>

      {loadError ? <p className={`no-print mb-3 ${ui.errorText}`}>{loadError}</p> : null}
      {saveError ? <p className={`no-print mb-3 ${ui.errorText}`}>{saveError}</p> : null}

      {rejectedCells.length > 0 ? (
        <div className="no-print mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">
            {rejectedCells.length} ô không được lưu (server từ chối hoặc cần xử lý riêng):
          </p>
          <ul className="list-inside list-disc">
            {rejectedCells.map((r, idx) => (
              <li key={`${r.congViecId}_${r.ngay}_${idx}`}>
                Ngày {Number(r.ngay.slice(8, 10))}, {r.congViecId}:{" "}
                {r.status === "conflict"
                  ? "Xung đột dữ liệu"
                  : r.status === "partial"
                    ? "Lưu một phần"
                    : "Bị từ chối"}{" "}
                — {r.reason ?? "Không rõ lý do"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showTable ? (
        <>
          <div className="no-print mb-3 flex items-center justify-between">
            <p className={`text-sm ${hasDirty ? "font-medium text-amber-700" : "text-gray-500"}`}>
              {hasDirty
                ? `${gridState.dirty.size} ô đã đổi, chưa lưu.`
                : "Không có thay đổi nào chưa lưu."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => window.print()} className={ui.buttonSecondary}>
                In
              </button>
              <button
                type="button"
                disabled={!hasDirty || saving}
                onClick={handleSave}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
          {/* .print-area (print.css): PHẦN DUY NHẤT còn hiển thị khi in --
              khối thông tin đầu trang + bảng chấm công A3 ngang, không kèm
              nút bấm/thông báo (những phần đó vẫn giữ .no-print riêng bên
              trong khối này). */}
          <div className="print-area">
            {selectedThietBi ? (
              <>
                {/* Bản in: khối đầu trang dạng bảng có viền + ảnh thiết bị
                    phóng to bên trái, khớp đúng cấu trúc mẫu giấy gốc --
                    CHỈ hiện khi in (`hidden print:flex`), độc lập với khối
                    thẻ tương tác bên dưới (ẩn khi in qua `no-print` -- màn
                    hình vẫn giữ dạng thẻ hiện tại, chỉ bản in cần khớp mẫu).
                    Ảnh + [bảng đầu trang + ChecksheetTable] nằm CHUNG 1 hàng
                    flex (items-stretch mặc định) để ảnh tự căng đúng chiều
                    cao TOÀN BỘ bảng hạng mục -- ChecksheetTable vì vậy phải
                    render THÊM 1 lần riêng ở đây cho bản in (bản còn lại bên
                    ngoài dành cho màn hình, ẩn khi in qua `print:hidden`). */}
                <div className="hidden items-stretch gap-3 print:flex">
                  {selectedThietBi.anhUrl && selectedThietBi.anhUrl.trim() !== "" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ảnh Google Drive bên ngoài, chỉ dùng khi in
                    <img
                      src={toDriveImageSrc(selectedThietBi.anhUrl.trim())}
                      alt={`Sơ đồ thiết bị ${selectedThietBi.tenThietBi}`}
                      className="w-64 shrink-0 border border-gray-400 object-contain"
                    />
                  ) : null}
                  <div className="flex flex-1 flex-col gap-3">
                    <table className="border-collapse border border-gray-400 text-center">
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
                            <p>Nhóm nhỏ: {selectedThietBi.nhom ?? ""}</p>
                            <p>Cụm: {selectedThietBi.cum ?? ""}</p>
                          </th>
                          <th className="border border-gray-400 px-2 py-1">Phòng/xưởng</th>
                          <th className="border border-gray-400 px-2 py-1">Khu vực</th>
                          <th className="border border-gray-400 px-2 py-1">Tên thiết bị</th>
                          <th className="border border-gray-400 px-2 py-1">Lãnh đạo xưởng</th>
                          <th className="border border-gray-400 px-2 py-1">Trưởng ca</th>
                          <th className="border border-gray-400 px-2 py-1">
                            Kế hoạch / Thực tế
                          </th>
                        </tr>
                        <tr>
                          <td className="border border-gray-400 px-2 py-1 font-semibold">
                            {selectedThietBi.xuong ?? ""}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 font-semibold">
                            {selectedThietBi.khuVuc ?? ""}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 font-semibold">
                            {selectedThietBi.tenThietBi}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 font-semibold">
                            {selectedThietBi.lanhDao ?? ""}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 font-semibold">
                            {selectedThietBi.truongCa ?? ""}
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
                      rows={rows}
                      thucHien={gridState.cells}
                      thangDau={thangDau}
                      thangCuoi={thangCuoi}
                      editability={editability}
                      todayIso={todayIso}
                      nguoiPhuTrachTen={selectedThietBi?.nguoiPhuTrachTen ?? null}
                      canManageCongViec={canManageDevice}
                      pendingCongViecIds={pendingCongViecIds}
                      onEditCongViec={(row) => handleOpenEditCongViec("edit", row)}
                      onRemoveCongViec={(row) => handleOpenEditCongViec("remove", row)}
                      onSetPlan={handleSetPlan}
                      onSetAct={handleSetAct}
                      onRequestBatThuong={handleRequestBatThuong}
                      selectedDay={selectedDay}
                      onSelectDay={handleSelectDay}
                      onAutoFillPlan={autoFillPlan}
                    />
                  </div>
                </div>
              <div className="no-print mb-3 rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AppLogo heightPx={40} />
                    <div>
                      <p className="text-sm font-semibold tracking-tight text-gray-900">
                        CHECKSHEET BƯỚC 3
                      </p>
                      <p className="text-xs text-gray-500">
                        Ngày lập: {todayIso.split("-").reverse().join("/")}
                      </p>
                    </div>
                  </div>
                  <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-8">
                    <InfoField label="Kíp" value={selectedThietBi.kip} />
                    <InfoField label="Nhóm nhỏ" value={selectedThietBi.nhom} />
                    <InfoField label="Cụm" value={selectedThietBi.cum} />
                    <InfoField label="Phòng/Xưởng" value={selectedThietBi.xuong} />
                    <InfoField label="Khu vực" value={selectedThietBi.khuVuc} />
                    <InfoField label="Tên thiết bị" value={selectedThietBi.tenThietBi} />
                    <InfoField label="Lãnh đạo xưởng" value={selectedThietBi.lanhDao} />
                    <InfoField label="Trưởng ca" value={selectedThietBi.truongCa} />
                  </dl>
                  <button
                    type="button"
                    className="shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                    onClick={() => setImageModalOpen(true)}
                    title="Bấm để phóng to ảnh sơ đồ thiết bị"
                  >
                    {selectedThietBi.anhUrl && selectedThietBi.anhUrl.trim() !== "" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ảnh Google Drive bên ngoài
                      <img
                        src={toDriveImageSrc(selectedThietBi.anhUrl.trim())}
                        alt={`Sơ đồ thiết bị ${selectedThietBi.tenThietBi}`}
                        className="h-28 w-36 object-contain"
                      />
                    ) : (
                      <div className="flex h-28 w-36 items-center justify-center text-center text-xs text-gray-400">
                        Chưa có ảnh
                      </div>
                    )}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-3 w-3 rounded-sm ${checksheetStyles.bgY}`} />
                    Kế hoạch
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-3 w-3 rounded-sm ${checksheetStyles.bgG}`} />
                    Thực tế tốt
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-3 w-3 rounded-sm ${checksheetStyles.bgR}`} />
                    Bất thường
                  </span>
                </div>
              </div>
              </>
            ) : null}
            {/* Bản màn hình: ẩn khi in (print:hidden) -- bản in dùng bản
                ChecksheetTable riêng bên trong khối hidden print:flex ở
                trên, để ảnh thiết bị căng đúng chiều cao toàn bộ bảng. */}
            <div className="print:hidden">
              <ChecksheetTable
                rows={rows}
                thucHien={gridState.cells}
                thangDau={thangDau}
                thangCuoi={thangCuoi}
                editability={editability}
                todayIso={todayIso}
                nguoiPhuTrachTen={selectedThietBi?.nguoiPhuTrachTen ?? null}
                canManageCongViec={canManageDevice}
                pendingCongViecIds={pendingCongViecIds}
                onEditCongViec={(row) => handleOpenEditCongViec("edit", row)}
                onRemoveCongViec={(row) => handleOpenEditCongViec("remove", row)}
                onSetPlan={handleSetPlan}
                onSetAct={handleSetAct}
                onRequestBatThuong={handleRequestBatThuong}
                selectedDay={selectedDay}
                onSelectDay={handleSelectDay}
                onAutoFillPlan={autoFillPlan}
              />
            </div>
          </div>
        </>
      ) : (
        <p className={`no-print p-8 text-center text-sm text-gray-500 ${ui.card}`}>
          Chọn Thiết bị và Tháng rồi bấm &quot;Xem checksheet&quot; để tải dữ liệu.
        </p>
      )}

      {batThuongTarget ? (
        <BatThuongModal
          open={!!batThuongTarget}
          congViecId={batThuongTarget.congViecId}
          ngay={batThuongTarget.ngay}
          onClose={() => setBatThuongTarget(null)}
          onSuccess={handleBatThuongSuccess}
        />
      ) : null}

      <EquipmentImageModal
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        anhUrl={selectedThietBi?.anhUrl ?? null}
        tenThietBi={selectedThietBi?.tenThietBi ?? ""}
      />

      <EditCongViecModal
        key={editTarget ? `${editTarget.mode}_${editTarget.target.congViecId}` : "none"}
        open={!!editTarget}
        mode={editTarget?.mode ?? "edit"}
        target={editTarget?.target ?? null}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEditCongViecSuccess}
      />
    </div>
  );
}
