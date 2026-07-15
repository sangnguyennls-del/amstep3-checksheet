import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import { AppLogo } from "@/components/AppLogo";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/checksheet");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-[#0d6efd]/5 px-4">
      <div className="w-full max-w-sm rounded-xl border border-[#dee2e6] bg-white p-8 shadow-sm shadow-[#0d6efd]/5">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <AppLogo heightPx={44} />
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            Checksheet AM Bước 3
          </h1>
          <p className="text-sm text-gray-500">Bảo trì tự quản — PVCFC</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
