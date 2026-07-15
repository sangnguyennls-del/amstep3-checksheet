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
      <span className="text-sm text-gray-500">Chế độ tô:</span>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map(({ mode, nhan, oMau, moTa }) => {
          const dangChon = value === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={dangChon}
              title={moTa}
              onClick={() => onChange(mode)}
              // min-h-10: vùng chạm đủ lớn trên điện thoại (quy tắc CLAUDE.md).
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                dangChon
                  ? "border-gray-900 bg-gray-900 font-medium text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-sm border border-gray-400 ${oMau}`} />
              {nhan}
            </button>
          );
        })}
      </div>
    </div>
  );
}
