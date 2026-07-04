// Pha 7 (Task 4) — CLI entrypoint hoàn chỉnh, gộp Task 1-4 thành 1 pipeline
// chạy được từ đầu tới cuối. Xem docs/plans/pha7-data-migration.md mục
// "Task 4" để biết đặc tả đầy đủ.
//
// Cách chạy:
//   node scripts/migrate/run.ts            # dry-run (mặc định, KHÔNG ghi DB)
//   node scripts/migrate/run.ts --commit   # ghi thật vào DB + Supabase Auth
//
// Biến môi trường bắt buộc (đọc từ process.env, tự động nạp thêm từ
// `.env.local` ở thư mục gốc dự án nếu file đó tồn tại — KHÔNG ghi đè biến đã
// có sẵn trong process.env, không thêm dependency `dotenv`):
//   SUPABASE_DB_URL            — connection string Postgres trực tiếp.
//   NEXT_PUBLIC_SUPABASE_URL   — dùng để tạo Supabase Admin client (chỉ cho
//                                 auth.admin.createUser()).
//   SUPABASE_SERVICE_ROLE_KEY  — service role key tương ứng.
//   MIGRATION_XLSX_PATH        — đường dẫn file .xlsx nguồn thật.
//   MIGRATION_TEMP_PASSWORD    — mật khẩu tạm chung cho toàn bộ user migrate.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import { buildMigrationModel } from "./buildModel.ts";
import { getPgClient } from "./db.ts";
import { migrateChiTietCongViec, migrateThietBi } from "./migrateEquipment.ts";
import { migrateAnhUrl } from "./migrateImages.ts";
import { migrateLegacyLogs } from "./migrateLogs.ts";
import { migrateOrphanThucHien } from "./migrateOrphans.ts";
import { dedupeThucHien, migrateThucHienBatch } from "./migrateThucHien.ts";
import { migrateNguoiDung } from "./migrateUsers.ts";
import { loadWorkbook, readImagesRows } from "./readXlsx.ts";
import { printSummary } from "./report.ts";
import type { MigrationModel } from "./types.ts";

// -----------------------------------------------------------------------------
// Nạp .env.local (tự viết parser đơn giản KEY=VALUE theo dòng, bỏ qua dòng
// comment "#" và dòng trống — không thêm dependency `dotenv`). CHỈ điền các
// biến CHƯA có sẵn trong process.env (không ghi đè biến người chạy đã tự
// `export`/set thủ công trước khi gọi script).
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

interface RequiredEnv {
  xlsxPath: string;
  dbUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  tempPassword: string;
}

function validateEnv(): RequiredEnv {
  const xlsxPath = process.env.MIGRATION_XLSX_PATH;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tempPassword = process.env.MIGRATION_TEMP_PASSWORD;

  const missing = (
    [
      ["SUPABASE_DB_URL", dbUrl],
      ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
      ["MIGRATION_XLSX_PATH", xlsxPath],
      ["MIGRATION_TEMP_PASSWORD", tempPassword],
    ] as const
  ).filter(([, v]) => !v);

  if (missing.length > 0) {
    console.error(
      `LỖI: thiếu biến môi trường bắt buộc: ${missing.map(([k]) => k).join(", ")}.\n` +
        "Đặt các biến này trong .env.local (đọc tự động) hoặc `export`/`$env:` trước khi chạy.\n" +
        "Xem docs/plans/pha7-data-migration.md mục 'Global Constraints' để biết ý nghĩa từng biến.",
    );
    process.exit(1);
  }

  return {
    xlsxPath: xlsxPath!,
    dbUrl: dbUrl!,
    supabaseUrl: supabaseUrl!,
    serviceRoleKey: serviceRoleKey!,
    tempPassword: tempPassword!,
  };
}

// -----------------------------------------------------------------------------
// Ghi đè thủ công có chủ đích, hardcode CHÍNH XÁC 1 MSNV đã biết — KHÔNG khái
// quát hoá thành "hạ quyền mọi adminm". Bối cảnh: trigger `fn_guard_vai_tro_
// change` (migration 0005, KHÔNG thuộc phạm vi sửa của Pha 7) khiến việc
// INSERT trực tiếp `vai_tro='adminm'` qua kết nối `pg` (không phải qua đúng
// service-role connection thật của PostgREST) LUÔN bị chặn — đã điều tra tận
// gốc ở Task 3 (xem .superpowers/sdd/task-3-report.md mục "Phát hiện quan
// trọng nhất"). Người vận hành (đã được hỏi ý kiến) quyết định: tạo user này
// với vai_tro='admin' thay vì 'adminm', và TỰ nâng cấp thủ công sau qua
// Supabase Studio SQL Editor (nơi có quyền cao hơn 1 kết nối `pg` thường).
// -----------------------------------------------------------------------------
const ADMINM_DOWNGRADE_MSNV = "001310";

