"use client";

// Mục 12: nút + modal "Đổi mật khẩu" cho chính người đang đăng nhập -- đặt
// cạnh nút Đăng xuất ở header /checksheet và trong nav /admin. Sau đợt reset
// mật khẩu hàng loạt về 123456 (scripts/admin/resetAllPasswords.ts), đây là
// đường để từng người tự đặt lại mật khẩu riêng.

import { useState } from "react";
import { useActionState } from "react";
import { changeOwnPassword, type ChangePasswordState } from "@/app/actions/auth";
import { ui } from "@/lib/ui";

const initialState: ChangePasswordState = { error: null };

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(changeOwnPassword, initialState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-[#dee2e6] bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Đổi mật khẩu</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Mật khẩu hiện tại</label>
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className={ui.input}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Mật khẩu mới (≥ 6 ký tự)</label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={ui.input}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Nhập lại mật khẩu mới</label>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={ui.input}
            />
          </div>

          {state.error ? (
            <p role="alert" className={ui.errorText}>
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className={ui.successText}>Đã đổi mật khẩu. Dùng mật khẩu mới cho lần đăng nhập sau.</p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={ui.buttonSecondary}>
              Đóng
            </button>
            <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
              {isPending ? "Đang lưu..." : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ buttonClassName }: { buttonClassName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? `${ui.buttonSecondary} px-3! py-1.5!`}
      >
        Đổi mật khẩu
      </button>
      {open ? <ChangePasswordForm onClose={() => setOpen(false)} /> : null}
    </>
  );
}
