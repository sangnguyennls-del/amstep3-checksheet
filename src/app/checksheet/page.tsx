import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { getFilterOptions } from "@/lib/checksheet/queries";
import { ChecksheetApp } from "./ChecksheetApp";

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
    .select("msnv, ho_ten, vai_tro")
    .eq("id", user.id)
    .maybeSingle();

  const filterOptions = await getFilterOptions(supabase);

  return (
    <main className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Checksheet AM Bước 3</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>
            {profile?.ho_ten ?? user.email} ({profile?.vai_tro || "user"})
          </span>
          <form action={logout}>
            <button type="submit" className="rounded-md border px-3 py-1.5 hover:bg-gray-50">
              Đăng xuất
            </button>
          </form>
        </div>
      </div>

      <ChecksheetApp
        currentUser={{ msnv: profile?.msnv ?? null, hoTen: profile?.ho_ten ?? user.email ?? "" }}
        filterOptions={filterOptions}
      />
    </main>
  );
}
