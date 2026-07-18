"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeXuatCongViecItem } from "@/lib/checksheet/deXuatCongViecList";
import { resolveDeXuatCongViec, type ResolveDeXuatState } from "@/app/actions/deXuatCongViec";
import { ui } from "@/lib/ui";

// Định nghĩa state ban đầu ở đây (client), không import từ file "use server"
// -- cùng lý do/pattern đã dùng ở BatThuongList.tsx.
const initialActionState: ResolveDeXuatState = { error: null };

const TRANG_THAI_LIST = ["Chờ duyệt", "Đã duyệt", "Từ chối"] as const;

const TRANG_THAI_BADGE: Record<(typeof TRANG_THAI_LIST)[number], string> = {
  "Chờ duyệt": "bg-amber-100 text-amber-800",
  "Đã duyệt": "bg-emerald-100 text-emerald-700",
  "Từ chối": "bg-red-100 text-red-700",
};

const LOAI_DE_XUAT_LABEL: Record<DeXuatCongViecItem["loaiDeXuat"], string> = {
  sua: "Sửa thời gian/tần suất",
  loai_bo: "Loại bỏ",
  them: "Thêm hạng mục",
};

// Mặc định chỉ hiện "Chờ duyệt" -- đây là hàng đợi cần xử lý, đúng tinh thần
// mặc định của BatThuongList (tập trung vào cái chưa xử lý xong).
const DEFAULT_SELECTED = new Set<string>(["Chờ duyệt"]);

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ChangeSummary({ item }: { item: DeXuatCongViecItem }) {
  if (item.loaiDeXuat === "them") {
    const tsGoc = [item.tanSuatChuMoi, item.tanSuatSoMoi].filter((x) => x != null && x !== "").join(" ");
    const congViec = `${item.loaiHoatDongMoi ?? "—"}${item.thoiGianMoi != null ? ` · ${item.thoiGianMoi} phút` : ""}${tsGoc ? ` · ${tsGoc}` : ""}`;
    return (
      <div className="flex flex-col gap-0.5 text-xs">
        {item.chiTietChonTen ? (
          <span>+ Công việc vào chi tiết «{item.chiTietChonTen}»</span>
        ) : (
          <span>
            + Chi tiết mới: <strong>{item.tenChiTietMoi}</strong>
            {item.sttMoi != null ? ` (STT ${item.sttMoi})` : ""}
            {item.dieuKienCoBanMoi ? ` — ĐK: ${item.dieuKienCoBanMoi}` : ""}
          </span>
        )}
        <span>{congViec}</span>
      </div>
    );
  }
  if (item.loaiDeXuat === "loai_bo") {
    return <span className="text-gray-600">Loại bỏ khỏi checksheet (giữ lịch sử)</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span>
        Thời gian: {item.thoiGianHienTai ?? "—"} → <strong>{item.thoiGianMoi ?? "—"}</strong>
      </span>
      <span>
        Tần suất: {item.tanSuatChuHienTai ?? "—"} {item.tanSuatSoHienTai ?? ""} →{" "}
        <strong>
          {item.tanSuatChuMoi ?? "—"} {item.tanSuatSoMoi ?? ""}
        </strong>
      </span>
    </div>
  );
}

