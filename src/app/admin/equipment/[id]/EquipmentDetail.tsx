"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  updateThietBi,
  createChiTiet,
  updateChiTiet,
  deleteChiTiet,
  createCongViec,
  updateCongViec,
  deleteCongViec,
  type EquipmentActionState,
} from "@/app/actions/equipment";
import { ui } from "@/lib/ui";
import { SearchableSelect } from "@/components/SearchableSelect";

export type ThietBiDetail = {
  id: string;
  ma_thiet_bi: string;
  ten_thiet_bi: string;
  cum: string | null;
  khu_vuc: string | null;
  xuong: string | null;
  kip: string | null;
  nhom: string | null;
  lanh_dao: string | null;
  truong_ca: string | null;
  nguoi_phu_trach: string | null;
};

export type NguoiDungOption = { msnv: string; ho_ten: string };

export type CongViecRow = {
  id: string;
  chitiet_id: string;
  loai_hoat_dong: string;
  thoi_gian: number | null;
  tan_suat_chu: string | null;
  tan_suat_so: number | null;
  active: boolean;
  hieu_luc_tu: string | null;
  hieu_luc_den: string | null;
  ngay_loai_bo: string | null;
  // Mục 1 (0016): id phiên bản kế nhiệm khi dòng này đã bị "sửa từ tháng
  // sau" -- hiển thị để admin nhận ra chuỗi phiên bản cũ/mới.
  thay_the_boi: string | null;
};

export type ChiTietRow = {
  id: string;
  thietbi_id: string;
  stt: number | null;
  ten_chi_tiet: string;
  dieu_kien_co_ban: string | null;
};

export type ChiTietWithCongViec = ChiTietRow & { congviec: CongViecRow[] };

const initialState: EquipmentActionState = { error: null };

function inputClass() {
  return ui.input;
}

// ---------------------------------------------------------------------------
// THIETBI form
// ---------------------------------------------------------------------------

