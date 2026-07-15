"use client";

// Dòng "Lần chỉnh sửa cuối ... bởi ..." dưới lưới checksheet. Dùng chung cho
// bản MÀN HÌNH (ChecksheetApp) và bản IN (PrintSheet) -- người dùng đã chốt in
// dòng này ra PDF để truy vết khi ký/lưu hồ sơ.

import { getLanCapNhatCuoi } from "@/lib/checksheet/nhacViec";
import type { ThucHienMap } from "@/lib/checksheet/types";

/** ISO timestamp -> "dd/MM/yyyy HH:mm:ss" theo giờ VN. */
function thoiDiemVn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