// 1 form độc lập mỗi dòng -- cùng pattern BatThuongList.tsx/UsersTable.tsx.
function RowResolveForm({ item }: { item: DeXuatCongViecItem }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(resolveDeXuatCongViec, initialActionState);
  const [showReject, setShowReject] = useState(false);
  const [lyDoTuChoi, setLyDoTuChoi] = useState("");

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state, router]);

  if (item.trangThai !== "Chờ duyệt") {
    return (
      <div className="text-xs text-gray-500">
        {item.nguoiDuyet ? `${item.nguoiDuyet}` : "—"}
        {item.trangThai === "Từ chối" && item.lyDoTuChoi ? ` — ${item.lyDoTuChoi}` : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="id" value={item.id} />
      {showReject ? (
        <>
          <input type="hidden" name="hanhDong" value="tu_choi" />
          <textarea
            name="lyDoTuChoi"
            value={lyDoTuChoi}
            onChange={(e) => setLyDoTuChoi(e.target.value)}
            placeholder="Lý do từ chối..."
            rows={2}
            className={`${ui.input} text-xs!`}
          />
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={isPending || !lyDoTuChoi.trim()}
              className="rounded-full bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Đang gửi..." : "Xác nhận từ chối"}
            </button>
            <button
              type="button"
              onClick={() => setShowReject(false)}
              className={`${ui.buttonSecondary} px-2! py-1! text-xs!`}
            >
              Huỷ
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="submit"
            name="hanhDong"
            value="duyet"
            disabled={isPending}
            className={`${ui.buttonPrimary} px-2! py-1! text-xs!`}
          >
            {isPending ? "Đang lưu..." : "Duyệt"}
          </button>
          <button
            type="button"
            onClick={() => setShowReject(true)}
            className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Từ chối
          </button>
        </div>
      )}
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function DeXuatCongViecList({ initialItems }: { initialItems: DeXuatCongViecItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(DEFAULT_SELECTED);

  function toggle(trangThai: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(trangThai)) {
        next.delete(trangThai);
      } else {
        next.add(trangThai);
      }
      return next;
    });
  }

  function showAll() {
    setSelected(new Set(TRANG_THAI_LIST));
  }

  const filtered = useMemo(
    () => initialItems.filter((item) => selected.has(item.trangThai)),
    [initialItems, selected],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TRANG_THAI_LIST.map((trangThai) => (
          <label
            key={trangThai}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#ced4da] bg-white px-2.5 py-1.5 text-sm transition-colors hover:bg-gray-50 has-[:checked]:border-[#0d6efd]/40 has-[:checked]:bg-[#0d6efd]/5"
          >
            <input type="checkbox" checked={selected.has(trangThai)} onChange={() => toggle(trangThai)} />
            {trangThai}
          </label>
        ))}
        <button type="button" onClick={showAll} className={`${ui.buttonSecondary} px-2.5! py-1.5!`}>
          Hiện tất cả
        </button>
      </div>

      <div className={`overflow-x-auto ${ui.card} p-0!`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-[#dee2e6] bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2.5">Ngày đề xuất</th>
              <th className="px-3 py-2.5">Thiết bị</th>
              <th className="px-3 py-2.5">Chi tiết / Loại</th>
              <th className="px-3 py-2.5">Loại đề xuất</th>
              <th className="px-3 py-2.5">Thay đổi</th>
              <th className="px-3 py-2.5">Lý do</th>
              <th className="px-3 py-2.5">Người đề xuất</th>
              <th className="px-3 py-2.5">Trạng thái</th>
              <th className="px-3 py-2.5">Duyệt / Người duyệt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 align-top last:border-0 hover:bg-gray-50/60">
                <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap text-gray-900">
                  {item.maThietBi} — {item.tenThietBi}
                </td>
                <td className="px-3 py-2.5">
                  {item.loaiDeXuat === "them" ? (item.chiTietChonTen ?? item.tenChiTietMoi ?? "—") : item.tenChiTiet}
                  <br />
                  <span className="text-xs text-gray-500">
                    {item.loaiDeXuat === "them" ? (item.loaiHoatDongMoi ?? "") : item.loaiHoatDong}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{LOAI_DE_XUAT_LABEL[item.loaiDeXuat]}</td>
                <td className="px-3 py-2.5">
                  <ChangeSummary item={item} />
                </td>
                <td className="px-3 py-2.5">{item.lyDo}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{item.nguoiDeXuat}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRANG_THAI_BADGE[item.trangThai]}`}>
                    {item.trangThai}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <RowResolveForm item={item} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                  Không có đề xuất nào phù hợp bộ lọc.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
