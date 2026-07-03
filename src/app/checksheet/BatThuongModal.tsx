"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateBatThuongMoTa } from "@/lib/checksheet/batThuong";
import { vnTodayIso } from "@/lib/checksheet/vnDate";

/**
 * Modal BẮT BUỘC khi người dùng cố tô 1 ô Actual thành "R" (xem Cell.tsx ->
 * onRequestBatThuong). Submit gọi thẳng RPC `set_ket_qua_r_with_bat_thuong`
 * (0002_functions_triggers.sql) -- KHÔNG đi qua nút "Lưu" / hàng đợi dirty như
 * Plan/Actual thường, vì RPC này tự lưu xuống DB ngay khi gọi thành công.
 *
 * `p_mo_ta` được validate KHÔNG RỖNG ở client (validateBatThuongMoTa) TRƯỚC
 * khi gọi RPC -- RPC cũng tự chặn (raise exception) nếu nhận mô tả rỗng,
 * nhưng validate trước giúp UX tốt hơn (không cần round-trip mạng mới biết
 * lỗi, đúng yêu cầu Global Constraints).
 *
 * RPC hiện tại (không được đổi ở Task 4) trả về CHỈ
 * `{"thuchien_id":"...", "bat_thuong_id":"..."}`, KHÔNG có `updated_at`.
 * Quyết định đã chọn (xem report): sau khi RPC thành công, gọi thêm 1 lần
 * SELECT tối thiểu (1 cột, 1 dòng, theo `id`) trên bảng `thuc_hien` để lấy
 * đúng `updated_at` THẬT từ server -- nhẹ hơn gọi lại `getThucHien` cho cả
 * tháng chỉ để lấy 1 giá trị.
 */
export function BatThuongModal({
  open,
  congViecId,
  ngay,
  onClose,
  onSuccess,
}: {
  open: boolean;
  congViecId: string;
  ngay: string;
  onClose: () => void;
  onSuccess: (result: {
    congViecId: string;
    ngay: string;
    thuChienId: string;
    updatedAt: string;
    moTa: string;
  }) => void;
}) {
  const [moTa, setMoTa] = useState("");
  const [anhUrl, setAnhUrl] = useState("");
  const [ngayPhatHien, setNgayPhatHien] = useState(vnTodayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form mỗi lần mở modal cho 1 ô mới -- tránh giữ lại mô tả của lần
  // ghi nhận bất thường trước đó cho ô khác.
  useEffect(() => {
    if (open) {
      setMoTa("");
      setAnhUrl("");
      setNgayPhatHien(vnTodayIso());
      setError(null);
    }
  }, [open, congViecId, ngay]);

  if (!open) return null;

  const validationError = validateBatThuongMoTa(moTa);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validate lại ngay trước khi gọi RPC (không chỉ dựa vào disabled ở nút
    // submit) -- phòng thủ nhiều lớp giống các luồng lưu khác trong Pha 4.
    const err = validateBatThuongMoTa(moTa);
    if (err) {
      setError(err);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("set_ket_qua_r_with_bat_thuong", {
        p_congviec_id: congViecId,
        p_ngay: ngay,
        p_mo_ta: moTa.trim(),
        p_anh_url: anhUrl.trim() || null,
        p_ngay_phat_hien: ngayPhatHien || null,
      });
      if (rpcError) throw rpcError;

      const result = data as { thuchien_id: string; bat_thuong_id: string };

      // RPC không trả `updated_at` -- đọc lại đúng 1 cột cho đúng 1 dòng vừa
      // ghi để lấy giá trị THẬT từ server (không dùng đồng hồ client), dùng
      // làm `updatedAt` cho action `applyBatThuong` (gridReducer.ts).
      const { data: refreshed, error: refreshError } = await supabase
        .from("thuc_hien")
        .select("updated_at")
        .eq("id", result.thuchien_id)
        .single();
      if (refreshError) throw refreshError;

      onSuccess({
        congViecId,
        ngay,
        thuChienId: result.thuchien_id,
        updatedAt: (refreshed as { updated_at: string }).updated_at,
        moTa: moTa.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không ghi nhận được bất thường");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md border bg-white p-4 shadow-lg">
        <h2 className="mb-1 text-base font-semibold text-gray-800">Ghi nhận bất thường</h2>
        <p className="mb-3 text-sm text-gray-500">
          Ngày {Number(ngay.slice(8, 10))}/{Number(ngay.slice(5, 7))} -- {congViecId}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Mô tả bất thường <span className="text-red-600">*</span>
            </label>
            <textarea
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={moTa}
              onChange={(e) => setMoTa(e.target.value)}
              placeholder="Mô tả bất thường phát hiện được..."
              required
            />
            {moTa.length > 0 && validationError ? (
              <p className="text-xs text-red-600">{validationError}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Ảnh (link Google Drive, tuỳ chọn)</label>
            <input
              type="text"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={anhUrl}
              onChange={(e) => setAnhUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Ngày phát hiện</label>
            <input
              type="date"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={ngayPhatHien}
              onChange={(e) => setNgayPhatHien(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={onClose}
              disabled={submitting}
            >
              Huỷ
            </button>
            <button
              type="submit"
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={submitting || !!validationError}
            >
              {submitting ? "Đang lưu..." : "Ghi nhận"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
