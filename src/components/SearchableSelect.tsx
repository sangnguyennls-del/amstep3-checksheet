"use client";

// Mục 11: dropdown gõ-tìm dùng chung cho mọi bộ lọc (checksheet + quản trị)
// thay cho <select> thuần -- danh sách nhân viên/thiết bị dài khiến chọn bằng
// cuộn rất chậm, nhất là trên điện thoại ngoài hiện trường (quy tắc
// mobile-friendly trong .claude/CLAUDE.md).
//
// So khớp KHÔNG DẤU (stripDiacritics, lib/filters): gõ "khi nen" vẫn ra
// "Khí nén" -- bàn phím điện thoại gõ tiếng Việt có dấu chậm.
//
// Hành vi: bấm/focus mở danh sách; gõ để lọc; chọn bằng chạm/click hoặc
// ArrowUp/Down + Enter; Escape hoặc blur đóng lại và khôi phục nhãn đã chọn;
// nút x xoá lựa chọn (về "Tất cả"). Không dùng <datalist> vì hành vi giữa
// các trình duyệt di động không đồng nhất.

import { useId, useMemo, useRef, useState } from "react";
import { stripDiacritics } from "@/lib/filters";
import { ui } from "@/lib/ui";

export type SearchableOption = { value: string; label: string };

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "-- Tất cả --",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  /** Nhãn hiện khi chưa chọn gì (value="") -- cũng là lựa chọn "xoá lọc". */
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // null = đang KHÔNG gõ (input hiển thị nhãn của lựa chọn hiện tại);
  // string = chuỗi người dùng đang gõ để lọc.
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? (value || ""),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (query == null || query.trim() === "") return options;
    const q = stripDiacritics(query.trim());
    return options.filter((o) => stripDiacritics(o.label).includes(q));
  }, [options, query]);

  function openList() {
    setOpen(true);
    setHighlight(0);
  }

  function closeList() {
    setOpen(false);
    setQuery(null);
  }

  function select(newValue: string) {
    onChange(newValue);
    closeList();
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openList();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight].value);
    } else if (e.key === "Escape") {
      closeList();
      inputRef.current?.blur();
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={`w-full min-w-0 pr-7 ${ui.input}`}
        // Đang gõ thì hiện chuỗi gõ; không thì hiện nhãn đã chọn.
        value={query ?? selectedLabel}
        placeholder={placeholder}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          openList();
        }}
        onKeyDown={handleKeyDown}
        // Chờ click trên option (onMouseDown option chạy trước blur) rồi mới đóng.
        onBlur={() => setTimeout(closeList, 120)}
      />
      {value !== "" ? (
        <button
          type="button"
          aria-label="Xoá lựa chọn"
          className="absolute inset-y-0 right-1.5 flex items-center px-1 text-gray-400 hover:text-gray-600"
          // onMouseDown để chạy trước blur của input.
          onMouseDown={(e) => {
            e.preventDefault();
            select("");
          }}
        >
          ×
        </button>
      ) : (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">
          ▾
        </span>
      )}

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full min-w-40 overflow-y-auto rounded-md border border-[#dee2e6] bg-white py-1 text-sm shadow-lg"
        >
          <li>
            <button
              type="button"
              className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${value === "" ? "font-medium text-[#0d6efd]" : "text-gray-500"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                select("");
              }}
            >
              {placeholder}
            </button>
          </li>
          {filtered.map((o, idx) => (
            <li key={o.value}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left ${
                  idx === highlight ? "bg-[#0d6efd]/10" : ""
                } ${o.value === value ? "font-medium text-[#0d6efd]" : "text-gray-800"} hover:bg-gray-50`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(o.value);
                }}
                onMouseEnter={() => setHighlight(idx)}
              >
                {o.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">Không có kết quả khớp.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
