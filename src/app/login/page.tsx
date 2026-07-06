import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/checksheet");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-blue-50/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm shadow-blue-900/5">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-lg font-semibold tracking-tight text-white">
            AM
          </div>
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
