import { createBrowserClient } from "@supabase/ssr";
import { crossSiteCookieOptions } from "./cookieOptions";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Refresh token phía client cũng phải ghi cookie SameSite=None+Partitioned ở
    // production, nếu không lần refresh sẽ ghi đè bằng cookie Lax và hỏng lại
    // trong iframe. Xem cookieOptions.ts.
    { cookieOptions: crossSiteCookieOptions },
  );
}
