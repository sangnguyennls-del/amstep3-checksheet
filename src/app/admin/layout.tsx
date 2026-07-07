import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ui } from "@/lib/ui";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/checksheet");
  }

  return (
    <div className="min-h-screen">
      {/* no-print: khi in hàng loạt từ /admin/stats (Task 3, Pha 6), print.css
          chỉ ẩn phần tử có class `no-print` (mô hình opt-out, không phải
          "ẩn tất cả trừ .print-area") -- layout admin (nav) là 1 trong các
          phần khung cần ẩn để bản in chỉ còn đúng checksheet thiết bị. */}
      <nav className="no-print sticky top-0 z-10 flex items-center gap-5 border-b border-gray-200 bg-white/90 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0066cc] text-[11px] font-semibold text-white">
            AM
          </div>
          <span className="text-sm font-semibold text-gray-900">Quản trị</span>
        </div>
        <AdminNav />
        <Link href="/checksheet" className={`ml-auto ${ui.navLink}`}>
          Về Checksheet
        </Link>
      </nav>
      <main className="mx-auto w-full max-w-[1920px] p-6">{children}</main>
    </div>
  );
}
