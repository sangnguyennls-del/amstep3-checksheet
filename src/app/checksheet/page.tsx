import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { getFilterOptions } from "@/lib/checksheet/queries";
import { ui } from "@/lib/ui";
import { ChecksheetApp } from "./ChecksheetApp";
import { NotificationBell } from "./NotificationBell";
import { AppLogo } from "@/components/AppLogo";

export default async function ChecksheetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("nguoidung")
    .select("msnv, ho_ten, vai_tro, xuong, kip, nhom")
    .eq("id", user.id)
    .maybeSingle();

  const filterOptions = await getFilterOptions(supabase);
  const isAdmin = profile?.vai_tro === "admin" || profile?.vai_tro === "adminm";

  return (
    <>
      <header className="no-print sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <AppLogo heightPx={32} />
            <h1 className="text-base font-semibold tracking-tight whitespace-nowrap text-gray-900">
              <span className="hidden sm:inline">Checksheet AM Bước 3</span>
              <span className="sm:hidden">AM Bước 3</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {isAdmin ? (
              <Link href="/admin" className={ui.navLink}>
                Quản trị
              </Link>
            ) : null}
            <NotificationBell msnv={profile?.msnv ?? null} />
            <span className="hidden sm:inline">
              {profile?.ho_ten ?? user.email}{" "}
              <span className="text-gray-400">({profile?.vai_tro || "user"})</span>
            </span>
            <form action={logout}>
              <button type="submit" className={`${ui.buttonSecondary} px-3! py-1.5!`}>
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1920px] p-6">
        <ChecksheetApp
          currentUser={{
            msnv: profile?.msnv ?? null,
            hoTen: profile?.ho_ten ?? user.email ?? "",
            vaiTro: profile?.vai_tro ?? null,
            xuong: profile?.xuong ?? null,
            kip: profile?.kip ?? null,
            nhom: profile?.nhom ?? null,
          }}
          filterOptions={filterOptions}
        />
      </main>
    </>
  );
}
