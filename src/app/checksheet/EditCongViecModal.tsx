"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type EditCongViecTarget = {
  congViecId: string;
  tenChiTiet: string;
  loaiHoatDong: string;
  thoiGian: number | null;
  tanSuatChu: string | null;
  tanSuatSo: number | null;
};

export type EditCongViecResult = {
  congViecId: string;
  mode: "edit" | "remove";
  thoiGian: number | null;
  tanSuatChu: string | null;
  tanSuatSo: number | null;
};

/**
 * Modal "Sửa thời gian/tần suất" hoặc "Loại bỏ" 1 công việc ngay trên
 * /checksheet -- chỉ người phụ trách thiết bị hoặc Admin/AdminM mới gọi được
 * (quyền thật do RPC `can_manage_congviec` quyết định, xem migration
 * 0010_congviec_edit_by_owner.sql; nút mở modal ở ChecksheetTable.tsx chỉ ẩn
 * hiện theo gợi ý client, không phải nguồn chân lý).
 *
 * Lý do là bắt buộc cho CẢ 2 chế độ (yêu cầu AM Step 3: mọi thay đổi
 * thời gian/tần suất hoặc loại bỏ hạng mục phải truy vết được) -- validate ở
 * client trước (UX), RPC vẫn tự chặn lại nếu nhận chuỗi rỗng.
 *
 * "Loại bỏ" gọi `remove_congviec_with_reason` -- loại bỏ MỀM (active=false +
 * ngay_loai_bo), KHÔNG xoá cứng, đúng cơ chế đã có sẵn trong CLAUDE.md mục C.
 */
export function EditCongViecModal({
  open,
  mode,
  target,
  onClose,
  onSuccess,
}: {
  open: boolean;
  mode: "edit" | "remove";
  target: EditCongViecTarget | null;
  onClose: () => void;
  onSuccess: (result: EditCongViecResult) => void;
}) {
  // Nạp giá trị hiện tại từ `target` NGAY LÚC KHỞI TẠO state (không phải qua
  // useEffect) -- nơi gọi (ChecksheetApp.tsx) gắn `key` theo congViecId/mode
  // nên mỗi công việc/chế độ khác nhau luôn là 1 lần mount mới, tự nhiên có
  // giá trị đúng mà không cần effect đồng bộ lại (tránh lỗi lint
  // react-hooks/set-state-in-effect, xem BatThuongModal.tsx đã có sẵn lỗi
  // này -- không lặp lại ở component mới).
  const [thoiGian, setThoiGian] = useState(() =>
    target?.thoiGian != null ? String(target.thoiGian) : "",
  );
  const [tanSuatChu, setTanSuatChu] = useState(() => target?.tanSuatChu ?? "");
  const [tanSuatSo, setTanSuatSo] = useState(() =>
    target?.tanSuatSo != null ? String(target.tanSuatSo) : "",
  );
  const [lyDo, setLyDo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !target) return null;

  const lyDoError = lyDo.trim().length === 0 ? "Lý do là bắt buộc" : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (lyDoError) {
      setError(lyDoError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      if (mode === "remove") {
        const { error: rpcError } = await supabase.rpc("remove_congviec_with_reason", {
          p_congviec_id: target.congViecId,
          p_ly_do: lyDo.trim(),
        });
        if (rpcError) throw rpcError;
        onSuccess({
          congViecId: target.congViecId,
          mode: "remove",
          thoiGian: target.thoiGian,
          tanSuatChu: target.tanSuatChu,
          tanSuatSo: target.tanSuatSo,
        });
      } else {
        const thoiGianNum = thoiGian.trim() ? Number(thoiGian) : null;
        const tanSuatSoNum = tanSuatSo.trim() ? Number(tanSuatSo) : null;
        if ((thoiGian.trim() && !Number.isFinite(thoiGianNum)) ||
          (tanSuatSo.trim() && !Number.isFinite(tanSuatSoNum))) {
          setError("Thời gian/Tần suất số phải là số");
          setSubmitting(false);
          return;
        }
        const { error: rpcError } = await supabase.rpc("update_congviec_with_reason", {
          p_congviec_id: target.congViecId,
          p_thoi_gian: thoiGianNum,
          p_tan_suat_chu: tanSuatChu.trim() || null,
          p_tan_suat_so: tanSuatSoNum,
          p_ly_do: lyDo.trim(),
        });
        if (rpcError) throw rpcError;
        onSuccess({
          congViecId: target.congViecId,
          mode: "edit",
          thoiGian: thoiGianNum,
          tanSuatChu: tanSuatChu.trim() || null,
          tanSuatSo: tanSuatSoNum,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : mode === "remove"
            ? "Không loại bỏ được công việc"
            : "Không lưu được thay đổi",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-md border bg-white p-4 shadow-lg">
        <h2 className="mb-1 text-base font-semibold text-gray-800">
          {mode === "remove" ? "Loại bỏ công việc" : "Sửa thời gian / tần suất"}
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          {target.tenChiTiet} -- {target.loaiHoatDong} ({target.congViecId})
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "edit" ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Thời gian (phút)</label>
                <input
                  type="number"
                  step="any"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={thoiGian}
                  onChange={(e) => setThoiGian(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Tần suất (đơn vị)</label>
                  <input
                    type="text"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={tanSuatChu}
                    onChange={(e) => setTanSuatChu(e.target.value)}
                    placeholder="Ngày / Tuần / Tháng / Quý"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Tần suất (số)</label>
                  <input
                    type="number"
                    step="any"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={tanSuatSo}
                    onChange={(e) => setTanSuatSo(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Công việc này sẽ ngừng hiện trên checksheet từ tháng sau (loại bỏ mềm, giữ lại lịch sử
              để tính giờ tiết kiệm được -- không xoá dữ liệu).
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Lý do <span className="text-red-600">*</span>
            </label>
            <textarea
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder={
                mode === "remove"
                  ? "Vì sao không cần kiểm tra hạng mục này nữa..."
                  : "Vì sao cần đổi thời gian/tần suất..."
              }
              required
            />
            {lyDo.length > 0 && lyDoError ? <p className="text-xs text-red-600">{lyDoError}</p> : null}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-full border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={onClose}
              disabled={submitting}
            >
              Huỷ
            </button>
            <button
              type="submit"
              className={
                mode === "remove"
                  ? "rounded-full bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  : "rounded-full bg-[#0066cc] px-3 py-2 text-sm font-medium text-white hover:bg-[#0055ab] disabled:opacity-50"
              }
              disabled={submitting || !!lyDoError}
            >
              {submitting ? "Đang lưu..." : mode === "remove" ? "Loại bỏ" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
