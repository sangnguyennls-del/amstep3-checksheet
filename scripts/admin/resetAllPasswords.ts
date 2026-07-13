// Mục 2 (docs/QUYET-DINH.md 2026-07-13) — reset mật khẩu HÀNG LOẠT về
// "123456" cho mọi tài khoản TRỪ AdminM (không tự khoá cửa quản trị cao
// nhất). Chạy tay khi cần, không đưa vào UI. Người dùng tự đổi lại mật khẩu
// riêng bằng nút "Đổi mật khẩu" trên header sau khi đăng nhập.
//
// Cách chạy:
//   npx tsx scripts/admin/resetAllPasswords.ts            # dry-run (mặc định): chỉ in danh sách sẽ reset
//   npx tsx scripts/admin/resetAllPasswords.ts --commit   # reset thật qua Supabase Auth Admin API
//
// Biến môi trường bắt buộc (đọc từ process.env, tự nạp thêm từ `.env.local`
// theo đúng quy ước scripts/migrate/run.ts — KHÔNG ghi đè biến có sẵn):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const NEW_PASSWORD = "123456";

// -----------------------------------------------------------------------------
// Nạp .env.local — parser đơn giản, copy từ scripts/audit/exportAndPurge.ts
// (hàm tự chứa nhỏ, các thư mục scripts độc lập không share tiện ích chung).
// -----------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function validateEnv(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "LỖI: thiếu biến môi trường bắt buộc NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Đặt trong .env.local (đọc tự động) hoặc export trước khi chạy.",
    );
    process.exit(1);
  }
  return { supabaseUrl, serviceRoleKey };
}

async function main() {
  loadEnvLocal();
  const { supabaseUrl, serviceRoleKey } = validateEnv();
  const commit = process.argv.includes("--commit");

  console.log(
    `Chế độ chạy: ${commit ? "--commit (GHI THẬT: đổi mật khẩu qua Auth Admin API)" : "dry-run (mặc định, chỉ in danh sách)"}`,
  );

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // nguoidung.id chính là auth.users.id (FK, xem 0001_schema.sql) — duyệt
  // theo bảng hồ sơ để lọc được vai trò, không cần listUsers() phân trang.
  const { data: users, error } = await supabaseAdmin
    .from("nguoidung")
    .select("id, msnv, ho_ten, vai_tro")
    .order("msnv");

  if (error) {
    console.error("LỖI đọc bảng nguoidung:", error.message);
    process.exit(1);
  }

  const targets = (users ?? []).filter((u) => u.vai_tro !== "adminm");
  const skipped = (users ?? []).filter((u) => u.vai_tro === "adminm");

  console.log(`Tổng ${users?.length ?? 0} tài khoản; reset ${targets.length}; bỏ qua ${skipped.length} AdminM:`);
  for (const u of skipped) {
    console.log(`  [BỎ QUA - AdminM] ${u.msnv} — ${u.ho_ten}`);
  }

  if (!commit) {
    for (const u of targets) {
      console.log(`  [SẼ RESET] ${u.msnv} — ${u.ho_ten} (${u.vai_tro})`);
    }
    console.log(`\nDry-run xong. Chạy lại với --commit để reset thật về "${NEW_PASSWORD}".`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const u of targets) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
      password: NEW_PASSWORD,
    });
    if (updateError) {
      failed++;
      console.error(`  [LỖI]  ${u.msnv} — ${u.ho_ten}: ${updateError.message}`);
    } else {
      ok++;
      console.log(`  [XONG] ${u.msnv} — ${u.ho_ten}`);
    }
  }

  console.log(`\nHoàn tất: ${ok} thành công, ${failed} lỗi, ${skipped.length} AdminM giữ nguyên.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("LỖI không xử lý được:", e);
  process.exit(1);
});
