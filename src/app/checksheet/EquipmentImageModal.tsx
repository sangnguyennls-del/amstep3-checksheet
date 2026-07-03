"use client";

import { useRef, useState } from "react";

/**
 * Chuẩn hoá 1 link Google Drive ("...file/d/<id>/view", "...?id=<id>", v.v.)
 * thành link ảnh xem trực tiếp được (`lh3.googleusercontent.com`), port từ
 * logic hệ GAS cũ (xem CLAUDE.md, sheet `Images`: "extracts a Drive file ID
 * from the URL and rewrites it to a lh3.googleusercontent.com thumbnail
 * link"). Nếu không khớp định dạng Drive nào đã biết, trả về nguyên `url` --
 * cho phép admin dán thẳng 1 link ảnh trực tiếp (không phải Drive) nếu muốn.
 */
function toDriveImageSrc(url: string): string {
  const patterns = [/\/file\/d\/([^/]+)/, /[?&]id=([^&]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  }
  return url;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 6;

/**
 * Modal xem ảnh sơ đồ thiết bị (pan/zoom/rotate) -- CSS transform + state
 * {scale, x, y, rotate}, cập nhật qua onWheel (zoom) / onPointerDown+Move
 * (pan) / nút xoay 90 độ, theo đúng brief Task 4. `anhUrl` null/rỗng ->
 * hiện "Chưa có ảnh" thay vì icon ảnh vỡ/crash.
 */
export function EquipmentImageModal({
  open,
  onClose,
  anhUrl,
  tenThietBi,
}: {
  open: boolean;
  onClose: () => void;
  anhUrl: string | null;
  tenThietBi: string;
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0, rotate: 0 });
  const draggingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });

  if (!open) return null;

  function resetTransform() {
    setTransform({ scale: 1, x: 0, y: 0, rotate: 0 });
  }

  function handleClose() {
    resetTransform();
    onClose();
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setTransform((t) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      return { ...t, scale: nextScale };
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPointRef.current.x;
    const dy = e.clientY - lastPointRef.current.y;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }

  function handlePointerUp() {
    draggingRef.current = false;
  }

  function rotate90() {
    setTransform((t) => ({ ...t, rotate: (t.rotate + 90) % 360 }));
  }

  const src = anhUrl && anhUrl.trim() !== "" ? toDriveImageSrc(anhUrl.trim()) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-md bg-white shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold text-gray-800">Ảnh sơ đồ thiết bị -- {tenThietBi}</h2>
          <div className="flex items-center gap-2">
            {src ? (
              <>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={() => setTransform((t) => ({ ...t, scale: Math.min(MAX_SCALE, t.scale * 1.2) }))}
                >
                  Phóng to
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={() => setTransform((t) => ({ ...t, scale: Math.max(MIN_SCALE, t.scale / 1.2) }))}
                >
                  Thu nhỏ
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-gray-50" onClick={rotate90}>
                  Xoay 90°
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-gray-50" onClick={resetTransform}>
                  Đặt lại
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
              onClick={handleClose}
            >
              Đóng
            </button>
          </div>
        </div>

        <div
          className="relative h-[70vh] w-full overflow-hidden bg-gray-100"
          onWheel={src ? handleWheel : undefined}
          onPointerDown={src ? handlePointerDown : undefined}
          onPointerMove={src ? handlePointerMove : undefined}
          onPointerUp={src ? handlePointerUp : undefined}
          onPointerLeave={src ? handlePointerUp : undefined}
          style={{ cursor: src ? "grab" : "default", touchAction: "none" }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh Google
            // Drive/thumbnail bên ngoài, cần pan/zoom bằng CSS transform tuỳ ý,
            // không cần tối ưu next/image cho trường hợp này.
            <img
              src={src}
              alt={`Sơ đồ thiết bị ${tenThietBi}`}
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotate}deg)`,
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
              Chưa có ảnh cho thiết bị này.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
