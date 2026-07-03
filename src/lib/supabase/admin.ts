import { createClient } from "@supabase/supabase-js";

// CHỈ import file này từ Server Action ("use server"). Service role bỏ
// qua toàn bộ RLS -- không bao giờ được dùng ở client component.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
