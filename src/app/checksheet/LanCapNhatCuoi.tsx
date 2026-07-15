"use client";

// Dòng "Lần chỉnh sửa cuối ... bởi ..." dưới lưới checksheet. Dùng chung cho
// bản MÀN HÌNH (ChecksheetApp) và bản IN (PrintSheet) -- người dùng đã chốt in
// dòng này ra PDF để truy vết khi ký/lưu hồ sơ.

import { getLanCapNhatCuoi } from "@/lib/checksheet/nhacViec";
import type { ThucHienMap } from "@/lib/checksheet/types";

/**
 * ISO timestamp -> "dd/MM/yyyy HH:mm:ss" theo giờ VN.
 *
 * Ghép tay từ formatToParts thay vì toLocaleString(): locale "vi-VN" trả GIỜ
 * TRƯỚC NGÀY ("15:03:19 15/07/2026"), không khớp mẫu phiếu ("10/07/2026
 * 09:44:23"). Ghép tay thì thứ tự cố định, không phụ thuộc locale/runtime.
 */
function thoiDiemVn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

export function LanCapNhatCuoi({ thucHien }: { thucHien: ThucHienMap }) {
  const lan = getLanCapNhatCuoi(thucHien);
  if (!lan) return null;

  return (
    <p className="mt-1 text-right text-[11px] text-gray-500">
      Lần chỉnh sửa cuối <span className="font-medium">{thoiDiemVn(lan.at)}</span>
      {lan.ten ? (
        <>
          {" "}
          bởi <span className="font-medium">{lan.ten}</span>
        </>
      ) : null}
    </p>
  );
}
