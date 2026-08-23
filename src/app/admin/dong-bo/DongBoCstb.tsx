"use client";

import { useState, useTransition } from "react";
import { previewCstbSync, applyCstbSync } from "@/app/actions/cstbSync";
import type { CstbDiff } from "@/lib/cstb/diff";
import { ui } from "@/lib/ui";

function Badge({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      <strong>{n}</strong> {label}
    </span>
  );
}

export function DongBoCstb() {
  const [diff, setDiff] = useState<CstbDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [loadingPreview, startPreview] = useTransition();
  const [applying, startApply] = useTransition();

  function handlePreview() {
    setError(null);
    setApplied(null);
    startPreview(async () => {
      const res = await previewCstbSync();
      if (res.error) {
        setError(res.error);
        setDiff(null);
      } else {
        setDiff(res.diff);
      }
    });
  }

  function handleApply() {
    if (!diff || diff.changes.length === 0) return;
    if (
      !confirm(
        `Áp dụng ${diff.changes.length} thay đổi phân công?\n\nSẽ cập nhật người chăm sóc + nhóm của các thiết bị này theo Google Sheet. Việc chấm/sửa và phạm vi duyệt của các thiết bị đó sẽ đổi theo người mới.`,
      )
    ) {
      return;
    }
    setError(null);
    startApply(async () => {
      const res = await applyCstbSync();
      if (res.error) {
        setError(res.error);
      } else {
        setApplied(res.applied);
        // tải lại preview -> danh sách thay đổi giờ rỗng, xác nhận đã áp.
        const p = await previewCstbSync();
        if (!p.error) setDiff(p.diff);
      }
    });
  }

  const busy = loadingPreview || applying;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={busy}
          className={ui.buttonSecondary}
        >
          {loadingPreview ? "Đang đọc sheet..." : "Xem trước đồng bộ"}
        </button>
        {diff && diff.changes.length > 0 ? (
          <button type="button" onClick={handleApply} disabled={busy} className={ui.buttonPrimary}>
            {applying ? "Đang áp dụng..." : `Áp dụng ${diff.changes.length} thay đổi`}
          </button>
        ) : null}
      </div>

      {error ? <p className={ui.errorText}>{error}</p> : null}
      {applied !== null ? (
        <p className={ui.successText}>
          Đã áp dụng {applied} thay đổi. Dữ liệu app giờ khớp Google Sheet.
        </p>
      ) : null}

      {diff ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge n={diff.changes.length} label="thay đổi" tone="bg-amber-100 text-amber-800" />
            <Badge n={diff.noChange.length} label="giữ nguyên" tone="bg-emerald-100 text-emerald-700" />
            <Badge n={diff.unmatchedDevice.length} label="mã lạ" tone="bg-red-100 text-red-700" />
            <Badge
              n={diff.unmatchedCaretaker.length}
              label="tên lạ"
              tone="bg-red-100 text-red-700"
            />
            {diff.duplicateDevice.length > 0 ? (
              <Badge n={diff.duplicateDevice.length} label="trùng mã" tone="bg-gray-200 text-gray-700" />
            ) : null}
          </div>

          {diff.changes.length > 0 ? (
            <div className={`overflow-x-auto ${ui.card} p-0!`}>
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={ui.tableHeadCell}>Thiết bị</th>
                    <th className={ui.tableHeadCell}>Người chăm sóc (cũ → mới)</th>
                    <th className={ui.tableHeadCell}>Nhóm (cũ → mới)</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.changes.map((c) => (
                    <tr key={c.thietBiId}>
                      <td className={`${ui.tableCell} font-medium whitespace-nowrap`}>{c.maThietBi}</td>
                      <td className={ui.tableCell}>
                        <span className="text-gray-500">{c.oldHoTen ?? c.oldMsnv ?? "—"}</span>
                        {" → "}
                        <strong>{c.newHoTen}</strong>
                      </td>
                      <td className={`${ui.tableCell} whitespace-nowrap`}>
                        <span className="text-gray-500">{c.oldNhom ?? "—"}</span> →{" "}
                        <strong>{c.newNhom ?? "—"}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Không có thay đổi nào — app đã khớp sheet.</p>
          )}

          {diff.unmatchedDevice.length > 0 ? (
            <UnmatchedList
              title="Mã thiết bị trong sheet KHÔNG có trong hệ thống (bỏ qua)"
              rows={diff.unmatchedDevice}
            />
          ) : null}
          {diff.unmatchedCaretaker.length > 0 ? (
            <UnmatchedList
              title="Tên người chăm sóc KHÔNG có trong danh sách người dùng (bỏ qua)"
              rows={diff.unmatchedCaretaker}
            />
          ) : null}
          {diff.duplicateDevice.length > 0 ? (
            <p className="text-sm text-gray-600">
              Mã thiết bị bị lặp trong sheet (chỉ dùng dòng đầu):{" "}
              <span className="font-medium">{diff.duplicateDevice.join(", ")}</span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-gray-500">
          Bấm “Xem trước đồng bộ” để đọc phân công mới nhất từ Google Sheet và xem những gì sẽ thay đổi
          trước khi áp dụng.
        </p>
      )}
    </div>
  );
}

function UnmatchedList({
  title,
  rows,
}: {
  title: string;
  rows: { maThietBi: string; nhanVienChamSoc: string }[];
}) {
  return (
    <div className={ui.card}>
      <p className="mb-1.5 text-sm font-medium text-[#dc3545]">{title}</p>
      <ul className="flex flex-col gap-0.5 text-sm text-gray-700">
        {rows.map((r, i) => (
          <li key={`${r.maThietBi}-${i}`}>
            <span className="font-medium">{r.maThietBi || "(trống)"}</span> — {r.nhanVienChamSoc || "(trống)"}
          </li>
        ))}
      </ul>
    </div>
  );
}
