// Pha 8 (Task 2) — ping giữ Supabase free tier khỏi bị tạm ngưng (pause sau 7
// ngày không có hoạt động DB thật — xem docs/plans/pha8-audit-cron.md mục
// "Bối cảnh"). Chạy 1 câu SELECT đơn giản, vô hại, không ghi gì vào DB.
//
// Cách chạy:
//   node scripts/audit/ping.ts
//
// Biến môi trường bắt buộc (đọc từ process.env, tự động nạp thêm từ
// `.env.local` nếu tồn tại — cùng quy ước với `scripts/migrate/run.ts` và
// `scripts/audit/exportAndPurge.ts`):
//   SUPABASE_DB_URL — connection string Postgres trực tiếp.
//
// Không có `--commit`/dry-run: một câu `select 1` không có gì để "ghi thật"
// ngoài việc kết nối, không có chế độ phá hoại nào cần chặn.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPgClient } from "../migrate/db.ts";

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

function validateEnv(): void {
  if (!process.env.SUPABASE_DB_URL) {
    console.error(
      "LỖI: thiếu biến môi trường bắt buộc SUPABASE_DB_URL.\n" +
        "Đặt biến này trong .env.local (đọc tự động) hoặc `export`/`$env:` trước khi chạy.",
    );
    process.exit(1);
  }
}

async function main() {
  loadEnvLocal();
  validateEnv();

  console.log("Đang kết nối Supabase Postgres để ping giữ hoạt động...");
  const client = await getPgClient();
  try {
    const result = await client.query("select 1 as ok");
    if (result.rows[0]?.ok !== 1) {
      throw new Error(`Kết quả SELECT không như mong đợi: ${JSON.stringify(result.rows)}`);
    }
    console.log("THÀNH CÔNG: kết nối + SELECT 1 chạy OK — đồng hồ tạm ngưng Supabase đã được reset.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("THẤT BẠI: không thể kết nối/ping Supabase:", err);
  process.exitCode = 1;
});
