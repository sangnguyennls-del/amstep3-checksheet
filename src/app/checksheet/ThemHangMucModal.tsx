"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Modal ĐỀ XUẤT "Thêm hạng mục" trên /checksheet (Việc 2). Hai kiểu:
// (a) thêm công việc vào chi tiết có sẵn; (b) thêm chi tiết mới + công việc đầu
// tiên. Người phụ trách -> tạo đề xuất chờ duyệt; Admin -> áp dụng ngay (RPC
// propose_them_hang_muc tự phân nhánh theo vai trò; quyền thật do RPC quyết
// định, nút/mở modal chỉ là gợi ý client). Hiệu lực đầu tháng sau. Khuôn
// responsive giống EditCongViecModal/BatThuongModal.
export function ThemHangMucModal({
  open,
  thietBiId,
  chiTietList,
  onClose,
  onSuccess,
}: {
  open: boolean;
  thietBiId: string | null;
  chiTietList: { id: string; ten: string }[];
  onClose: () => void;
  onSuccess?: (applied: boolean) => void;
}) {
  const [kieu, setKieu] = useState<"co_san" | "moi">(chiTietList.length > 0 ? "co_san" : "moi");
  const [chiTietId, setChiTietId] = useState(() => chiTietList[0]?.id ?? "");
  const [tenChiTiet, setTenChiTiet] = useState("");
  const [dieuKien, setDieuKien] = useState("");
  const [stt, setStt] = useState("");
  const [loaiHoatDong, setLoaiHoatDong] = useState("Kiểm tra");
  const [thoiGian, setThoiGian] = useState("");
  const [tanSuatChu, setTanSuatChu] = useState("");
  const [tanSuatSo, setTanSuatSo] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Màn hình kết quả sau khi gửi: applied=true (admin áp ngay) hoặc false (đã
  // gửi đề xuất chờ duyệt). Hạng mục mới thuộc THÁNG SAU nên không mutate lưới
  // tháng đang xem -- chỉ báo cho người dùng rồi để họ đóng.
  const [result, setResult] = useState<{ applied: boolean } | null>(null);

  if (!open || !thietBiId) return null;

  const lyDoError = lyDo.trim().length === 0 ? "Lý do là bắt buộc" : null;
  const tenMoiError = kieu === "moi" && tenChiTiet.trim().length === 0 ? "Tên chi tiết là bắt buộc" : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!thietBiId) return;
    if (lyDoError || tenMoiError) {
      setError(lyDoError ?? tenMoiError);
      return;
    }
    const thoiGianNum = thoiGian.trim() ? Number(thoiGian) : null;
    const tanSuatSoNum = tanSuatSo.trim() ? Number(tanSuatSo) : null;
    const sttNum = stt.trim() ? Number(stt) : null;
    if (
      (thoiGian.trim() && !Number.isFinite(thoiGianNum)) ||
      (tanSuatSo.trim() && !Number.isFinite(tanSuatSoNum)) ||
      (stt.trim() && !Number.isInteger(sttNum))
    ) {
      setError("Thời gian/Tần suất số/STT phải là số hợp lệ");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("propose_them_hang_muc", {
        p_thietbi_id: thietBiId,
        p_chitiet_id: kieu === "co_san" ? chiTietId : null,
        p_ten_chi_tiet: kieu === "moi" ? tenChiTiet.trim() : null,
        p_dieu_kien_co_ban: kieu === "moi" ? dieuKien.trim() || null : null,
        p_stt: kieu === "moi" ? sttNum : null,
        p_loai_hoat_dong: loaiHoatDong.trim(),
        p_thoi_gian: thoiGianNum,
        p_tan_suat_chu: tanSuatChu.trim() || null,
        p_tan_suat_so: tanSuatSoNum,
        p_ly_do: lyDo.trim(),
      });
      if (rpcError) throw rpcError;
      const applied = !!data?.applied;
      setResult({ applied });
      onSuccess?.(applied);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được đề xuất");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-md border border-[#dee2e6] bg-white p-4 shadow-lg"
      >
        {result ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-gray-800">
              {result.applied ? "Đã thêm hạng mục" : "Đã gửi đề xuất"}
            </h2>
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {result.applied
                ? "Hạng mục đã được thêm, có hiệu lực từ đầu tháng sau."
                : "Đề xuất đã gửi tới Admin cùng Nhóm để duyệt. Khi được duyệt, hạng mục sẽ có hiệu lực từ đầu tháng sau."}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7]"
                onClick={onClose}
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-base font-semibold text-gray-800">Đề xuất thêm hạng mục</h2>
            <p className="mb-3 text-sm text-gray-500">
              Hạng mục mới sẽ có hiệu lực từ đầu tháng sau (sau khi được duyệt).
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="kieu"
                    checked={kieu === "co_san"}
                    disabled={chiTietList.length === 0}
                    onChange={() => setKieu("co_san")}
                  />
                  Thêm công việc vào chi tiết có sẵn
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="kieu" checked={kieu === "moi"} onChange={() => setKieu("moi")} />
                  Thêm chi tiết mới
                </label>
              </div>

              {kieu === "co_san" ? (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Chi tiết</label>
                  <select
                    className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                    value={chiTietId}
                    onChange={(e) => setChiTietId(e.target.value)}
                  >
                    {chiTietList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ten}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      Tên chi tiết <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                      value={tenChiTiet}
                      onChange={(e) => setTenChiTiet(e.target.value)}
                    />
                    {tenChiTiet.length > 0 && tenMoiError ? (
                      <p className="text-xs text-red-600">{tenMoiError}</p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700">Điều kiện cơ bản</label>
                      <input
                        type="text"
                        className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                        value={dieuKien}
                        onChange={(e) => setDieuKien(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700">STT trên sơ đồ</label>
                      <input
                        type="number"
                        className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                        value={stt}
                        onChange={(e) => setStt(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  Loại hoạt động <span className="text-red-600">*</span>
                </label>
                <select
                  className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                  value={loaiHoatDong}
                  onChange={(e) => setLoaiHoatDong(e.target.value)}
                >
                  <option>Kiểm tra</option>
                  <option>Vệ sinh</option>
                  <option>Bôi trơn</option>
                  <option>Siết chặt</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Thời gian (phút)</label>
                  <input
                    type="number"
                    step="any"
                    className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                    value={thoiGian}
                    onChange={(e) => setThoiGian(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Tần suất</label>
                  <input
                    type="text"
                    className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                    value={tanSuatChu}
                    onChange={(e) => setTanSuatChu(e.target.value)}
                    placeholder="Ngày/Tuần/Tháng"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Số</label>
                  <input
                    type="number"
                    step="any"
                    className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                    value={tanSuatSo}
                    onChange={(e) => setTanSuatSo(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  Lý do <span className="text-red-600">*</span>
                </label>
                <textarea
                  className="rounded-md border border-[#ced4da] px-3 py-2 text-sm"
                  rows={2}
                  value={lyDo}
                  onChange={(e) => setLyDo(e.target.value)}
                  placeholder="Vì sao cần thêm hạng mục này..."
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
                  className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7] disabled:opacity-50"
                  disabled={submitting || !!lyDoError || !!tenMoiError}
                >
                  {submitting ? "Đang gửi..." : "Gửi đề xuất"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
