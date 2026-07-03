"use client";

import { useRef } from "react";
import type { KetQua, ThucHienCell } from "@/lib/checksheet/types";
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
 * Click vào vùng Actual: cycle N -> G -> N bằng click thường -- Task 2 KHÔNG
 * có UI nào tạo ra ketQua="R" (R chỉ set qua modal bất thường ở Task 4), dù
 * `onSetAct` bên dưới vẫn nhận được ketQua="R" về mặt kỹ thuật vì Task 4 sẽ
 * tái dùng đúng action `setAct` này.
 */
export function Cell({
  congViecId,
  ngay,
  cell,
  editable,
  onSetPlan,
  onSetAct,
  onPaintStart,
  onPaintEnter,
  onSelectDay,
}: {
  congViecId: string;
  ngay: string;
  cell: ThucHienCell | undefined;
  editable: { plan: boolean; act: boolean };
  onSetPlan: (congViecId: string, ngay: string, keHoach: boolean) => void;
  onSetAct: (congViecId: string, ngay: string, ketQua: KetQua) => void;
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
      const nextKetQua: KetQua = value.ketQua === "G" ? "N" : "G";
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

  return (
    <div
      ref={ref}
      className={styles.dayCell}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
    >
      <div className={`${styles.triPlan} ${planClass(value.keHoach)}`} />
      <div className={`${styles.triAct} ${actClass(value.ketQua)}`} />
    </div>
  );
}
