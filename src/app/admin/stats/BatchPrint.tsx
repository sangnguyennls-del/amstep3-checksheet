"use client";

// Task 3 (Pha 6): "In danh sách đã lọc" trên /admin/stats -- in tuần tự
// checksheet của từng thiết bị đang hiển thị (đã lọc status="Đã cập nhật",
// xem StatsTable) ra hộp thoại in trình duyệt, thiết bị này xong mới sang
// thiết bị kế tiếp. TÁI DÙNG `ChecksheetTable` y nguyên ở chế độ chỉ xem
// (editability={} -- mọi ô mặc định KHÔNG cho sửa, xem docstring prop
// `editability` của ChecksheetTable) -- KHÔNG viết component bảng mới.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCongViecRows, getThietBiInfo, getThucHien } from "@/lib/checksheet/queries";
import { monthRange } from "@/app/checksheet/ChecksheetApp";
import { PrintSheet, type PrintThietBi } from "@/app/checksheet/PrintSheet";
import { buildPrintTitle, fitPrintSheetToPage } from "@/app/checksheet/printFit";
import { vnTodayIso } from "@/lib/checksheet/vnDate";
import type { CongViecRow, ThucHienMap } from "@/lib/checksheet/types";
import { ui } from "@/lib/ui";
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
  // Mục 8: thông tin đầy đủ của thiết bị đang in (khu vực, trưởng ca, người
  // phụ trách, ảnh...) cho khối đầu trang PrintSheet -- trước đây batch in
  // không có đầu trang, nay dùng chung mẫu với bản in /checksheet.
  const [currentThietBi, setCurrentThietBi] = useState<PrintThietBi | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Chặn double-run nếu người dùng bấm nút trong lúc đang chạy (nút đã
  // disabled nhưng vẫn phòng thủ thêm ở đây cho chắc).
  const runningRef = useRef(false);

  // Fix review Task 3 (Important #1): nếu component unmount giữa hàng đợi
  // (vd người dùng điều hướng khỏi /admin/stats) -- vòng lặp `handleClick`
  // là 1 async closure không tự biết component đã unmount, sẽ tiếp tục gọi
  // fetch/window.print() cho các thiết bị còn lại NGAY CẢ KHI người dùng
  // đang xem trang khác (window.print() là lời gọi toàn cục, không bị giới
  // hạn theo component đã unmount) và gọi setState trên state đã unmount.
  // `isMountedRef` được kiểm tra trước MỌI bước có side-effect (setState,
  // window.print()) để dừng hẳn hàng đợi ngay khi phát hiện unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fix review Task 3 (Important #2): banner tiến trình trước đây đọc thẳng
  // từ prop `devices` (đọc theo render HIỆN TẠI) để suy ra "thiết bị đang
  // in" -- nếu người dùng đổi bộ lọc Kíp/Nhân viên ở StatsTable trong lúc
  // hàng đợi đang chạy, `devices` đổi theo nhưng vòng lặp `handleClick` vẫn
  // in đúng theo danh sách CŨ (biến cục bộ đóng trong closure) -- banner sẽ
  // hiện SAI tên thiết bị (hoặc mất hẳn nếu index vượt quá mảng mới). Chụp
  // snapshot vào STATE (không dùng ref -- đọc `.current` của ref ngay trong
  // JSX bị ESLint `react-hooks/refs` chặn vì React Compiler không theo dõi
  // được thay đổi của ref để re-render đúng lúc) ngay lúc bắt đầu, banner
  // đọc từ state này thay vì đọc thẳng prop `devices`.
  const [runDevices, setRunDevices] = useState<PrintDevice[]>([]);

  const { thangDau, thangCuoi } = monthRange(monthValue);
  const todayIso = vnTodayIso();

  /** Trả về `false` nếu bị huỷ giữa chừng do component unmount (dừng hàng đợi, không phải lỗi). */
  async function printOneDevice(device: PrintDevice): Promise<boolean> {
    const supabase = createClient();
    const congViecRows = await getCongViecRows(supabase, device.thietBiId, thangDau, thangCuoi);
    if (!isMountedRef.current) return false;
    const congViecIds = congViecRows.map((r) => r.congViecId);
    const [thucHienMap, thietBiInfo] = await Promise.all([
      getThucHien(supabase, congViecIds, thangDau, thangCuoi),
      getThietBiInfo(supabase, device.thietBiId),
    ]);
    if (!isMountedRef.current) return false;

    setCurrentRows(congViecRows);
    setCurrentThucHien(thucHienMap);
    setCurrentThietBi(thietBiInfo);

    // Đợi 1 khoảng ngắn cho React render xong bảng vừa cập nhật trước khi in.
    await new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS));
    if (!isMountedRef.current) return false;

    // Mục 8: tên file PDF mặc định theo thiết bị + tháng, thu bản in vừa 1
    // trang A3 trước khi mở hộp thoại in (xem printFit.ts).
    const prevTitle = document.title;
    if (thietBiInfo) {
      document.title = buildPrintTitle(thietBiInfo.maThietBi, monthValue);
    }
    fitPrintSheetToPage();
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
    document.title = prevTitle;
    return isMountedRef.current;
  }

  async function handleClick() {
    if (devices.length === 0 || runningRef.current) return;

    const confirmed = window.confirm(
      `Bạn sắp in ${devices.length} thiết bị.\nTrình duyệt sẽ hiện cửa sổ in lần lượt cho từng thiết bị.\nVui lòng bấm 'Save/Lưu' liên tục cho tới khi hoàn tất.\nTiếp tục?`,
    );
    if (!confirmed) return;

    // Chụp snapshot vào 1 BIẾN CỤC BỘ (không phải state/ref) ngay lúc bắt
    // đầu -- vòng lặp lặp theo biến này, không đọc thẳng prop `devices` (có
    // thể đổi giữa chừng nếu người dùng đổi bộ lọc trong lúc đang in). Biến
    // cục bộ được đóng đúng trong closure của `handleClick`, không bị ảnh
    // hưởng bởi re-render, khác với đọc trực tiếp prop ở mỗi lần lặp.
    const devicesSnapshot = devices;
    setRunDevices(devicesSnapshot); // để banner (render) hiện đúng theo snapshot này

    runningRef.current = true;
    setRunning(true);
    setDoneCount(null);
    setErrorMsg(null);

    try {
      for (let i = 0; i < devicesSnapshot.length; i++) {
        if (!isMountedRef.current) break;
        setCurrentIndex(i);
        const ok = await printOneDevice(devicesSnapshot[i]);
        if (!ok) break;
      }
      if (isMountedRef.current) {
        setDoneCount(devicesSnapshot.length);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setErrorMsg(e instanceof Error ? e.message : "Lỗi khi in hàng loạt");
      }
    } finally {
      runningRef.current = false;
      if (isMountedRef.current) {
        setRunning(false);
        setCurrentRows([]);
        setCurrentThucHien({});
        setCurrentThietBi(null);
      }
    }
  }

  const currentDevice = running ? runDevices[currentIndex] : null;

  return (
    <div className="mt-4">
      <div className="no-print flex items-center gap-3">
        <button
          type="button"
          disabled={devices.length === 0 || running}
          onClick={handleClick}
          className={ui.buttonSecondary}
        >
          In danh sách đã lọc
        </button>

        {running && currentDevice ? (
          <p className="text-sm text-gray-500">
            Đang in thiết bị {currentIndex + 1}/{runDevices.length}: {currentDevice.tenThietBi}
          </p>
        ) : null}

        {!running && doneCount !== null ? (
          <p className={ui.successText}>Đã in xong {doneCount} thiết bị.</p>
        ) : null}

        {errorMsg ? <p className={ui.errorText}>{errorMsg}</p> : null}
      </div>

      {/* Bản in của thiết bị đang xử lý: PrintSheet nằm off-screen trên màn
          hình (print.css .print-sheet) và là phần duy nhất hiện ra khi in --
          cùng bố cục đầu trang + bảng với bản in của /checksheet. Banner
          tiến trình phía trên là phần hiển thị màn hình duy nhất khi chạy. */}
      {running && currentThietBi ? (
        <div className="print-area mt-3">
          <PrintSheet
            thietBi={currentThietBi}
            rows={currentRows}
            thucHien={currentThucHien}
            thangDau={thangDau}
            thangCuoi={thangCuoi}
            todayIso={todayIso}
          />
        </div>
      ) : null}
    </div>
  );
}
