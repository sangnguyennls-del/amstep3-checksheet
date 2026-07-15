"use client";

import { useActionState } from "react";
import { updateSettings, type SettingsActionState } from "@/app/actions/settings";
import { ui } from "@/lib/ui";

export type CaiDatRow = { key: string; value: string };

const initialState: SettingsActionState = { error: null };

function toMap(rows: CaiDatRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function SettingsForm({ current }: { current: CaiDatRow[] }) {
  const [state, formAction, isPending] = useActionState(updateSettings, initialState);
  const map = toMap(current);

  const lockDate = map.LOCK_DATE ?? "5";
  const enableLockDate = (map.ENABLE_LOCK_DATE ?? "true") === "true";
  const enableTimeLimit = (map.ENABLE_TIME_LIMIT ?? "true") === "true";
  const enableDeviceLock = (map.ENABLE_DEVICE_LOCK ?? "true") === "true";
  const maintenanceMode = (map.MAINTENANCE_MODE ?? "false") === "true";

  return (
    <form action={formAction} className={`flex max-w-xl flex-col gap-5 ${ui.card}`}>
      <div className="flex flex-col gap-1">
        <label htmlFor="lockDate" className={ui.label}>
          Ngày khoá (Lock Date)
        </label>
        <p className="text-xs text-gray-500">
          Số ngày trong tháng — sau ngày này dữ liệu tháng trước sẽ bị khoá, không cho sửa.
        </p>
        <input
          id="lockDate"
          name="lockDate"
          type="number"
          min={1}
          max={31}
          step={1}
          defaultValue={lockDate}
          required
          className={`w-32 ${ui.input}`}
        />
      </div>

      <label className="flex items-start gap-2.5 rounded-md border border-[#dee2e6] p-3 transition-colors hover:bg-gray-50">
        <input
          type="checkbox"
          name="enableLockDate"
          defaultChecked={enableLockDate}
          className="mt-1 h-4 w-4 accent-[#0d6efd]"
        />
        <span>
          <span className="block text-sm font-medium text-gray-800">Bật khoá theo ngày</span>
          <span className="block text-xs text-gray-500">
            Áp dụng quy tắc Ngày khoá ở trên để chặn sửa dữ liệu quá hạn.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5 rounded-md border border-[#dee2e6] p-3 transition-colors hover:bg-gray-50">
        <input
          type="checkbox"
          name="enableTimeLimit"
          defaultChecked={enableTimeLimit}
          className="mt-1 h-4 w-4 accent-[#0d6efd]"
        />
        <span>
          <span className="block text-sm font-medium text-gray-800">
            Bật giới hạn thời gian ghi Actual
          </span>
          <span className="block text-xs text-gray-500">
            Chỉ cho phép ghi Actual trong khoảng ±4 ngày quanh ngày hiện tại (trừ Admin).
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5 rounded-md border border-[#dee2e6] p-3 transition-colors hover:bg-gray-50">
        <input
          type="checkbox"
          name="enableDeviceLock"
          defaultChecked={enableDeviceLock}
          className="mt-1 h-4 w-4 accent-[#0d6efd]"
        />
        <span>
          <span className="block text-sm font-medium text-gray-800">
            Bật khoá theo thiết bị phụ trách
          </span>
          <span className="block text-xs text-gray-500">
            Chỉ người phụ trách thiết bị (hoặc Admin) mới được sửa checksheet của thiết bị đó.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-3">
        <input
          type="checkbox"
          name="maintenanceMode"
          defaultChecked={maintenanceMode}
          className="mt-1 h-4 w-4 accent-red-600"
        />
        <span>
          <span className="block text-sm font-semibold text-red-700">Bảo trì hệ thống</span>
          <span className="block text-xs text-red-600">
            Cảnh báo: bật chế độ này sẽ chặn đăng nhập của toàn bộ user thường (chỉ AdminM còn vào
            được) — chỉ bật khi thật sự cần bảo trì hệ thống.
          </span>
        </span>
      </label>

      {state.error ? (
        <p role="alert" className={ui.errorText}>
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className={ui.successText}>Đã lưu cài đặt.</p> : null}

      <div>
        <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
          {isPending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </form>
  );
}
