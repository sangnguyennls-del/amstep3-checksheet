"use client";

import { useRef } from "react";
import type { KetQua, ThucHienCell } from "@/lib/checksheet/types";
import { isWithinActWindow } from "@/lib/checksheet/actWindow";
import styles from "./checksheet.module.css";

const EMPTY_CELL: ThucHienCell = { id: null, keHoach: false, ketQua: "N", updatedAt: null };

/** 1 thao tác tô: hoặc đổi Plan, hoặc đổi Actual -- dùng để lặp lại khi kéo-tô. */
export type PaintOp =
  | { kind: "plan"; keHoach: boolean }
  | { kind: "act"; ketQua: KetQua };

/**
 * Chế độ tô do thanh công cụ chọn (ChecksheetApp) -- THAY cho chu trình bấm
 * vòng cũ `N -> G -> R -> N`.
 *
 * Vì sao bỏ chu trình: từ "G" bấm tiếp sẽ ra "R", mà "R" bắt buộc mở modal nhập
 * mô tả và KHÔNG đổi state nếu người dùng bấm Huỷ -> ô kẹt ở "G", không có
 * đường nào về ô trống nếu không tạo một bất thường GIẢ (bảng bat_thuong giữ
 * lịch sử, không xoá -> rác vĩnh viễn). Đây là ngõ cụt, không chỉ chậm.
 *
 * "G" = tô xanh, "R" = ghi nhận bất thường, "N" = xoá ô về trống.
 */
export type PaintMode = "G" | "R" | "N";

function planClass(keHoach: boolean): string {
  return keHoach ? styles.bgY : styles.bgN;
}

function actClass(ketQua: KetQua): string {
  if (ketQua === "G") return styles.bgG;
  if (ketQua === "R") return styles.bgR;
  return styles.bgN;
}

/**
 * 1 ô ngày trên lưới checksheet, chia chéo Plan (tam giác trên-phải)/Actual
 * (tam giác dưới-trái), port từ `ChecksheetCell` (class) của hệ GAS cũ -- xem
 * CLAUDE.md "Client-side structure". Vùng click xác định bằng công thức y hệt
 * hệ cũ: lấy `getBoundingClientRect()` của ô, x,y = toạ độ con trỏ trừ góc
 * trên-trái, `isPlanZone = x*h > y*w` (w,h = width/height của ô).
 *
 * Click vào vùng Plan: toggle Y/N (click 1 cái = Y, click lại = N) -- TRỪ chế
 * độ tô "N" (Xoá) thì luôn đặt về N.
 * Click vào vùng Actual: đặt thẳng giá trị theo `paintMode` (xem PaintMode) --
 * KHÔNG còn bấm vòng N->G->R->N.
 *
 * Riêng "R" giữ nguyên cơ chế KHÔNG optimistic (khác Plan/Actual G/N vốn tô
 * ngay rồi Lưu sau): gọi `onRequestBatThuong` để `ChecksheetApp` mở modal nhập
 * mô tả; ô CHỈ thực sự chuyển sang "R" sau khi modal gọi RPC
 * `set_ket_qua_r_with_bat_thuong` thành công (xem action `applyBatThuong` ở
 * gridReducer.ts). Vì vậy nhánh R trả `null` (không có PaintOp) -- không kéo-tô
 * hàng loạt "R" (mỗi ô R cần 1 mô tả riêng).
 * Đặt "N" lên 1 ô đang "R" vẫn đi qua `onSetAct` bình thường -- đây là đổi KHỎI
 * "R", không phải đặt "R" mới, nên không bị RPC `upsert_thuc_hien` chặn (chỉ
 * chặn gửi ket_qua="R").
 */
