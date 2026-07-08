import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { UsersTable, type UserRow } from "./UsersTable";

export default async function AdminUsersPage() {
  const { vaiTro } = await requireAdmin();

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("nguoidung")
    .select("id, msnv, ho_ten, don_vi, xuong, kip, vai_tro")
    .order("msnv");

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold tracking-tight text-gray-900">Quản lý người dùng</h1>
      <UsersTable users={(users ?? []) as UserRow[]} currentUserVaiTro={vaiTro} />
    </div>
  );
}
