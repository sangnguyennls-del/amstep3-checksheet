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
 * Click vào vùng Plan: toggle Y/N (click 1 cái = Y, click lại = N).
 * Click vào vùng Actual: Task 4 mở rộng chu trình click thường thành
 * N -> G -> R -> N (Task 2 trước đó chỉ có N <-> G). Khi kết quả SẮP đổi
 * thành "R", KHÔNG dispatch `onSetAct` trực tiếp (khác Plan/Actual G/N vốn
 * OPTIMISTIC: tô ngay rồi Lưu sau) -- thay vào đó gọi `onRequestBatThuong` để
 * `ChecksheetApp` mở modal nhập mô tả bất thường; ô CHỈ thực sự chuyển sang
 * "R" sau khi modal gọi RPC `set_ket_qua_r_with_bat_thuong` thành công (xem
 * ChecksheetApp.tsx, action `applyBatThuong` ở gridReducer.ts). Vì vậy khi
 * next="R", `applyZone` trả về `null` (không có PaintOp) -- không bắt đầu
 * kéo-tô hàng loạt "R" qua nhiều ô (mỗi ô R cần 1 mô tả riêng, không thể áp
 * lại y hệt 1 giá trị cho nhiều ô như kéo-tô Plan/G/N).
 * Đổi NGƯỢC LẠI từ "R" về "N" (click tiếp trên 1 ô đang đỏ) vẫn đi qua
 * `onSetAct` bình thường -- đây là đổi khỏi "R", không phải đặt "R" mới, nên
 * không bị RPC `upsert_thuc_hien` chặn (chỉ chặn gửi ket_qua="R").
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
}: {
  congViecId: string;
  ngay: string;
  cell: ThucHienCell | undefined;
  editable: { plan: boolean; act: boolean };
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
      const nextKeHoach = !value.keHoach;
      onSetPlan(congViecId, ngay, nextKeHoach);
      return { kind: "plan", keHoach: nextKeHoach };
    } else {
      if (!editable.act) return null;
      // Chu trình N -> G -> R -> N.
      const nextKetQua: KetQua = value.ketQua === "N" ? "G" : value.ketQua === "G" ? "R" : "N";
      if (nextKetQua === "R") {
        // KHÔNG optimistic: chờ modal bất thường xác nhận RPC thành công rồi
        // mới đổi state (xem docstring hàm Cell).
        onRequestBatThuong(congViecId, ngay);
        return null;
      }
      onSetAct(congViecId, ngay, nextKetQua);
      return { kind: "act", ketQua: nextKetQua };
    }
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