export function Cell({
  congViecId,
  ngay,
  cell,
  editable,
  todayIso,
  onSetPlan,
  onSetAct,
  onRequestBatThuong,
  onPaintStart,
  onPaintEnter,
  onSelectDay,
  paintMode = "G",
}: {
  congViecId: string;
  ngay: string;
  cell: ThucHienCell | undefined;
  editable: { plan: boolean; act: boolean };
  /** Chế độ tô đang chọn trên thanh công cụ. Mặc định "G" để PrintSheet/
   * BatchPrint (bản in, không tương tác) không phải truyền. */
  paintMode?: PaintMode;
  /** Hôm nay (ISO, "YYYY-MM-DD") -- dùng cùng `isWithinActWindow` CHỈ để tô
   * nhạt/gợi ý vùng Actual ngoài cửa sổ +-4 ngày, KHÔNG chặn click (quyết
   * định thật là status trả về từ upsert_thuc_hien, xem actWindow.ts). */
  todayIso: string;
  onSetPlan: (congViecId: string, ngay: string, keHoach: boolean) => void;
  onSetAct: (congViecId: string, ngay: string, ketQua: KetQua) => void;
  /** Task 4: yêu cầu mở modal ghi nhận bất thường cho đúng ô này -- gọi khi
   * chu trình Actual sắp đổi thành "R" (xem docstring hàm Cell ở trên). */
  onRequestBatThuong: (congViecId: string, ngay: string) => void;
  onPaintStart: (op: PaintOp) => void;
  onPaintEnter: () => void;
  /** Ghi nhận "ngày vừa bấm trong hàng này" -- dùng làm mốc bắt đầu cho nút
   * P4/P8 auto-fill của hàng (xem ChecksheetApp.autoFillPlan). */
  onSelectDay?: (congViecId: string, ngay: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const value = cell ?? EMPTY_CELL;

  function isPlanZone(e: { clientX: number; clientY: number }): boolean {
    const rect = ref.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    return x * h > y * w;
  }

  function applyZone(planZone: boolean): PaintOp | null {
    if (planZone) {
      if (!editable.plan) return null;
      // Chế độ Xoá xoá cả vùng Kế hoạch (đúng nghĩa "xoá ô"); các chế độ khác
      // giữ bật/tắt Y/N như cũ -- Plan chỉ có 2 trạng thái nên không có ngõ cụt.
      const nextKeHoach = paintMode === "N" ? false : !value.keHoach;
      onSetPlan(congViecId, ngay, nextKeHoach);
      return { kind: "plan", keHoach: nextKeHoach };
    }

    if (!editable.act) return null;

    if (paintMode === "R") {
      // Ô đã đỏ rồi thì KHÔNG mở modal lần nữa: bat_thuong.thuchien_id là
      // UNIQUE (0-1 bản ghi/ô) nên ghi nhận lần 2 trên cùng ô sẽ lỗi DB. Chu
      // trình bấm vòng cũ không bao giờ đi R->R nên chưa từng lộ ra.
      if (value.ketQua === "R") return null;
      // KHÔNG optimistic: chờ modal xác nhận RPC thành công rồi mới đổi state
      // (xem docstring hàm Cell).
      onRequestBatThuong(congViecId, ngay);
      return null;
    }

    const nextKetQua: KetQua = paintMode;
    onSetAct(congViecId, ngay, nextKetQua);
    return { kind: "act", ketQua: nextKetQua };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    onSelectDay?.(congViecId, ngay);
    const op = applyZone(isPlanZone(e));
    if (op) onPaintStart(op);
  }

  // Không tự gate theo 1 trạng thái "đang tô" cục bộ ở đây -- Table giữ
  // isPaintingRef làm nguồn chân lý duy nhất (ref không kích hoạt re-render
  // nên không thể truyền xuống Cell làm prop phản ứng được); Table tự quyết
  // định có áp lại thao tác hay không bên trong onPaintEnter.
  function handlePointerEnter() {
    onPaintEnter();
  }

  // Chỉ áp dụng gợi ý "ngoài cửa sổ +-4 ngày" cho vùng Actual -- Plan không
  // có quy tắc cửa sổ ngày này (xem actWindow.ts).
  const outOfActWindow = !isWithinActWindow(ngay, todayIso);
  const actClassName = `${styles.triAct} ${actClass(value.ketQua)}${
    outOfActWindow ? ` ${styles.actDimmed}` : ""
  }`;

  // Tooltip vùng Actual: CHỈ đọc mô tả bất thường khi ô THẬT SỰ đang ở
  // ketQua="R" (Task 4) -- các trạng thái khác giữ gợi ý cửa sổ +-4 ngày cũ
  // (Task 3), không được lẫn 2 loại tooltip này với nhau.
  const actTitle =
    value.ketQua === "R"
      ? (value.batThuongMoTa ?? "Bất thường (chưa có mô tả)")
      : outOfActWindow
        ? "Ngoài cửa sổ +-4 ngày cho Actual -- có thể bị server từ chối"
        : undefined;

  return (
    // `day-cell` là class GLOBAL (không hash) để print.css thu nhỏ ô trong
    // bản in (.print-sheet) -- CSS module .dayCell có min-width 32px cứng
    // từng khiến bảng in không co lại được (bị cắt ở ~cột ngày 25).
    <div
      ref={ref}
      className={`${styles.dayCell} day-cell`}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
    >
      <div className={`${styles.triPlan} ${planClass(value.keHoach)}`} />
      <div className={actClassName} title={actTitle} />
    </div>
  );
}
