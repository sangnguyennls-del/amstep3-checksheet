"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  type UserActionState,
} from "@/app/actions/users";

export type UserRow = {
  id: string;
  msnv: string;
  ho_ten: string;
  don_vi: string | null;
  vai_tro: "user" | "admin" | "adminm" | null;
};

const initialState: UserActionState = { error: null };

const ROLE_LABEL: Record<string, string> = {
  "": "User",
  user: "User",
  admin: "Admin",
  adminm: "AdminM",
};

function RoleSelect({
  name,
  defaultValue,
  currentUserVaiTro,
}: {
  name: string;
  defaultValue: string;
  currentUserVaiTro: "admin" | "adminm";
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
    >
      <option value="user">User</option>
      <option value="admin">Admin</option>
      {currentUserVaiTro === "adminm" ? <option value="adminm">AdminM</option> : null}
    </select>
  );
}

function CreateUserForm({ currentUserVaiTro }: { currentUserVaiTro: "admin" | "adminm" }) {
  const [state, formAction, isPending] = useActionState(createUser, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {open ? "Đóng" : "+ Thêm người dùng"}
      </button>

      {open ? (
        <form
          action={formAction}
          className="mt-3 grid grid-cols-1 gap-3 rounded-md border bg-white p-4 sm:grid-cols-2 md:grid-cols-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tài khoản</label>
            <input
              name="username"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Mật khẩu</label>
            <input
              name="password"
              type="password"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">MSNV</label>
            <input
              name="msnv"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Họ tên</label>
            <input
              name="hoTen"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Đơn vị</label>
            <input name="donVi" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Vai trò</label>
            <RoleSelect
              name="vaiTro"
              defaultValue="user"
              currentUserVaiTro={currentUserVaiTro}
            />
          </div>

          {state.error ? (
            <p role="alert" className="col-span-full text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="col-span-full text-sm text-green-600">Tạo người dùng thành công.</p>
          ) : null}

          <div className="col-span-full">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Đang tạo..." : "Tạo người dùng"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function EditUserDialog({
  user,
  currentUserVaiTro,
  onClose,
}: {
  user: UserRow;
  currentUserVaiTro: "admin" | "adminm";
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(updateUser, initialState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-md border bg-white p-4 shadow-lg">
        <h2 className="mb-3 text-base font-semibold">Sửa người dùng {user.msnv}</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={user.id} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Họ tên</label>
            <input
              name="hoTen"
              defaultValue={user.ho_ten}
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Đơn vị</label>
            <input
              name="donVi"
              defaultValue={user.don_vi ?? ""}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Vai trò</label>
            <RoleSelect
              name="vaiTro"
              defaultValue={user.vai_tro ?? "user"}
              currentUserVaiTro={currentUserVaiTro}
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
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(resetUserPassword, initialState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-md border bg-white p-4 shadow-lg">
        <h2 className="mb-3 text-base font-semibold">Đặt lại mật khẩu cho {user.msnv}</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={user.id} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Mật khẩu mới</label>
            <input
              name="newPassword"
              type="password"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-green-600">Đã đặt lại mật khẩu.</p>
          ) : null}

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
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Đang lưu..." : "Đặt lại"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersTable({
  users,
  currentUserVaiTro,
}: {
  users: UserRow[];
  currentUserVaiTro: "admin" | "adminm";
}) {
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(user: UserRow) {
    if (!confirm(`Xoá người dùng ${user.msnv} - ${user.ho_ten}? Hành động này không thể hoàn tác.`)) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result.error) {
        setDeleteError(result.error);
      }
    });
  }

  return (
    <div>
      <CreateUserForm currentUserVaiTro={currentUserVaiTro} />

      {deleteError ? <p className="mb-3 text-sm text-red-600">{deleteError}</p> : null}

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">MSNV</th>
              <th className="px-3 py-2">Họ tên</th>
              <th className="px-3 py-2">Đơn vị</th>
              <th className="px-3 py-2">Vai trò</th>
              <th className="px-3 py-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2">{u.msnv}</td>
                <td className="px-3 py-2">{u.ho_ten}</td>
                <td className="px-3 py-2">{u.don_vi ?? ""}</td>
                <td className="px-3 py-2">{ROLE_LABEL[u.vai_tro ?? "user"] ?? u.vai_tro}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(u)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setResettingUser(u)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Đặt lại mật khẩu
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(u)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Xoá
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  Chưa có người dùng nào.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editingUser ? (
        <EditUserDialog
          user={editingUser}
          currentUserVaiTro={currentUserVaiTro}
          onClose={() => setEditingUser(null)}
        />
      ) : null}
      {resettingUser ? (
        <ResetPasswordDialog user={resettingUser} onClose={() => setResettingUser(null)} />
      ) : null}
    </div>
  );
}
