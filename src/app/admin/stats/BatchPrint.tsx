"use client";

// Task 3 (Pha 6): "In danh sách đã lọc" trên /admin/stats -- in tuần tự
// checksheet của từng thiết bị đang hiển thị (đã lọc status="Đã cập nhật",
// xem StatsTable) ra hộp thoại in trình duyệt, thiết bị này xong mới sang
// thiết bị kế tiếp. TÁI DÙNG `ChecksheetTable` y nguyên ở chế độ chỉ xem
// (editability={} -- mọi ô mặc định KHÔNG cho sửa, xem docstring prop
// `editability` của ChecksheetTable) -- KHÔNG viết component bảng mới.
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCongViecRows, getThucHien } from "@/lib/checksheet/queries";
import { monthRange } from "@/app/checksheet/ChecksheetApp";
import { ChecksheetTable } from "@/app/checksheet/ChecksheetTable";
import { vnTodayIso } from "@/lib/checksheet/vnDate";
import type { CongViecRow, ThucHienMap } from "@/lib/checksheet/types";
import "@/app/checksheet/print.css";

type PrintDevice = { thietBiId: string; tenThietBi: string };

// Dự phòng cho `window.onafterprint` không bao giờ fire (một số trình
// duyệt/chế độ không phát sự kiện này đáng tin cậy) -- tránh treo hàng đợi
// vĩnh viễn. Cải tiến so với hệ cũ GAS (setTimeout mù 500ms cố định, không
// có tín hiệu thật từ trình duyệt): ưu tiên `afterprint` khi có, fallback
// timeout khi không.
const AFTER_PRINT_FALLBACK_MS = 5000;
// Khoảng chờ ngắn cho React render xong DOM của thiết bị hiện tại trước khi
// gọi window.print() -- hệ cũ dùng setTimeout 800ms cố định, ở đây không bắt
// buộc y hệt, miễn đủ để DOM cập nhật.
const RENDER_SETTLE_MS = 300;

export function BatchPrint({
  devices,
  monthValue,
}: {
  devices: PrintDevice[];
  monthValue: string;
}) {
  const [running, setRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentRows, setCurrentRows] = useState<CongViecRow[]>([]);
  const [currentThucHien, setCurrentThucHien] = useState<ThucHienMap>({});
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Chặn double-run nếu người dùng bấm nút trong lúc đang chạy (nút đã
  // disabled nhưng vẫn phòng thủ thêm ở đây cho chắc).
  const runningRef = useRef(false);

  const { thangDau, thangCuoi } = monthRange(monthValue);
  const todayIso = vnTodayIso();

  async function printOneDevice(device: PrintDevice): Promise<void> {
    const supabase = createClient();
    const congViecRows = await getCongViecRows(supabase, device.thietBiId, thangDau, thangCuoi);
    const congViecIds = congViecRows.map((r) => r.congViecId);
    const thucHienMap = await getThucHien(supabase, congViecIds, thangDau, thangCuoi);

    setCurrentRows(congViecRows);
    setCurrentThucHien(thucHienMap);

    // Đợi 1 khoảng ngắn cho React render xong bảng vừa cập nhật trước khi in.
    await new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS));

    await new Promise<void>((resolve) => {
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        window.removeEventListener("afterprint", finish);
        resolve();
      }
      window.addEventListener("afterprint", finish);
      setTimeout(finish, AFTER_PRINT_FALLBACK_MS);
      window.print();
    });
  }

  async function handleClick() {
    if (devices.length === 0 || runningRef.current) return;

    const confirmed = window.confirm(
      `Bạn sắp in ${devices.length} thiết bị.\nTrình duyệt sẽ hiện cửa sổ in lần lượt cho từng thiết bị.\nVui lòng bấm 'Save/Lưu' liên tục cho tới khi hoàn tất.\nTiếp tục?`,
    );
    if (!confirmed) return;

    runningRef.current = true;
    setRunning(true);
    setDoneCount(null);
    setErrorMsg(null);

    try {
      for (let i = 0; i < devices.length; i++) {
        setCurrentIndex(i);
        await printOneDevice(devices[i]);
      }
      setDoneCount(devices.length);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Lỗi khi in hàng loạt");
    } finally {
      runningRef.current = false;
      setRunning(false);
      setCurrentRows([]);
      setCurrentThucHien({});
    }
  }

  const currentDevice = running ? devices[currentIndex] : null;

  return (
    <div className="mt-4">
      <div className="no-print flex items-center gap-3">
        <button
          type="button"
          disabled={devices.length === 0 || running}
          onClick={handleClick}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
        >
          In danh sách đã lọc
        </button>

        {running && currentDevice ? (
          <p className="text-sm text-gray-500">
            Đang in thiết bị {currentIndex + 1}/{devices.length}: {currentDevice.tenThietBi}
          </p>
        ) : null}

        {!running && doneCount !== null ? (
          <p className="text-sm text-green-700">
            Đã in xong {doneCount}/{doneCount} thiết bị.
          </p>
        ) : null}

        {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
      </div>

      {/* Giữ print-area luôn có mặt trong DOM khi đang chạy hàng đợi (không
          ẩn/hiện phức tạp) -- print.css (@media print) đã tự động ẩn mọi thứ
          NGOÀI .print-area chỉ trong lúc in, nên màn hình bình thường vẫn
          thấy được bảng đang render mà không cần thêm CSS thủ công. */}
      {running ? (
        <div className="print-area mt-3">
          {currentDevice ? (
            <p className="mb-2 text-sm font-medium">
              {currentDevice.tenThietBi} — Tháng {monthValue}
            </p>
          ) : null}
          <ChecksheetTable
            rows={currentRows}
            thucHien={currentThucHien}
            thangDau={thangDau}
            thangCuoi={thangCuoi}
            editability={{}}
            todayIso={todayIso}
            onSetPlan={() => {}}
            onSetAct={() => {}}
            onRequestBatThuong={() => {}}
            selectedDay={null}
            onSelectDay={() => {}}
            onAutoFillPlan={() => {}}
          />
        </div>
      ) : null}
    </div>
  );
}
