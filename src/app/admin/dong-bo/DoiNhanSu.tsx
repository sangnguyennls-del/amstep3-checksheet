"use client";

import { useId, useState, useTransition } from "react";
import { previewDoiNhanSu, applyDoiNhanSu, type NhanSuField } from "@/app/actions/nhanSuBulk";
import { ui } from "@/lib/ui";

export function DoiNhanSu({
  truongCaValues,
  lanhDaoValues,
  nguoiDungNames,
}: {
  truongCaValues: string[];
  lanhDaoValues: string[];
  nguoiDungNames: string[];
}) {
  const [field, setField] = useState<NhanSuField>("truong_ca");
  const [oldName, setOldName] = useState("");
  const [newName, setNewName] = useState("");
  const [preview, setPreview] = useState<{ count: number; devices: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loadingPreview, startPreview] = useTransition();
  const [applying, startApply] = useTransition();

  const oldOptions = field === "truong_ca" ? truongCaValues : lanhDaoValues;
  const label = field === "truong_ca" ? "Trưởng ca" : "Lãnh đạo";
  const busy = loadingPreview || applying;

  // Đổi trường -> reset lựa chọn cũ (dropdown khác danh sách).
  function changeField(f: NhanSuField) {
    setField(f);
    setOldName("");
    setPreview(null);
    setError(null);
    setOkMsg(null);
  }

  function handlePreview() {
    setError(null);
    setOkMsg(null);
    startPreview(async () => {
      const res = await previewDoiNhanSu(field, oldName);
      if (res.error) {
        setError(res.error);
        setPreview(null);
      } else {
        setPreview({ count: res.count, devices: res.devices });
      }
    });
  }

  function handleApply() {
    if (!oldName.trim() || !newName.trim()) {
      setError("Chọn tên cũ và nhập tên mới");
      return;
    }
    if (
      !confirm(
        `Đổi ${label}: "${oldName}" → "${newName}" cho ${preview?.count ?? "?"} thiết bị?\n\nÁp cho MỌI thiết bị đang để ${label.toLowerCase()} = "${oldName}".`,
      )
    ) {
      return;
    }
    setError(null);
    setOkMsg(null);
    startApply(async () => {
      const res = await applyDoiNhanSu(field, oldName, newName);
      if (res.error) {
        setError(res.error);
      } else {
        setOkMsg(`Đã đổi ${label} cho ${res.applied} thiết bị.`);
        setPreview(null);
        setOldName("");
        setNewName("");
      }
    });
  }

  const listId = useId();

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="nhansu-field"
            checked={field === "truong_ca"}
            onChange={() => changeField("truong_ca")}
          />
          Trưởng ca
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="nhansu-field"
            checked={field === "lanh_dao"}
            onChange={() => changeField("lanh_dao")}
          />
          Lãnh đạo (quản đốc)
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label className={ui.label}>Tên cần thay ({label} hiện tại)</label>
          <select
            className={ui.input}
            value={oldName}
            onChange={(e) => {
              setOldName(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">— chọn —</option>
            {oldOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className={ui.label}>Tên mới</label>
          <input
            className={ui.input}
            list={listId}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Gõ hoặc chọn tên..."
          />
          <datalist id={listId}>
            {nguoiDungNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={busy || !oldName}
          className={ui.buttonSecondary}
        >
          {loadingPreview ? "Đang xem..." : "Xem trước"}
        </button>
        {preview && preview.count > 0 ? (
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !newName.trim()}
            className={ui.buttonPrimary}
          >
            {applying ? "Đang đổi..." : `Đổi ${preview.count} thiết bị`}
          </button>
        ) : null}
      </div>

      {error ? <p className={ui.errorText}>{error}</p> : null}
      {okMsg ? <p className={ui.successText}>{okMsg}</p> : null}
      {preview ? (
        preview.count > 0 ? (
          <p className="text-sm text-gray-600">
            <strong>{preview.count}</strong> thiết bị sẽ đổi: {preview.devices.join(", ")}
          </p>
        ) : (
          <p className="text-sm text-gray-500">Không có thiết bị nào đang để tên này.</p>
        )
      ) : null}
    </div>
  );
}
