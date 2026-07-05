// Pha 8 (Task 2) — export + purge audit_log định kỳ, tránh chạm trần 500MB
// free tier Supabase. Xem docs/plans/pha8-audit-cron.md mục "Task 2" +
// "Global Constraints" cho đặc tả đầy đủ.
//
// Cách chạy:
//   node scripts/audit/exportAndPurge.ts            # dry-run (mặc định, KHÔNG xoá DB)
//   node scripts/audit/exportAndPurge.ts --commit   # export ra file + xoá thật khỏi audit_log
//
// Biến môi trường bắt buộc (đọc từ process.env, tự động nạp thêm từ
// `.env.local` ở thư mục gốc dự án nếu file đó tồn tại — theo đúng quy ước
// `scripts/migrate/run.ts`, KHÔNG ghi đè biến đã có sẵn, KHÔNG thêm dependency
// `dotenv`):
//   SUPABASE_DB_URL — connection string Postgres trực tiếp.
//
// Ngưỡng retention hardcode 90 ngày (xem Global Constraints — không phải hành
// vi nghiệp vụ người dùng cuối cấu hình được, không cần đưa vào bảng cai_dat).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { getPgClient } from "../migrate/db.ts";

const RETENTION_DAYS = 90;
const WHERE_CLAUSE = `thoi_gian < now() - interval '${RETENTION_DAYS} days'`;

// -----------------------------------------------------------------------------
// Nạp .env.local — parser đơn giản, giống hệt `scripts/migrate/run.ts` (không
// lặp lại logic import chéo thư mục, copy trực tiếp vì đây là hàm tự chứa nhỏ,
// không đáng để tách thành tiện ích dùng chung giữa 2 thư mục scripts độc lập).
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

function validateEnv(): void {
  if (!process.env.SUPABASE_DB_URL) {
    console.error(
      "LỖI: thiếu biến môi trường bắt buộc SUPABASE_DB_URL.\n" +
        "Đặt biến này trong .env.local (đọc tự động) hoặc `export`/`$env:` trước khi chạy.",
    );
    process.exit(1);
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTimestamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

async function main() {
  loadEnvLocal();
  validateEnv();

  const commit = process.argv.includes("--commit");
  console.log(
    `Chế độ chạy: ${commit ? "--commit (GHI THẬT: xoá khỏi audit_log sau khi export xong)" : "dry-run (mặc định, KHÔNG xoá gì)"}`,
  );
  console.log(`Ngưỡng retention: ${RETENTION_DAYS} ngày (điều kiện: ${WHERE_CLAUSE}).`);

  const client = await getPgClient();
  try {
    const selectResult = await client.query(
      `select * from audit_log where ${WHERE_CLAUSE} order by id asc`,
    );
    const rows = selectResult.rows;

    if (rows.length === 0) {
      console.log("Không có dòng audit_log nào cũ hơn ngưỡng retention — không có gì để export/purge.");
      return;
    }

    console.log(`Tìm thấy ${rows.length} dòng audit_log cần export/purge.`);

    const tmpDir = resolve(process.cwd(), "scripts/audit/tmp");
    mkdirSync(tmpDir, { recursive: true });

    const filename = `audit-log-export-${formatTimestamp(new Date())}.ndjson.gz`;
    const filePath = resolve(tmpDir, filename);

    const ndjson = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    const compressed = gzipSync(Buffer.from(ndjson, "utf-8"));
    writeFileSync(filePath, compressed);

    // Đọc lại file vừa ghi, đếm số dòng, so khớp CHÍNH XÁC với số dòng query
    // được — nếu lệch, DỪNG NGAY, KHÔNG xoá gì (xem Global Constraints).
    const readBack = readFileSync(filePath);
    const decompressed = gunzipSync(readBack).toString("utf-8");
    const lines = decompressed.split("\n").filter((l) => l.length > 0);

    if (lines.length !== rows.length) {
      // throw (không process.exit) để `finally { client.end() }` bên dưới
      // vẫn chạy, đóng kết nối đúng cách trước khi main().catch() thoát lỗi.
      throw new Error(
        `số dòng đọc lại từ file (${lines.length}) KHÔNG khớp số dòng query được (${rows.length}). ` +
          "DỪNG NGAY, KHÔNG xoá gì khỏi audit_log. Kiểm tra lại file tại " +
          filePath,
      );
    }

    console.log(`Đã export ${lines.length} dòng ra file: ${filePath} (${compressed.length} bytes nén).`);
    console.log("Đã xác nhận số dòng đọc lại từ file KHỚP CHÍNH XÁC số dòng đã query.");

    if (!commit) {
      console.log(
        "Dry-run: KHÔNG xoá gì khỏi audit_log. Chạy lại với `--commit` để xoá thật sau khi đã soát kỹ file export ở trên.",
      );
      return;
    }

    const deleteResult = await client.query(`delete from audit_log where ${WHERE_CLAUSE}`);
    console.log(`Đã xoá ${deleteResult.rowCount} dòng khỏi audit_log (điều kiện: ${WHERE_CLAUSE}).`);

    if (deleteResult.rowCount !== rows.length) {
      console.warn(
        `LƯU Ý: số dòng đã xoá (${deleteResult.rowCount}) khác số dòng đã export (${rows.length}) — ` +
          "đây là hành vi ĐÚNG và có chủ đích nếu có audit_log mới sinh ra thoả điều kiện thời gian " +
          "giữa lúc SELECT và lúc DELETE (không xảy ra trong thực tế vì mọi dòng mới đều có thoi_gian=now(), " +
          "không thể lệch quá 90 ngày về quá khứ — xem giải thích ở Global Constraints), nhưng vẫn nên kiểm tra nếu thấy cảnh báo này.",
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
