"use client";

// Thanh chọn chế độ tô cho vùng Thực tế của lưới checksheet -- THAY cho chu
// trình bấm vòng N -> G -> R -> N cũ (xem lý do ở PaintMode trong Cell.tsx:
// chu trình cũ làm ô kẹt ở "G", chỉ thoát được bằng cách tạo bất thường giả).

import type { PaintMode } from "./Cell";
import checksheetStyles from "./checksheet.module.css";

const MODES: { mode: PaintMode; nhan: string; oMau: string; moTa: string }[] = [
  {
    mode: "G",
    nhan: "Xanh",
    oMau: checksheetStyles.bgG,
    moTa: "Chạm ô để đánh dấu đã làm (kéo để tô nhiều ô)",
  },
  {
    mode: "R",
    nhan: "Đỏ",
    oMau: checksheetStyles.bgR,
    moTa: "Chạm ô để ghi nhận bất thường (phải nhập mô tả, không kéo-tô được)",
  },
  {
    mode: "N",
    nhan: "Xoá",
    oMau: checksheetStyles.bgN,
    moTa: "Chạm ô để xoá về trống (kéo để xoá nhiều ô)",
  },
];

export function PaintModeBar({
  value,
  onChange,
}: {
  value: PaintMode;
  onChange: (mode: PaintMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold tracking-wide text-[#6c757d] uppercase">Chế độ tô:</span>
      {/* btn-group kiểu Bootstrap: 3 nút liền khối, chỉ bo góc 2 đầu, viền giữa
          gộp bằng -ml-px (xem DESIGN.md). */}
      <div className="inline-flex" role="group">
        {MODES.map(({ mode, nhan, oMau, moTa }, i) => {
          const dangChon = value === mode;
          const dau = i === 0;
          const cuoi = i === MODES.length - 1;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={dangChon}
              title={moTa}
              onClick={() => onChange(mode)}
              // min-h-10: vùng chạm đủ lớn trên điện thoại (quy tắc CLAUDE.md).
              className={`inline-flex min-h-10 items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors focus:z-10 focus:ring-4 focus:ring-[#0d6efd]/25 focus:outline-none ${
                dau ? "rounded-l-md" : "-ml-px"
              } ${cuoi ? "rounded-r-md" : ""} ${
                dangChon
                  ? "z-10 border-[#0d6efd] bg-[#0d6efd] font-semibold text-white"
                  : "border-[#0d6efd] bg-white text-[#0d6efd] hover:bg-[#0d6efd]/10"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-sm border border-[#212529]/25 ${oMau}`} />
              {nhan}
            </button>
          );
        })}
      </div>
    </div>
  );
}
