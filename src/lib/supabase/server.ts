import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { crossSiteCookieOptions } from "./cookieOptions";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...crossSiteCookieOptions }),
            );
          } catch {
            // Bỏ qua khi gọi từ Server Component không thể set cookie
            // (middleware sẽ đảm nhiệm refresh session trong trường hợp này).
          }
        },
      },
    },
  );
}
