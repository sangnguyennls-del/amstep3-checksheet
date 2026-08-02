"use client";

import { useMemo, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCongViecRows, getThucHien, parseNhanVienMsnv } from "@/lib/checksheet/queries";
import { getEditability, type EditabilityMap } from "@/lib/checksheet/editability";
import { gridReducer, initialGridState } from "@/lib/checksheet/gridReducer";
import { CHECKSHEET_SAVED_EVENT } from "@/lib/checksheet/notifications";
import { getViecChuaLam, type ViecChuaLam } from "@/lib/checksheet/nhacViec";
import { cellKey, type CongViecRow, type FilterOptions, type KetQua } from "@/lib/checksheet/types";
import { vnTodayIso } from "@/lib/checksheet/vnDate";
import { defaultIfAvailable, formatThietBiLabel } from "@/lib/filters";
import { ui } from "@/lib/ui";
import { AppLogo } from "@/components/AppLogo";
import { SearchableSelect } from "@/components/SearchableSelect";
import { ChecksheetTable, listDaysInRange } from "./ChecksheetTable";
import type { PaintMode } from "./Cell";
import { LanCapNhatCuoi } from "./LanCapNhatCuoi";
import { NhacViecModal } from "./NhacViecModal";
import { PaintModeBar } from "./PaintModeBar";
import { PrintSheet } from "./PrintSheet";
import { buildPrintTitle, fitPrintSheetToPage } from "./printFit";
import { BatThuongModal } from "./BatThuongModal";
import { EditCongViecModal, type EditCongViecResult, type EditCongViecTarget } from "./EditCongViecModal";
import { EquipmentImageModal, toDriveImageSrc } from "./EquipmentImageModal";
import { ThemHangMucModal } from "./ThemHangMucModal";
import { LichSuThietBiModal } from "./LichSuThietBiModal";
import {
  getThietBiCauHinh,
  getThietBiChamCong,
  type CauHinhRow,
  type ChamCongRow,
} from "@/lib/checksheet/thietBiLichSu";
import { chiTietOptions } from "@/lib/checksheet/chiTietOptions";
import checksheetStyles from "./checksheet.module.css";
import "./print.css";

type ThietBiOption = FilterOptions["thietBi"][number];

/**
 * 1 ô nhãn/giá trị trong khối thông tin đầu trang (đúng bố cục mẫu giấy).
 * Phong cách bản GAS cũ: nhãn CHỮ HOA nhỏ kèm icon, giá trị in đậm bên dưới;
 * `accent` tô xanh cho giá trị cần nổi bật (mã thiết bị) -- xem DESIGN.md.
 */