function applyAdminMDowngradeOverride(model: MigrationModel): void {
  const idx = model.nguoiDung.findIndex((u) => u.msnv === ADMINM_DOWNGRADE_MSNV);
  if (idx === -1) return; // không có trong dữ liệu lần chạy này — không làm gì.

  const user = model.nguoiDung[idx];
  if (user.vaiTro !== "adminm") return; // đã không còn là adminm (dữ liệu nguồn đổi) — không cần override.

  console.log("");
  console.log(
    "################################################################################",
  );
  console.log(
    "## GHI ĐÈ THỦ CÔNG CÓ CHỦ ĐÍCH (one-off, KHÔNG áp dụng chung cho mọi adminm)   ##",
  );
  console.log(
    `## MSNV ${ADMINM_DOWNGRADE_MSNV} (username "${user.username}", họ tên "${user.hoTen}") sẽ được    ##`,
  );
  console.log(
    '## tạo với vai_tro="admin" THAY VÌ "adminm" — bug tiền hữu ở trigger          ##',
  );
  console.log(
    "## fn_guard_vai_tro_change (0005) chặn INSERT vai_tro='adminm' qua kết nối    ##",
  );
  console.log(
    "## `pg` trực tiếp trong MỌI trường hợp (đã điều tra tận gốc ở Task 3).        ##",
  );
  console.log(
    "##                                                                            ##",
  );
  console.log(
    "## ==> SAU KHI MIGRATE XONG, NGƯỜI VẬN HÀNH PHẢI TỰ CHẠY LỆNH SAU QUA         ##",
  );
  console.log(
    "##     SUPABASE STUDIO SQL EDITOR (không phải qua script này):               ##",
  );
  console.log(
    `##     UPDATE nguoidung SET vai_tro = 'adminm' WHERE msnv = '${ADMINM_DOWNGRADE_MSNV}';`.padEnd(
      80,
    ) + "##",
  );
  console.log(
    "################################################################################",
  );
  console.log("");

  model.nguoiDung[idx] = { ...user, vaiTro: "admin" };
}

async function printFinalReconciliation(client: Client, model: MigrationModel) {
  const soLuongR = model.thucHien.filter((t) => t.ketQua === "R").length;

  // Chạy TUẦN TỰ (không Promise.all) — `pg.Client` chỉ dùng 1 kết nối duy
  // nhất, gửi nhiều query đồng thời trên cùng 1 client sẽ bị `pg` cảnh báo
  // "already executing a query" (deprecated, sẽ bị loại bỏ ở pg@9). Không ảnh
  // hưởng tới tính đúng đắn (đã verify), nhưng tuần tự hoá cho sạch cảnh báo.
  const thietbiCount = await client.query<{ count: string }>("select count(*) from thietbi");
  const chitietCount = await client.query<{ count: string }>("select count(*) from chitiet");
  const congviecCount = await client.query<{ count: string }>("select count(*) from congviec");
  const nguoidungCount = await client.query<{ count: string }>("select count(*) from nguoidung");
  const thucHienCount = await client.query<{ count: string }>("select count(*) from thuc_hien");
  const batThuongCount = await client.query<{ count: string }>("select count(*) from bat_thuong");
  const legacyLogsCount = await client.query<{ count: string }>(
    "select count(*) from legacy_logs_import",
  );
  const legacyOrphanCount = await client.query<{ count: string }>(
    "select count(*) from legacy_orphan_thuc_hien",
  );

  const rows: Array<{ bang: string; thucTe: number; kyVong: number }> = [
    { bang: "thietbi", thucTe: Number(thietbiCount.rows[0].count), kyVong: model.thietBi.length },
    { bang: "chitiet", thucTe: Number(chitietCount.rows[0].count), kyVong: model.chiTiet.length },
    { bang: "congviec", thucTe: Number(congviecCount.rows[0].count), kyVong: model.congViec.length },
    {
      bang: "nguoidung",
      thucTe: Number(nguoidungCount.rows[0].count),
      kyVong: model.nguoiDung.length,
    },
    { bang: "thuc_hien", thucTe: Number(thucHienCount.rows[0].count), kyVong: model.thucHien.length },
    { bang: "bat_thuong", thucTe: Number(batThuongCount.rows[0].count), kyVong: soLuongR },
    {
      bang: "legacy_logs_import",
      thucTe: Number(legacyLogsCount.rows[0].count),
      kyVong: model.logs.length,
    },
    {
      bang: "legacy_orphan_thuc_hien",
      thucTe: Number(legacyOrphanCount.rows[0].count),
      kyVong: model.orphanThucHien.length,
    },
  ];

  console.log("");
  console.log("========== BÁO CÁO ĐỐI CHIẾU CUỐI CÙNG (DB thật vs Model dự kiến) ==========");
  let coLech = false;
  for (const r of rows) {
    const khop = r.thucTe === r.kyVong;
    if (!khop) coLech = true;
    console.log(
      `${r.bang.padEnd(24)} DB thật=${String(r.thucTe).padEnd(8)} model dự kiến=${String(r.kyVong).padEnd(8)} ${khop ? "✅ khớp" : "❌ LỆCH"}`,
    );
  }
  console.log("=============================================================================");

  if (coLech) {
    console.warn("");
    console.warn(
      "########################################################################",
    );
    console.warn(
      "## CẢNH BÁO: CÓ BẢNG LỆCH SỐ LIỆU SO VỚI MODEL DỰ KIẾN — XEM BẢNG TRÊN  ##",
    );
    console.warn(
      "## Nguyên nhân có thể chấp nhận được: (1) nguoidung lệch đúng 1 dòng    ##",
    );
    console.warn(
      "##   nếu ADMINM_DOWNGRADE_MSNV không áp dụng được (hiếm, xem log phía   ##",
    );
    console.warn(
      "##   trên); (2) chạy lại lần 2 trên DB đã có dữ liệu từ lần trước KHÔNG  ##",
    );
    console.warn(
      "##   phải nguyên nhân hợp lệ ở đây vì đối chiếu này luôn so với TỔNG SỐ ##",
    );
    console.warn(
      "##   THẬT trong DB, không phải số mới tạo — LỆCH LUÔN LÀ DẤU HIỆU CẦN   ##",
    );
    console.warn(
      "##   ĐIỀU TRA nếu không rơi vào lý do (1) ở trên.                       ##",
    );
    console.warn(
      "########################################################################",
    );
  } else {
    console.log("");
    console.log("Toàn bộ số liệu DB thật khớp CHÍNH XÁC với model dự kiến. Không có cảnh báo.");
  }
}