function ThietBiForm({ thietBi, users }: { thietBi: ThietBiDetail; users: NguoiDungOption[] }) {
  const [state, formAction, isPending] = useActionState(updateThietBi, initialState);
  // Mục 11: SearchableSelect là controlled component không có name -- giữ giá
  // trị ở state + <input type="hidden"> để form action (FormData) vẫn nhận.
  const [nguoiPhuTrach, setNguoiPhuTrach] = useState(thietBi.nguoi_phu_trach ?? "");

  return (
    <form
      action={formAction}
      className={`mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 ${ui.card}`}
    >
      <input type="hidden" name="id" value={thietBi.id} />
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Mã thiết bị</label>
        <input name="maThietBi" defaultValue={thietBi.ma_thiet_bi} required className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Tên thiết bị</label>
        <input name="tenThietBi" defaultValue={thietBi.ten_thiet_bi} required className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Cụm</label>
        <input name="cum" defaultValue={thietBi.cum ?? ""} className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Khu vực</label>
        <input name="khuVuc" defaultValue={thietBi.khu_vuc ?? ""} className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Xưởng</label>
        <input name="xuong" defaultValue={thietBi.xuong ?? ""} className={inputClass()} />
      </div>
      {/* Kíp = Nhóm nhỏ (Kíp N = Nhóm N) -- chỉ nhập "Nhóm nhỏ", action tự
          suy kip khi lưu (xem equipment.ts updateThietBi). */}
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Nhóm nhỏ</label>
        <input name="nhom" defaultValue={thietBi.nhom ?? ""} className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Lãnh đạo</label>
        <input name="lanhDao" defaultValue={thietBi.lanh_dao ?? ""} className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Trưởng ca</label>
        <input name="truongCa" defaultValue={thietBi.truong_ca ?? ""} className={inputClass()} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={ui.label}>Người phụ trách</label>
        <input type="hidden" name="nguoiPhuTrach" value={nguoiPhuTrach} />
        <SearchableSelect
          value={nguoiPhuTrach}
          onChange={setNguoiPhuTrach}
          placeholder="-- Chưa gán --"
          options={users.map((u) => ({ value: u.msnv, label: `${u.ho_ten} (${u.msnv})` }))}
        />
      </div>

      {state.error ? (
        <p role="alert" className={`col-span-full ${ui.errorText}`}>
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className={`col-span-full ${ui.successText}`}>Đã lưu.</p> : null}

      <div className="col-span-full">
        <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
          {isPending ? "Đang lưu..." : "Lưu thông tin thiết bị"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CONGVIEC
// ---------------------------------------------------------------------------

function CreateCongViecForm({ chiTietId, thietBiId }: { chiTietId: string; thietBiId: string }) {
  const [state, formAction, isPending] = useActionState(createCongViec, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
      >
        {open ? "Đóng" : "+ Thêm công việc"}
      </button>

      {open ? (
        <form
          action={formAction}
          className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-[#dee2e6] bg-[#f8f9fa] p-3 sm:grid-cols-2 md:grid-cols-4"
        >
          <input type="hidden" name="chiTietId" value={chiTietId} />
          <input type="hidden" name="thietBiId" value={thietBiId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Loại hoạt động</label>
            <input name="loaiHoatDong" required className={inputClass()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Thời gian (phút)</label>
            <input name="thoiGian" type="number" step="any" className={inputClass()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Tần suất (chữ)</label>
            <input name="tanSuatChu" className={inputClass()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Tần suất (số)</label>
            <input name="tanSuatSo" type="number" step="any" className={inputClass()} />
          </div>

          {state.error ? (
            <p role="alert" className="col-span-full text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="col-span-full text-sm text-green-600">Đã thêm công việc.</p>
          ) : null}

          <div className="col-span-full">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[#0d6efd] px-2 py-1 text-xs font-medium text-white hover:bg-[#0b5ed7] disabled:opacity-60"
            >
              {isPending ? "Đang thêm..." : "Thêm"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function EditCongViecDialog({
  congViec,
  thietBiId,
  onClose,
}: {
  congViec: CongViecRow;
  thietBiId: string;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(updateCongViec, initialState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-lg rounded-md border border-[#dee2e6] bg-white p-4 shadow-lg">
        <h2 className="mb-3 text-base font-semibold">Sửa công việc {congViec.id}</h2>
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={congViec.id} />
          <input type="hidden" name="thietBiId" value={thietBiId} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Loại hoạt động</label>
            <input
              name="loaiHoatDong"
              defaultValue={congViec.loai_hoat_dong}
              required
              className={inputClass()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Thời gian (phút)</label>
            <input
              name="thoiGian"
              type="number"
              step="any"
              defaultValue={congViec.thoi_gian ?? ""}
              className={inputClass()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tần suất (chữ)</label>
            <input
              name="tanSuatChu"
              defaultValue={congViec.tan_suat_chu ?? ""}
              className={inputClass()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tần suất (số)</label>
            <input
              name="tanSuatSo"
              type="number"
              step="any"
              defaultValue={congViec.tan_suat_so ?? ""}
              className={inputClass()}
            />
          </div>

          <div className="col-span-full rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs text-amber-800">
              Cơ chế &quot;loại bỏ dần&quot; (từ migration 0016): luồng đề xuất/duyệt trên
              checksheet tự đặt <b>Hiệu lực đến</b> = cuối tháng duyệt (tháng cũ giữ nguyên dữ
              liệu, tháng sau ngừng hiện). Form này là đường chỉnh THỦ CÔNG của Admin -- sửa
              trực tiếp cửa sổ hiệu lực khi cần; <b>bỏ tick Active</b> = ẩn hẳn khỏi MỌI tháng
              (kể cả quá khứ), chỉ dùng khi dòng tạo nhầm.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={congViec.active} />
                Active
              </label>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Hiệu lực từ</label>
                <input
                  name="hieuLucTu"
                  type="date"
                  defaultValue={congViec.hieu_luc_tu ?? ""}
                  className={inputClass()}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Hiệu lực đến</label>
                <input
                  name="hieuLucDen"
                  type="date"
                  defaultValue={congViec.hieu_luc_den ?? ""}
                  className={inputClass()}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Ngày loại bỏ</label>
                <input
                  name="ngayLoaiBo"
                  type="date"
                  defaultValue={congViec.ngay_loai_bo ?? ""}
                  className={inputClass()}
                />
              </div>
            </div>
          </div>

          {state.error ? (
            <p role="alert" className="col-span-full text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? <p className="col-span-full text-sm text-green-600">Đã lưu.</p> : null}

          <div className="col-span-full mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7] disabled:opacity-60"
            >
              {isPending ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CongViecTable({ congViec, thietBiId }: { congViec: CongViecRow[]; thietBiId: string }) {
  const [editing, setEditing] = useState<CongViecRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(cv: CongViecRow) {
    if (!confirm(`Xoá công việc "${cv.loai_hoat_dong}" (${cv.id})? Không thể hoàn tác.`)) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCongViec(cv.id, thietBiId);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div className="mt-2">
      {deleteError ? <p className="mb-2 text-sm text-red-600">{deleteError}</p> : null}
      <table className="min-w-full text-xs">
        <thead className="border-b bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-2 py-1">Loại hoạt động</th>
            <th className="px-2 py-1">Thời gian</th>
            <th className="px-2 py-1">Tần suất</th>
            <th className="px-2 py-1">Active</th>
            <th className="px-2 py-1">Hiệu lực</th>
            <th className="px-2 py-1">Ngày loại bỏ</th>
            <th className="px-2 py-1">Hành động</th>
          </tr>
        </thead>
        <tbody>
          {congViec.map((cv) => (
            <tr key={cv.id} className="border-b last:border-0">
              <td className="px-2 py-1">{cv.loai_hoat_dong}</td>
              <td className="px-2 py-1">{cv.thoi_gian ?? ""}</td>
              <td className="px-2 py-1">
                {cv.tan_suat_chu ?? ""} {cv.tan_suat_so ?? ""}
              </td>
              <td className="px-2 py-1">{cv.active ? "Có" : "Không"}</td>
              {/* Mục 1 (0016): cửa sổ hiệu lực + liên kết phiên bản để admin
                  đọc được lịch sử "sửa/loại bỏ từ tháng sau" của công việc. */}
              <td className="px-2 py-1 whitespace-nowrap">
                {cv.hieu_luc_tu || cv.hieu_luc_den
                  ? `${cv.hieu_luc_tu ?? "…"} → ${cv.hieu_luc_den ?? "…"}`
                  : ""}
                {cv.thay_the_boi ? (
                  <span
                    className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600"
                    title={`Đã được thay thế bởi phiên bản ${cv.thay_the_boi} (hiệu lực từ tháng sau thời điểm duyệt)`}
                  >
                    → {cv.thay_the_boi}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1">{cv.ngay_loai_bo ?? ""}</td>
              <td className="px-2 py-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(cv)}
                    className="rounded-md border px-2 py-0.5 hover:bg-gray-50"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDelete(cv)}
                    className="rounded-md border border-red-300 px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Xoá
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {congViec.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-2 py-3 text-center text-gray-400">
                Chưa có công việc nào.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {editing ? (
        <EditCongViecDialog congViec={editing} thietBiId={thietBiId} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHITIET
// ---------------------------------------------------------------------------

function CreateChiTietForm({ thietBiId }: { thietBiId: string }) {
  const [state, formAction, isPending] = useActionState(createChiTiet, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7]"
      >
        {open ? "Đóng" : "+ Thêm chi tiết"}
      </button>

      {open ? (
        <form
          action={formAction}
          className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-[#dee2e6] bg-white p-4 sm:grid-cols-2 md:grid-cols-3"
        >
          <input type="hidden" name="thietBiId" value={thietBiId} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">STT (trên sơ đồ)</label>
            <input name="stt" type="number" className={inputClass()} />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-sm font-medium text-gray-700">Nội dung (Tên chi tiết)</label>
            <input name="tenChiTiet" required className={inputClass()} />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-full">
            <label className="text-sm font-medium text-gray-700">Điều kiện cơ bản (Tiêu chuẩn)</label>
            <input name="dieuKienCoBan" className={inputClass()} />
          </div>

          {state.error ? (
            <p role="alert" className="col-span-full text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="col-span-full text-sm text-green-600">Đã thêm chi tiết.</p>
          ) : null}

          <div className="col-span-full">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7] disabled:opacity-60"
            >
              {isPending ? "Đang thêm..." : "Thêm chi tiết"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function EditChiTietDialog({
  chiTiet,
  onClose,
}: {
  chiTiet: ChiTietRow;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(updateChiTiet, initialState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-md border border-[#dee2e6] bg-white p-4 shadow-lg">
        <h2 className="mb-3 text-base font-semibold">Sửa chi tiết {chiTiet.id}</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={chiTiet.id} />
          <input type="hidden" name="thietBiId" value={chiTiet.thietbi_id} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">STT (trên sơ đồ)</label>
            <input name="stt" type="number" defaultValue={chiTiet.stt ?? ""} className={inputClass()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Nội dung (Tên chi tiết)</label>
            <input
              name="tenChiTiet"
              defaultValue={chiTiet.ten_chi_tiet}
              required
              className={inputClass()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Điều kiện cơ bản (Tiêu chuẩn)</label>
            <input
              name="dieuKienCoBan"
              defaultValue={chiTiet.dieu_kien_co_ban ?? ""}
              className={inputClass()}
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? <p className="text-sm text-green-600">Đã lưu.</p> : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[#0d6efd] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b5ed7] disabled:opacity-60"
            >
              {isPending ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChiTietItem({ chiTiet }: { chiTiet: ChiTietWithCongViec }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Xoá chi tiết "${chiTiet.ten_chi_tiet}" (${chiTiet.id})? Toàn bộ Công việc con sẽ bị xoá theo, không thể hoàn tác.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteChiTiet(chiTiet.id, chiTiet.thietbi_id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div className="rounded-md border border-[#dee2e6] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span className="text-gray-400">{expanded ? "▾" : "▸"}</span>
          <span className="font-mono text-xs text-gray-500">{chiTiet.id}</span>
          <span className="text-sm text-gray-500">STT {chiTiet.stt ?? "-"}</span>
          <span className="text-sm font-medium">{chiTiet.ten_chi_tiet}</span>
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
          >
            Sửa
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Xoá
          </button>
        </div>
      </div>
      {chiTiet.dieu_kien_co_ban ? (
        <p className="mt-1 pl-6 text-xs text-gray-500">
          Điều kiện cơ bản: {chiTiet.dieu_kien_co_ban}
        </p>
      ) : null}
      {deleteError ? <p className="mt-2 pl-6 text-sm text-red-600">{deleteError}</p> : null}

      {expanded ? (
        <div className="mt-3 border-t pt-3 pl-6">
          <h3 className="mb-1 text-xs font-semibold text-gray-600">Công việc (loại hoạt động)</h3>
          <CongViecTable congViec={chiTiet.congviec} thietBiId={chiTiet.thietbi_id} />
          <CreateCongViecForm chiTietId={chiTiet.id} thietBiId={chiTiet.thietbi_id} />
        </div>
      ) : null}

      {editing ? <EditChiTietDialog chiTiet={chiTiet} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function EquipmentDetail({
  thietBi,
  chiTietList,
  users,
}: {
  thietBi: ThietBiDetail;
  chiTietList: ChiTietWithCongViec[];
  users: NguoiDungOption[];
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">
          Thiết bị {thietBi.ma_thiet_bi} - {thietBi.ten_thiet_bi}
        </h1>
        <Link
          href="/admin/equipment"
          className="text-sm text-[#0d6efd] transition-colors hover:text-[#0b5ed7] hover:underline"
        >
          ← Danh sách thiết bị
        </Link>
      </div>

      <ThietBiForm thietBi={thietBi} users={users} />

      <h2 className="mb-3 text-base font-semibold text-gray-900">Chi tiết (điểm kiểm tra)</h2>
      <CreateChiTietForm thietBiId={thietBi.id} />

      <div className="flex flex-col gap-3">
        {chiTietList.map((ct) => (
          <ChiTietItem key={ct.id} chiTiet={ct} />
        ))}
        {chiTietList.length === 0 ? (
          <p className={`p-8 text-center text-sm text-gray-500 ${ui.card}`}>
            Chưa có chi tiết nào.
          </p>
        ) : null}
      </div>
    </div>
  );
}
