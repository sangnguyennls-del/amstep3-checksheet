import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/checksheet");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center gap-4 border-b bg-white px-6 py-3 text-sm">
        <span className="font-semibold text-gray-800">Quản trị</span>
        <Link href="/admin/users" className="text-gray-600 hover:text-blue-600">
          Người dùng
        </Link>
        <Link href="/admin/equipment" className="text-gray-600 hover:text-blue-600">
          Thiết bị
        </Link>
        <Link href="/admin/bat-thuong" className="text-gray-600 hover:text-blue-600">
          Bất thường
        </Link>
        <Link href="/admin/settings" className="text-gray-600 hover:text-blue-600">
          Cài đặt
        </Link>
        <Link href="/checksheet" className="ml-auto text-gray-600 hover:text-blue-600">
          Về Checksheet
        </Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
