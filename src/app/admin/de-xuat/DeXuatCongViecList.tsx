"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DeXuatCongViecItem } from "@/lib/checksheet/deXuatCongViecList";
import { hoanTacDuyet, resolveDeXuatCongViec, type ResolveDeXuatState } from "@/app/actions/deXuatCongViec";
import { formatThietBiLabel } from "@/lib/filters";
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
  khoi_phuc: "Khôi phục",
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
  if (item.loaiDeXuat === "khoi_phuc") {
    return <span className="text-gray-600">Khôi phục — hiện lại từ tháng sau</span>;
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

// Đợt 6 (item 2): nút Hoàn tác trên dòng ĐÃ DUYỆT -- rollback đề xuất về như
// chưa duyệt (RPC hoan_tac_duyet + guard chống mất dữ liệu mới ở server).
function HoanTacButton({ item }: { item: DeXuatCongViecItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !confirm(
        `Hoàn tác đề xuất "${LOAI_DE_XUAT_LABEL[item.loaiDeXuat]}" đã duyệt này?\n\nThay đổi sẽ được ĐẢO NGƯỢC về như chưa duyệt (chấm công đã chấm được bảo toàn/khôi phục). Nếu sau khi duyệt đã có thay đổi hoặc chấm công mới trên hạng mục thì không thể tự hoàn tác.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await hoanTacDuyet(item.id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-0.5 flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="self-start rounded-md border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Đang hoàn tác..." : "↩ Hoàn tác"}
      </button>
      {error ? <span className="text-red-600">{error}</span> : null}
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
      <div className="flex flex-col gap-1 text-xs text-gray-500">
        <span title={item.nguoiDuyet ?? undefined}>{item.nguoiDuyetTen ?? item.nguoiDuyet ?? "—"}</span>
        {item.trangThai === "Từ chối" && item.lyDoTuChoi ? <span>— {item.lyDoTuChoi}</span> : null}
        {item.trangThai === "Đã duyệt" ? <HoanTacButton item={item} /> : null}
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
        <div className="flex flex-col gap-1.5">
          {/* #6: duyệt kèm áp dụng ngay tháng hiện tại (không đợi tháng sau).
              Không áp dụng cho đề xuất 'Khôi phục' (vốn đã hiện lại từ tháng
              này). RPC tự bỏ qua nếu người duyệt không phải admin. */}
          {item.loaiDeXuat !== "khoi_phuc" ? (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" name="apDungNgay" />
              Áp dụng ngay tháng này
            </label>
          ) : null}
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
        </div>
      )}
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}

// Việc #8: gom đề xuất theo THIẾT BỊ (mã) thay vì bảng phẳng dài. Giữ thứ tự
// xuất hiện đầu tiên (initialItems đã sort created_at desc).
type DeviceGroup = {
  maThietBi: string;
  label: string;
  items: DeXuatCongViecItem[];
  pendingCount: number;
};

const UNKNOWN_DEVICE_KEY = "(không rõ thiết bị)";

function groupByThietBi(items: DeXuatCongViecItem[]): DeviceGroup[] {
  const map = new Map<string, DeXuatCongViecItem[]>();
  for (const it of items) {
    const key = it.maThietBi || UNKNOWN_DEVICE_KEY;
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }
  return Array.from(map.entries()).map(([maThietBi, groupItems]) => ({
    maThietBi,
    label:
      maThietBi === UNKNOWN_DEVICE_KEY
        ? UNKNOWN_DEVICE_KEY
        : formatThietBiLabel(maThietBi, groupItems[0]?.tenThietBi ?? ""),
    items: groupItems,
    pendingCount: groupItems.filter((i) => i.trangThai === "Chờ duyệt").length,
  }));
}

// 1 dòng đề xuất bên trong nhóm thiết bị (không lặp lại cột Thiết bị -- đã là
// tiêu đề nhóm). Tái dùng ChangeSummary + RowResolveForm.
function ProposalRow({ item }: { item: DeXuatCongViecItem }) {
  return (
    <tr className="border-b border-gray-100 align-top last:border-0 hover:bg-gray-50/60">
      <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
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
      <td className="px-3 py-2.5 whitespace-nowrap" title={item.nguoiDeXuat}>
        {item.nguoiDeXuatTen ?? item.nguoiDeXuat}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRANG_THAI_BADGE[item.trangThai]}`}>
          {item.trangThai}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <RowResolveForm item={item} />
      </td>
    </tr>
  );
}

export function DeXuatCongViecList({ initialItems }: { initialItems: DeXuatCongViecItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(DEFAULT_SELECTED);
  // Mặc định mở nhóm thiết bị đang có đề xuất "Chờ duyệt" (hàng đợi cần xử lý).
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const it of initialItems) {
      if (it.trangThai === "Chờ duyệt") s.add(it.maThietBi || UNKNOWN_DEVICE_KEY);
    }
    return s;
  });

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

  function toggleGroup(ma: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ma)) next.delete(ma);
      else next.add(ma);
      return next;
    });
  }

  const filtered = useMemo(
    () => initialItems.filter((item) => selected.has(item.trangThai)),
    [initialItems, selected],
  );
  const groups = useMemo(() => groupByThietBi(filtered), [filtered]);

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

      {groups.length === 0 ? (
        <p className={`p-8 text-center text-sm text-gray-400 ${ui.card}`}>
          Không có đề xuất nào phù hợp bộ lọc.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const isOpen = expanded.has(g.maThietBi);
            return (
              <div key={g.maThietBi} className={`overflow-hidden ${ui.card} p-0!`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.maThietBi)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-gray-400">{isOpen ? "▾" : "▸"}</span>
                    <span className="truncate font-medium text-gray-900">{g.label}</span>
                    <span className="whitespace-nowrap text-xs text-gray-500">({g.items.length} đề xuất)</span>
                  </span>
                  {g.pendingCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {g.pendingCount} chờ duyệt
                    </span>
                  ) : null}
                </button>
                {isOpen ? (
                  <div className="overflow-x-auto border-t border-[#dee2e6]">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#dee2e6] bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-2.5">Ngày đề xuất</th>
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
                        {g.items.map((item) => (
                          <ProposalRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
