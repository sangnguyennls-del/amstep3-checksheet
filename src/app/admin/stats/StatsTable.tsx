"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanStatsRow } from "@/lib/checksheet/planStats";
import { ui } from "@/lib/ui";
import { stripDiacritics } from "@/lib/filters";
import { Pagination, paginate } from "@/components/Pagination";
import { BatchPrint } from "./BatchPrint";

const PAGE_SIZE = 20;

const STATUS_LIST = ["Đã cập nhật", "Chưa cập nhật"] as const;

const STATUS_BADGE: Record<(typeof STATUS_LIST)[number], string> = {
  "Đã cập nhật": "bg-green-100 text-green-700",
  "Chưa cập nhật": "bg-red-100 text-red-700",
};

const ALL = "__all__";

export function StatsTable({
  initialRows,
  initialMonth,
}: {
  initialRows: PlanStatsRow[];
  initialMonth: string; // "YYYY-MM"
}) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [kip, setKip] = useState<string>(ALL);
  const [nhanVien, setNhanVien] = useState("");
  const [trangThai, setTrangThai] = useState<string>(ALL);

  // Đổi tháng ảnh hưởng trực tiếp tới dữ liệu SQL trả về (không thể lọc
  // client trên dữ liệu tháng khác) -- điều hướng qua `router.push` với
  // query `?thang=` để Server Component tải lại, đơn giản hơn tự quản lý
  // state + gọi RPC trực tiếp từ client (chấp nhận round-trip trang vì tần
  // suất đổi tháng ở màn thống kê thấp -- xem brief Task 1).
  function handleMonthChange(value: string) {
    setMonth(value);
    if (value) {
      router.push(`/admin/stats?thang=${value}`);
    }
  }

  const kipList = useMemo(
    () =>
      Array.from(new Set(initialRows.map((r) => r.kip).filter((k): k is string => !!k))).sort(),
    [initialRows],
  );

  // Khớp nhân viên theo cả TÊN lẫn MSNV, không dấu (#2b).
  const nhanVienQuery = stripDiacritics(nhanVien.trim());
  function khopNhanVien(r: PlanStatsRow): boolean {
    if (!nhanVienQuery) return true;
    return stripDiacritics(`${r.nguoiPhuTrachTen ?? ""} ${r.nguoiPhuTrach ?? ""}`).includes(
      nhanVienQuery,
    );
  }

  const filtered = useMemo(() => {
    return initialRows.filter((r) => {
      if (kip !== ALL && r.kip !== kip) return false;
      if (trangThai !== ALL && r.status !== trangThai) return false;
      if (!khopNhanVien(r)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows, kip, nhanVienQuery, trangThai]);

  // Hàng đợi in hàng loạt (Task 3): dùng LẠI các bộ lọc Kíp/Nhân viên đang áp
  // dụng ở bảng, nhưng ÉP BUỘC status="Đã cập nhật" bất kể người dùng đang
  // chọn Trạng thái gì ở bảng hiển thị -- đúng hành vi hệ cũ (chỉ in thiết bị
  // đã cập nhật kế hoạch, xem CLAUDE.md/bối cảnh Task 3).
  const printableDevices = useMemo(() => {
    return initialRows
      .filter((r) => {
        if (r.status !== "Đã cập nhật") return false;
        if (kip !== ALL && r.kip !== kip) return false;
        if (!khopNhanVien(r)) return false;
        return true;
      })
      .map((r) => ({ thietBiId: r.thietBiId, tenThietBi: r.tenThietBi }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows, kip, nhanVienQuery]);

  const [page, setPage] = useState(1);
  const { pageCount, safePage, pageItems } = paginate(filtered, page, PAGE_SIZE);

  return (
    <div>
      {/* no-print: xem comment trong src/app/admin/layout.tsx -- print.css chỉ
          ẩn phần tử có class `no-print`, không tự ẩn "mọi thứ ngoài
          .print-area". Bộ lọc + bảng thống kê phải tự đánh dấu để bản in
          hàng loạt (BatchPrint bên dưới) chỉ còn đúng checksheet thiết bị. */}
      <div className={`no-print mb-4 flex flex-wrap items-end gap-3 ${ui.card}`}>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Tháng
          <input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className={ui.input}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Kíp
          <select value={kip} onChange={(e) => setKip(e.target.value)} className={ui.input}>
            <option value={ALL}>Tất cả</option>
            {kipList.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Nhân viên
          <input
            type="text"
            value={nhanVien}
            onChange={(e) => setNhanVien(e.target.value)}
            placeholder="Nhập tên hoặc MSNV…"
            className={ui.input}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Trạng thái
          <select value={trangThai} onChange={(e) => setTrangThai(e.target.value)} className={ui.input}>
            <option value={ALL}>Tất cả</option>
            {STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`no-print overflow-x-auto ${ui.card} p-0!`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-[#dee2e6] bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2.5">Xưởng</th>
              <th className="px-3 py-2.5">Kíp</th>
              <th className="px-3 py-2.5">Nhân viên</th>
              <th className="px-3 py-2.5">Thiết bị</th>
              <th className="px-3 py-2.5">Số lượng công việc</th>
              <th className="px-3 py-2.5">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((row) => (
              <tr key={row.thietBiId} className="border-b border-gray-100 align-top last:border-0 hover:bg-gray-50/60">
                <td className="px-3 py-2.5 whitespace-nowrap">{row.xuong ?? "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.kip ?? "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap" title={row.nguoiPhuTrach ?? undefined}>
                  {row.nguoiPhuTrachTen ?? row.nguoiPhuTrach ?? "—"}
                </td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap text-gray-900">{row.tenThietBi}</td>
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                  {row.plannedTasks}/{row.totalTasks}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                  Không có dữ liệu
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="no-print">
        <Pagination page={safePage} pageCount={pageCount} total={filtered.length} onPage={setPage} />
      </div>

      <BatchPrint devices={printableDevices} monthValue={month} />
    </div>
  );
}
