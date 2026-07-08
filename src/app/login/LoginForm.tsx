"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { ui } from "@/lib/ui";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className={ui.label}>
          MSNV hoặc tên đăng nhập
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className={ui.input}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={ui.label}>
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={ui.input}
        />
      </div>

      {state.error ? (
        <p role="alert" className={ui.errorText}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={`mt-2 w-full ${ui.buttonPrimary}`}>
        {isPending ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}