async function main() {
  loadEnvLocal();
  const env = validateEnv();

  const commit = process.argv.includes("--commit");
  console.log(`Chế độ chạy: ${commit ? "--commit (GHI THẬT vào DB + Auth)" : "dry-run (mặc định, KHÔNG ghi gì)"}`);

  const wb = loadWorkbook(env.xlsxPath);
  const model = buildMigrationModel(wb);

  // Gộp/tách các dòng THUC_HIEN dự kiến bị trùng khoá (congviec_id, ngay) —
  // phát hiện MỚI ở Task 4, KHÔNG có trong plan ban đầu (xem comment chi tiết
  // đầu file migrateThucHien.ts). Áp dụng TRƯỚC printSummary để báo cáo (cả
  // dry-run lẫn commit) phản ánh đúng số liệu THẬT sẽ ghi vào DB, không phải
  // số thô 39562 (đã bao gồm cả các dòng trùng lặp/mâu thuẫn cần xử lý).
  const { thucHien: dedupedThucHien, conflictOrphans } = dedupeThucHien(model.thucHien);
  model.thucHien = dedupedThucHien;
  model.orphanThucHien = [...model.orphanThucHien, ...conflictOrphans];

  // Ghi đè thủ công có chủ đích cho MSNV 001310 (xem hàm ở trên) — áp dụng
  // TRƯỚC printSummary/kiểm tra dry-run (không chỉ trước migrateNguoiDung) để
  // cảnh báo lớn này luôn hiện ra ngay cả khi chạy dry-run, giúp người vận
  // hành thấy trước khi quyết định --commit thật. Hàm này chỉ mutate model
  // trong bộ nhớ + log ra console, không có side effect nào khác nên an toàn
  // gọi ở cả 2 chế độ.
  applyAdminMDowngradeOverride(model);

  printSummary(model);

  if (!commit) {
    console.log(
      "Dry-run: KHÔNG ghi gì vào DB/Auth. Chạy lại với `--commit` để ghi thật sau khi đã soát kỹ báo cáo ở trên.",
    );
    return;
  }

  const supabaseAdmin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pgClient = await getPgClient();
  try {
    // 1. THIETBI + CHITIET + CONGVIEC.
    const thietBiIdMap = await migrateThietBi(pgClient, model.thietBi, { commit });
    const congViecIdMap = await migrateChiTietCongViec(
      pgClient,
      model.chiTiet,
      model.congViec,
      thietBiIdMap,
      { commit },
    );

    // 2. NGUOIDUNG (Supabase Auth + profile) + anh_url.
    await migrateNguoiDung(supabaseAdmin, pgClient, model.nguoiDung, env.tempPassword, { commit });
    await migrateAnhUrl(pgClient, readImagesRows(wb), thietBiIdMap, { commit });

    // 3. Backfill nguoi_phu_trach: gọi lại migrateThietBi SAU migrateNguoiDung
    //    (xem carry-forward Task 2 -> Task 4 trong plan/JSDoc migrateEquipment.ts).
    //    Đây thuần tuý là 1 lượt backfill — không tạo mới THIETBI/CHITIET/CONGVIEC
    //    nào (tất cả đã tồn tại từ bước 1).
    await migrateThietBi(pgClient, model.thietBi, { commit });

    // 4. THUC_HIEN (+ BAT_THUONG cho ket_qua='R').
    await migrateThucHienBatch(pgClient, model.thucHien, congViecIdMap, { commit });

    // 5. Logs cũ + orphan.
    await migrateLegacyLogs(pgClient, model.logs, { commit });
    await migrateOrphanThucHien(pgClient, model.orphanThucHien, { commit });

    // 6. Báo cáo đối chiếu cuối cùng.
    await printFinalReconciliation(pgClient, model);
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
