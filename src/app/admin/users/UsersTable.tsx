"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  type UserActionState,
} from "@/app/actions/users";
import { ui } from "@/lib/ui";
import { SearchableSelect } from "@/components/SearchableSelect";

export type UserRow = {
  id: string;
  msnv: string;
  ho_ten: string;
  xuong: string | null;
  kip: string | null;
  nhom: string | null;
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
    <select name={name} defaultValue={defaultValue} className={ui.input}>
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
      <button type="button" onClick={() => setOpen((v) => !v)} className={ui.buttonPrimary}>
        {open ? "Đóng" : "+ Thêm người dùng"}
      </button>

      {open ? (
        <form action={formAction} className={`mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 ${ui.card}`}>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Tài khoản</label>
            <input name="username" required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Mật khẩu</label>
            <input name="password" type="password" required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>MSNV</label>
            <input name="msnv" required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Họ tên</label>
            <input name="hoTen" required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Xưởng</label>
            <input name="xuong" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Kíp</label>
            <input name="kip" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Nhóm nhỏ</label>
            <input name="nhom" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Vai trò</label>
            <RoleSelect name="vaiTro" defaultValue="user" currentUserVaiTro={currentUserVaiTro} />
          </div>

          {state.error ? (
            <p role="alert" className={`col-span-full ${ui.errorText}`}>
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className={`col-span-full ${ui.successText}`}>Tạo người dùng thành công.</p>
          ) : null}

          <div className="col-span-full">
            <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Sửa người dùng {user.msnv}</h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={user.id} />
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Họ tên</label>
            <input name="hoTen" defaultValue={user.ho_ten} required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Xưởng</label>
            <input name="xuong" defaultValue={user.xuong ?? ""} className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Kíp</label>
            <input name="kip" defaultValue={user.kip ?? ""} className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Nhóm nhỏ</label>
            <input name="nhom" defaultValue={user.nhom ?? ""} className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Vai trò</label>
            <RoleSelect
              name="vaiTro"
              defaultValue={user.vai_tro ?? "user"}
              currentUserVaiTro={currentUserVaiTro}
            />
          </div>

          {state.error ? (
            <p role="alert" className={ui.errorText}>
              {state.error}
            </p>
          ) : null}
          {state.success ? <p className={ui.successText}>Đã lưu.</p> : null}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={ui.buttonSecondary}>
              Đóng
            </button>
            <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Đặt lại mật khẩu cho {user.msnv}
        </h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={user.id} />
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Mật khẩu mới</label>
            <input name="newPassword" type="password" required className={ui.input} />
          </div>

          {state.error ? (
            <p role="alert" className={ui.errorText}>
              {state.error}
            </p>
          ) : null}
          {state.success ? <p className={ui.successText}>Đã đặt lại mật khẩu.</p> : null}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={ui.buttonSecondary}>
              Đóng
            </button>
            <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
              {isPending ? "Đang lưu..." : "Đặt lại"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
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

  const [filterXuong, setFilterXuong] = useState("");
  const [filterKip, setFilterKip] = useState("");
  const [filterNhom, setFilterNhom] = useState("");
  const [filterVaiTro, setFilterVaiTro] = useState("");

  const xuongOptions = uniqueSorted(users.map((u) => u.xuong));
  const kipOptions = uniqueSorted(users.map((u) => u.kip));
  const nhomOptions = uniqueSorted(users.map((u) => u.nhom));

  const filteredUsers = users.filter(
    (u) =>
      (!filterXuong || u.xuong === filterXuong) &&
      (!filterKip || u.kip === filterKip) &&
      (!filterNhom || u.nhom === filterNhom) &&
      (!filterVaiTro || (u.vai_tro ?? "user") === filterVaiTro),
  );

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

      {deleteError ? <p className={`mb-3 ${ui.errorText}`}>{deleteError}</p> : null}

      {/* Mục 11: bộ lọc gõ-tìm không dấu (SearchableSelect); riêng Vai trò
          chỉ có 3 giá trị cố định nên giữ <select> thuần. */}
      <div className={`mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 ${ui.card}`}>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Xưởng</label>
          <SearchableSelect
            value={filterXuong}
            onChange={setFilterXuong}
            options={xuongOptions.map((x) => ({ value: x, label: x }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Kíp</label>
          <SearchableSelect
            value={filterKip}
            onChange={setFilterKip}
            options={kipOptions.map((k) => ({ value: k, label: k }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Nhóm nhỏ</label>
          <SearchableSelect
            value={filterNhom}
            onChange={setFilterNhom}
            options={nhomOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Vai trò</label>
          <select value={filterVaiTro} onChange={(e) => setFilterVaiTro(e.target.value)} className={ui.input}>
            <option value="">-- Tất cả --</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="adminm">AdminM</option>
          </select>
        </div>
      </div>

      <div className={`overflow-x-auto ${ui.card} p-0!`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">MSNV</th>
              <th className="px-4 py-2.5">Họ tên</th>
              <th className="px-4 py-2.5">Xưởng</th>
              <th className="px-4 py-2.5">Kíp</th>
              <th className="px-4 py-2.5">Nhóm nhỏ</th>
              <th className="px-4 py-2.5">Vai trò</th>
              <th className="px-4 py-2.5">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{u.msnv}</td>
                <td className="px-4 py-2.5">{u.ho_ten}</td>
                <td className="px-4 py-2.5 text-gray-600">{u.xuong ?? ""}</td>
                <td className="px-4 py-2.5 text-gray-600">{u.kip ?? ""}</td>
                <td className="px-4 py-2.5 text-gray-600">{u.nhom ?? ""}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      u.vai_tro === "adminm"
                        ? "rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                        : u.vai_tro === "admin"
                          ? "rounded-full bg-[#0066cc]/10 px-2 py-0.5 text-xs font-medium text-[#0066cc]"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                    }
                  >
                    {ROLE_LABEL[u.vai_tro ?? "user"] ?? u.vai_tro}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(u)}
                      className={`${ui.buttonSecondary} px-2! py-1! text-xs!`}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setResettingUser(u)}
                      className={`${ui.buttonSecondary} px-2! py-1! text-xs!`}
                    >
                      Đặt lại mật khẩu
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(u)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Xoá
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {users.length === 0 ? "Chưa có người dùng nào." : "Không có người dùng khớp bộ lọc."}
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