function InfoField({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string | null | undefined;
  icon?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-[#6c757d] uppercase">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {label}
      </dt>
      <dd className={`text-sm font-semibold ${accent ? "text-[#0d6efd]" : "text-[#212529]"}`}>
        {value || "-"}
      </dd>
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
  // trách ít nhất 1 thiết bị khớp Xưởng/Nhóm nhỏ đã mặc định -- nếu không,
  // mặc định về msnv sẽ lọc rỗng toàn bộ danh sách thiết bị (đa số user
  // thường không phải nguoi_phu_trach của thiết bị nào).
  //
  // Fix mục 3: mặc định từ hồ sơ CHỈ được áp khi giá trị đó thực sự có trong
  // dữ liệu thiết bị (defaultIfAvailable) -- hồ sơ lệch format/chưa có dữ
  // liệu tương ứng thì về "Tất cả" thay vì lọc rỗng cả danh sách.
  //
  // Mục 6: bỏ hẳn bộ lọc Kíp -- Kíp chỉ còn phục vụ phạm vi duyệt đề xuất và
  // lịch ca (pha 2), không tham gia cascade lọc checksheet nữa.
  const initialXuong = defaultIfAvailable(
    currentUser.xuong,
    filterOptions.thietBi.map((tb) => tb.xuong),
  );
  const initialNhom = defaultIfAvailable(
    currentUser.nhom,
    filterOptions.thietBi.map((tb) => tb.nhom),
  );
  const [xuong, setXuong] = useState(initialXuong);
  const [nhom, setNhom] = useState(initialNhom);
  const [nhanVienMsnv, setNhanVienMsnv] = useState(() => {
    if (!currentUser.msnv) return "";
    const isOwnerOfSomeDevice = filterOptions.thietBi.some(
      (tb) =>
        (!initialXuong || tb.xuong === initialXuong) &&
        (!initialNhom || tb.nhom === initialNhom) &&
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
  // Đợt 6 (item 1a): snapshot giá trị TRƯỚC khi lưu của các ô vừa lưu -> cho
  // phép "Hoàn tác lần lưu vừa rồi" (chỉ trong phiên, chỉ lần gần nhất). Bị xóa
  // khi người dùng bắt đầu chỉnh sửa tiếp hoặc tải lại lưới.
  const [lastUndo, setLastUndo] = useState<
    { congViecId: string; ngay: string; keHoach: boolean; ketQua: KetQua }[]
  >([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rejectedCells, setRejectedCells] = useState<RejectedCell[]>([]);
  // Chế độ tô cho vùng Thực tế (thanh PaintModeBar) -- thay chu trình bấm vòng
  // N->G->R->N cũ vốn làm ô kẹt ở "G" (xem PaintMode trong Cell.tsx). Mặc định
  // "G" vì tô xanh là thao tác thường dùng nhất.
  const [paintMode, setPaintMode] = useState<PaintMode>("G");
  // Popup nhắc việc chưa thực hiện -- tính 1 lần trong handleLoad (mỗi lần load
  // 1 thiết bị/tháng), không đặt trong useEffect để không bật lại mỗi re-render.
  const [nhacViec, setNhacViec] = useState<ViecChuaLam[]>([]);
  const [nhacViecOpen, setNhacViecOpen] = useState(false);
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
    mode: "edit" | "remove" | "restore";
    target: EditCongViecTarget;
  } | null>(null);
  // Việc 2: congViecId nào đang có đề xuất "Chờ duyệt" -- ẩn nút Sửa/Xoá +
  // hiện badge cho dòng đó (tránh đề xuất trùng), tải lại mỗi khi load
  // checksheet hoặc ngay sau khi 1 đề xuất mới được tạo.
  const [pendingCongViecIds, setPendingCongViecIds] = useState<Set<string>>(new Set());
  // Đợt 6 (item 1b): map displayCongViecId -> de_xuat id CHỈ với đề xuất do
  // CHÍNH người đang đăng nhập gửi (để hiện nút "Hủy" đúng chỗ; RPC huy_de_xuat
  // vẫn tự chặn người khác).
  const [pendingCancelByDisplayId, setPendingCancelByDisplayId] = useState<Map<string, string>>(
    new Map(),
  );
  // Task C: modal "Đề xuất thêm hạng mục" mở từ nút trên checksheet.
  const [themOpen, setThemOpen] = useState(false);
  // #3: modal "Lịch sử thay đổi thiết bị" -- nạp dữ liệu lúc bấm (trong onClick,
  // KHÔNG dùng useEffect) để tránh lint set-state-in-effect; modal chỉ hiển thị.
  const [lichSuOpen, setLichSuOpen] = useState(false);
  const [cauHinhRows, setCauHinhRows] = useState<CauHinhRow[]>([]);
  const [chamCongRows, setChamCongRows] = useState<ChamCongRow[]>([]);
  const [lichSuLoading, setLichSuLoading] = useState(false);
  const [lichSuError, setLichSuError] = useState<string | null>(null);

  // Cascading: thu hẹp thietBi theo các lựa chọn cấp cao hơn đã chọn --
  // đúng thuật toán hệ cũ (App.applyFilters trong Javascript.html): lọc mảng
  // thietBi theo các trường đã chọn, distinct lại cho từng cấp dropdown kế
  // tiếp. Cascade sau mục 6: Xưởng -> Nhóm nhỏ -> Nhân viên -> Thiết bị.
  const thietBiAfterXuong = useMemo(
    () => filterOptions.thietBi.filter((tb) => !xuong || tb.xuong === xuong),
    [filterOptions.thietBi, xuong],
  );

  const nhomOptions = useMemo(
    () =>
      Array.from(
        new Set(thietBiAfterXuong.map((tb) => tb.nhom).filter((v): v is string => !!v)),
      ).sort(),
    [thietBiAfterXuong],
  );

  const thietBiAfterNhom = useMemo(
    () => thietBiAfterXuong.filter((tb) => !nhom || tb.nhom === nhom),
    [thietBiAfterXuong, nhom],
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
  // thêm ở client ngoài .in() để giới hạn đúng phạm vi đang xem.
  //
  // Mục 1 (0016): đề xuất được canonical hoá về PHIÊN BẢN MỚI NHẤT của công
  // việc -- lưới tháng cũ có thể đang hiển thị id phiên bản cũ (đã có
  // thay_the_boi), nên phải query cả id kế nhiệm rồi map ngược về id đang
  // hiển thị để badge "Chờ duyệt" hiện đúng dòng.
  async function refreshPendingCongViec(congViecRows: CongViecRow[]) {
    if (congViecRows.length === 0) {
      setPendingCongViecIds(new Set());
      setPendingCancelByDisplayId(new Map());
      return;
    }
    // map: id (hiển thị hoặc kế nhiệm) -> id đang hiển thị trên lưới
    const displayIdByQueryId = new Map<string, string>();
    for (const r of congViecRows) {
      displayIdByQueryId.set(r.congViecId, r.congViecId);
      if (r.thayTheBoi) displayIdByQueryId.set(r.thayTheBoi, r.congViecId);
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("de_xuat_congviec")
      .select("id, congviec_id, nguoi_de_xuat")
      .eq("trang_thai", "Chờ duyệt")
      .in("congviec_id", Array.from(displayIdByQueryId.keys()));
    const ids = new Set<string>();
    const cancel = new Map<string, string>();
    for (const r of data ?? []) {
      const displayId = displayIdByQueryId.get(r.congviec_id as string);
      if (!displayId) continue;
      ids.add(displayId);
      // Chỉ cho hủy đề xuất do chính mình gửi.
      if (currentUser.msnv && r.nguoi_de_xuat === currentUser.msnv) {
        cancel.set(displayId, r.id as string);
      }
    }
    setPendingCongViecIds(ids);
    setPendingCancelByDisplayId(cancel);
  }

  // Đợt 6 (item 1b): người gửi tự hủy đề xuất đang chờ (gọi RPC trực tiếp như
  // các thao tác checksheet khác), rồi nạp lại pending.
  async function handleHuyDeXuat(deXuatId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("huy_de_xuat", { p_de_xuat_id: deXuatId });
    if (error) {
      setSaveError(error.message);
      return;
    }
    await refreshPendingCongViec(rows);
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
        refreshPendingCongViec(congViecRows),
      ]);
      setRows(congViecRows);
      dispatch({ type: "load", cells: map });
      setEditability(editabilityMap);
      setSelectedDay(null);
      setLoadedFor(`${thietBiId}_${monthValue}`);

      // Nhắc việc: CHỈ nhắc đúng người phụ trách thiết bị (admin/người khác xem
      // hộ thì không bị làm phiền) và chỉ khi còn việc đã tới hạn mà chưa tô
      // xanh trong cửa sổ 4 ngày -- xem getViecChuaLam. Tháng cũ tự nhiên không
      // có việc nào lọt điều kiện nên không popup.
      const thietBi = filterOptions.thietBi.find((tb) => tb.id === thietBiId);
      const laNguoiPhuTrach =
        !!currentUser.msnv && !!thietBi && thietBi.nguoiPhuTrach === currentUser.msnv;
      const viec = laNguoiPhuTrach
        ? getViecChuaLam(congViecRows, map, vnTodayIso(), listDaysInRange(thangDau, thangCuoi))
        : [];
      setNhacViec(viec);
      setNhacViecOpen(viec.length > 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được dữ liệu checksheet");
    } finally {
      setLoading(false);
    }
  }

  function handleSetPlan(congViecId: string, ngay: string, keHoach: boolean) {
    setLastUndo([]); // chỉnh sửa mới -> snapshot hoàn tác cũ không còn hợp lệ
    dispatch({ type: "setPlan", congViecId, ngay, keHoach });
  }

  function handleSetAct(congViecId: string, ngay: string, ketQua: KetQua) {
    setLastUndo([]);
    dispatch({ type: "setAct", congViecId, ngay, ketQua });
  }

  // Đợt 6 (item 1a): hoàn tác lần lưu vừa rồi -> ghi lại các ô về giá trị TRƯỚC
  // khi lưu (RPC upsert_thuc_hien), rồi tải lại lưới từ DB (đã revert).
  async function handleUndoLastSave() {
    if (lastUndo.length === 0 || saving) return;
    const undo = lastUndo;
    setLastUndo([]);
    setSaveError(null);
    const supabase = createClient();
    const payload = undo.map((u) => ({
      congviec_id: u.congViecId,
      ngay: u.ngay,
      ke_hoach: u.keHoach,
      ket_qua: u.ketQua,
      expected_updated_at: null,
    }));
    const { error } = await supabase.rpc("upsert_thuc_hien", { payload });
    if (error) {
      setSaveError(`Không hoàn tác được: ${error.message}`);
      return;
    }
    await handleLoad();
    window.dispatchEvent(new Event(CHECKSHEET_SAVED_EVENT));
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
  function handleOpenEditCongViec(mode: "edit" | "remove" | "restore", row: CongViecRow) {
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
  // THÀNH CÔNG. Mục 1 (0016): thay đổi có hiệu lực từ ĐẦU THÁNG SAU -- tháng
  // đang xem GIỮ NGUYÊN dòng + giá trị cũ, nên KHÔNG mutate/lọc `rows` tại
  // chỗ như trước; chỉ tải lại danh sách congviec để dòng vừa đổi nhận
  // hieu_luc_den/thay_the_boi mới (hiện badge "từ tháng sau", ẩn Sửa/Xoá).
  // Không đụng gridState -- các ô đã tô nhưng chưa Lưu không bị mất.
  async function reloadRowsAfterCongViecChange() {
    try {
      const supabase = createClient();
      const { thangDau, thangCuoi } = monthRange(monthValue);
      const congViecRows = await getCongViecRows(supabase, thietBiId, thangDau, thangCuoi);
      setRows(congViecRows);
      await refreshPendingCongViec(congViecRows);
    } catch {
      // Lỗi mạng khi refresh phụ: giữ nguyên rows cũ (giá trị hiển thị vẫn
      // đúng cho tháng này), lần "Xem checksheet" kế tiếp sẽ đồng bộ lại.
    }
  }

  function handleEditCongViecSuccess(result: EditCongViecResult) {
    if (!result.applied) {
      // Việc 2: người phụ trách (không phải admin) vừa tạo đề xuất "Chờ
      // duyệt" -- công việc CHƯA đổi thật sự, chỉ đánh dấu pending để hiện
      // badge + ẩn nút Sửa/Xoá (tránh đề xuất trùng), không mutate `rows`.
      setPendingCongViecIds((prev) => new Set(prev).add(result.congViecId));
      setEditTarget(null);
      return;
    }
    setEditTarget(null);
    void reloadRowsAfterCongViecChange();
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
        // Item 1a: chụp giá trị TRƯỚC khi lưu (gridState.initial vẫn là giá trị
        // cũ ở closure này, trước khi markFieldsApplied đồng bộ initial). Bỏ ô
        // có giá trị cũ = 'R' (không lưu lại được qua nút Lưu thường).
        const undoSnapshot = appliedEntries
          .map((e) => {
            const before = gridState.initial[cellKey(e.congViecId, e.ngay)];
            return {
              congViecId: e.congViecId,
              ngay: e.ngay,
              keHoach: before?.keHoach ?? false,
              ketQua: (before?.ketQua ?? "N") as KetQua,
            };
          })
          .filter((u) => u.ketQua !== "R");
        setLastUndo(undoSnapshot);
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

  // Mục 8: nút "In" -- đặt document.title = tên file PDF mặc định
  // (Checksheet-<mã>-<MMyyyy>), thu bản in vừa 1 trang A3 rồi mới mở hộp
  // thoại in; khôi phục title cũ sau khi hộp thoại đóng (window.print()
  // chặn tới lúc đó trên các trình duyệt desktop).
  function handlePrint() {
    const prevTitle = document.title;
    if (selectedThietBi) {
      document.title = buildPrintTitle(selectedThietBi.maThietBi, monthValue);
    }
    fitPrintSheetToPage();
    window.print();
    document.title = prevTitle;
  }

  // #3: nạp lịch sử thay đổi của thiết bị đang chọn rồi mở modal (fetch ở đây,
  // không dùng effect trong modal).
  async function handleOpenLichSu() {
    if (!selectedThietBi) return;
    setLichSuOpen(true);
    setLichSuLoading(true);
    setLichSuError(null);
    try {
      const supabase = createClient();
      const [cauHinh, chamCong] = await Promise.all([
        getThietBiCauHinh(supabase, selectedThietBi.id),
        getThietBiChamCong(supabase, selectedThietBi.id),
      ]);
      setCauHinhRows(cauHinh);
      setChamCongRows(chamCong);
    } catch (e) {
      setLichSuError(e instanceof Error ? e.message : "Không tải được lịch sử");
    } finally {
      setLichSuLoading(false);
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

      {/* Mục 11: mọi bộ lọc dùng SearchableSelect (gõ-tìm không dấu) thay
          <select> thuần -- danh sách nhân viên/thiết bị dài, thao tác trên
          điện thoại nhanh hơn hẳn. */}
      <div className={`no-print mb-4 flex flex-wrap items-end gap-3 ${ui.card}`}>
        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-44">
          <label className={ui.label}>Xưởng</label>
          <SearchableSelect
            value={xuong}
            onChange={handleXuongChange}
            options={filterOptions.xuong.map((x) => ({ value: x, label: x }))}
          />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-36">
          <label className={ui.label}>Nhóm nhỏ</label>
          <SearchableSelect
            value={nhom}
            onChange={handleNhomChange}
            options={nhomOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-56">
          <label className={ui.label}>Nhân viên phụ trách</label>
          <SearchableSelect
            value={nhanVienMsnv}
            onChange={handleNhanVienChange}
            options={nhanVienOptions.map((display) => ({
              value: parseNhanVienMsnv(display),
              label: display,
            }))}
          />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-1 sm:w-64">
          <label className={ui.label}>Thiết bị</label>
          <SearchableSelect
            value={thietBiId}
            onChange={setThietBiId}
            placeholder="-- Chọn thiết bị --"
            options={thietBiAfterNhanVien.map((tb) => ({
              value: tb.id,
              label: formatThietBiLabel(tb.maThietBi, tb.tenThietBi),
            }))}
          />
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
          <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3">
            <PaintModeBar value={paintMode} onChange={setPaintMode} />
            <p className={`text-sm ${hasDirty ? "font-medium text-amber-700" : "text-gray-500"}`}>
              {hasDirty
                ? `${gridState.dirty.size} ô đã đổi, chưa lưu.`
                : "Không có thay đổi nào chưa lưu."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={handleOpenLichSu} className={ui.buttonSecondary}>
                Lịch sử thay đổi
              </button>
              <button type="button" onClick={handlePrint} className={ui.buttonSecondary}>
                In
              </button>
              {/* Item 1a: hoàn tác lần lưu vừa rồi (chỉ hiện khi vừa lưu xong,
                  chưa chỉnh sửa gì thêm). */}
              {lastUndo.length > 0 && !hasDirty ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleUndoLastSave}
                  title="Ghi lại các ô vừa lưu về giá trị trước đó"
                  className="inline-flex items-center justify-center rounded-md border border-amber-400 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↩ Hoàn tác lần lưu
                </button>
              ) : null}
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
                {/* Bản in (mục 8): PrintSheet render off-screen trên màn hình
                    (đo được kích thước thật để thu vừa 1 trang A3 -- xem
                    printFit.ts), là phần duy nhất hiện ra khi in. Dùng chung
                    với in hàng loạt ở /admin/stats. */}
                <PrintSheet
                  thietBi={selectedThietBi}
                  rows={rows}
                  thucHien={gridState.cells}
                  thangDau={thangDau}
                  thangCuoi={thangCuoi}
                  todayIso={todayIso}
                />
              <div className="no-print mb-3 rounded-lg border border-[#dee2e6] bg-white p-4">
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
                  {/* Mục 10: bỏ "Kíp" (chỉ phục vụ lịch ca), thêm "Người chịu
                      trách nhiệm" lên cùng hàng với Khu vực/Trưởng ca -- cột
                      tương ứng trong bảng lưới đã bỏ (ChecksheetTable). */}
                  <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-8">
                    <InfoField icon="▦" label="Nhóm nhỏ" value={selectedThietBi.nhom} />
                    <InfoField icon="⬚" label="Cụm" value={selectedThietBi.cum} />
                    <InfoField icon="🏭" label="Phòng/Xưởng" value={selectedThietBi.xuong} />
                    <InfoField icon="📍" label="Khu vực" value={selectedThietBi.khuVuc} />
                    <InfoField
                      icon="⚙"
                      label="Tên thiết bị"
                      value={selectedThietBi.tenThietBi}
                      accent
                    />
                    <InfoField icon="👤" label="Lãnh đạo xưởng" value={selectedThietBi.lanhDao} />
                    <InfoField icon="👤" label="Trưởng ca" value={selectedThietBi.truongCa} />
                    <InfoField
                      icon="👤"
                      label="Người chịu trách nhiệm"
                      value={selectedThietBi.nguoiPhuTrachTen}
                    />
                  </dl>
                  <button
                    type="button"
                    className="shrink-0 overflow-hidden rounded-md border border-[#dee2e6] bg-gray-50"
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
                canManageCongViec={canManageDevice}
                pendingCongViecIds={pendingCongViecIds}
                pendingCancelByDisplayId={pendingCancelByDisplayId}
                onHuyDeXuat={handleHuyDeXuat}
                onEditCongViec={(row) => handleOpenEditCongViec("edit", row)}
                onRemoveCongViec={(row) => handleOpenEditCongViec("remove", row)}
                onRestoreCongViec={(row) => handleOpenEditCongViec("restore", row)}
                onSetPlan={handleSetPlan}
                onSetAct={handleSetAct}
                onRequestBatThuong={handleRequestBatThuong}
                selectedDay={selectedDay}
                onSelectDay={handleSelectDay}
                onAutoFillPlan={autoFillPlan}
                paintMode={paintMode}
              />
              <LanCapNhatCuoi thucHien={gridState.cells} />
              {canManageDevice ? (
                <button
                  type="button"
                  onClick={() => setThemOpen(true)}
                  className="no-print mt-2 rounded-md border border-[#0d6efd] px-3 py-2 text-sm font-medium text-[#0d6efd] hover:bg-[#0d6efd]/5"
                >
                  + Đề xuất thêm hạng mục
                </button>
              ) : null}
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

      <NhacViecModal
        open={nhacViecOpen}
        viec={nhacViec}
        onClose={() => setNhacViecOpen(false)}
      />

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
        isAdmin={isAdminRole}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEditCongViecSuccess}
      />

      {themOpen ? (
        <ThemHangMucModal
          open={themOpen}
          thietBiId={selectedThietBi?.id ?? null}
          chiTietList={chiTietOptions(rows)}
          isAdmin={isAdminRole}
          onClose={() => setThemOpen(false)}
        />
      ) : null}

      <LichSuThietBiModal
        open={lichSuOpen}
        tenThietBi={selectedThietBi?.tenThietBi ?? ""}
        cauHinhRows={cauHinhRows}
        chamCongRows={chamCongRows}
        loading={lichSuLoading}
        error={lichSuError}
        onClose={() => setLichSuOpen(false)}
      />
    </div>
  );
}
