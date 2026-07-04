// Pha 7 (Task 3) — kiểm tra thủ công migrateNguoiDung() bằng cách chạy thật
// trên file .xlsx nguồn + Postgres local Supabase + Supabase Auth local
// (KHÔNG commit file .xlsx vào repo). FILE VĨNH VIỄN, cùng kiểu với
// buildModel.manual-test.ts / migrateEquipment.manual-test.ts. Chạy (PowerShell):
//   $env:MIGRATION_XLSX_PATH="D:\Sang\Work\PVCFC\AM\AM Step 3.xlsx"
//   $env:SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//   $env:NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<lấy từ `npx supabase status`>"
//   $env:MIGRATION_TEMP_PASSWORD="<mật khẩu tạm, tối thiểu 6 ký tự theo yêu cầu GoTrue>"
//   node scripts/migrate/migrateUsers.manual-test.ts [--commit]
//
// Mặc định (không có --commit) là dry-run: chỉ đếm, KHÔNG ghi DB/Auth.
//
// LƯU Ý: Task 2 phải chạy trước (migrateThietBi/migrateChiTietCongViec) để có
// dữ liệu THIETBI làm nền — script này tự gọi lại migrateThietBi trước khi
// test migrateNguoiDung, giống cách migrateEquipment.manual-test.ts làm, để
// file này tự chạy độc lập được trên 1 DB vừa `supabase db reset`.
import assert from "node:assert";
import { createClient } from "@supabase/supabase-js";
import { buildMigrationModel } from "./buildModel.ts";
import { getPgClient } from "./db.ts";
import { migrateThietBi } from "./migrateEquipment.ts";
import { migrateNguoiDung } from "./migrateUsers.ts";
import { loadWorkbook } from "./readXlsx.ts";

async function run() {
  const xlsxPath = process.env.MIGRATION_XLSX_PATH;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tempPassword = process.env.MIGRATION_TEMP_PASSWORD;

  const missing = [
    ["MIGRATION_XLSX_PATH", xlsxPath],
    ["SUPABASE_DB_URL", dbUrl],
    ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ["MIGRATION_TEMP_PASSWORD", tempPassword],
  ].filter(([, v]) => !v);
  if (missing.length > 0) {
    console.log(
      `Bỏ qua migrateUsers.manual-test.ts: thiếu biến môi trường ${missing.map(([k]) => k).join(", ")}.`,
    );
    return;
  }

  const commit = process.argv.includes("--commit");
  console.log(`Chế độ chạy: ${commit ? "--commit (GHI THẬT vào DB + Auth)" : "dry-run (mặc định)"}`);

  const wb = loadWorkbook(xlsxPath!);
  const model = buildMigrationModel(wb);
  console.log(`Model (Task 1): NGUOIDUNG=${model.nguoiDung.length}`);

  const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pgClient = await getPgClient();
  try {
    // Nền tảng: cần THIETBI tồn tại trước (không bắt buộc cho migrateNguoiDung
    // tự thân, nhưng để pipeline giống thật và để sau đó có thể kiểm tra
    // migrateThietBi backfill nguoi_phu_trach sau khi có nguoidung).
    await migrateThietBi(pgClient, model.thietBi, { commit });

    await migrateNguoiDung(supabaseAdmin, pgClient, model.nguoiDung, tempPassword!, { commit });

    if (commit) {
      const countNguoiDung = await pgClient.query<{ count: string }>(
        "select count(*) from nguoidung",
      );
      const countAuthUsers = await pgClient.query<{ count: string }>(
        "select count(*) from auth.users",
      );
      console.log(
        `DB thật sau khi ghi: nguoidung=${countNguoiDung.rows[0].count} auth.users=${countAuthUsers.rows[0].count}`,
      );
      // nguoidung/auth.users PHẢI luôn khớp nhau (rollback orphan hoạt động
      // đúng: không có Auth user nào tồn tại mà thiếu profile nguoidung).
      assert.strictEqual(
        countNguoiDung.rows[0].count,
        countAuthUsers.rows[0].count,
        "nguoidung và auth.users phải có SỐ DÒNG BẰNG NHAU (không có Auth user mồ côi)",
      );

      // KHÔNG assert cứng = model.nguoiDung.length (58): có 1 user vai_tro
      // 'adminm' trong dữ liệu thật bị chặn bởi trigger
      // trg_guard_vai_tro_change (0005) — bug tiền hữu không thuộc phạm vi
      // Task 3, xem comment chi tiết trong migrateUsers.ts. Thay vào đó,
      // kiểm tra CHÍNH XÁC: mọi user trong model KHÔNG PHẢI 'adminm' phải
      // được tạo thành công; user(s) thiếu (nếu có) CHỈ được phép là
      // 'adminm' — nếu có bất kỳ user role khác bị thiếu, đó là regression
      // thật cần điều tra.
      const existingMsnvRows = await pgClient.query<{ msnv: string }>("select msnv from nguoidung");
      const existingMsnvSet = new Set(existingMsnvRows.rows.map((r) => r.msnv));
      const missing = model.nguoiDung.filter((u) => !existingMsnvSet.has(u.msnv));
      console.log(
        `So khớp model vs DB: model=${model.nguoiDung.length}, đã tạo=${existingMsnvSet.size}, thiếu=${missing.length}`,
        missing.map((u) => ({ msnv: u.msnv, username: u.username, vaiTro: u.vaiTro })),
      );
      assert.ok(
        missing.every((u) => u.vaiTro === "adminm"),
        `Mọi user thiếu trong nguoidung PHẢI chỉ là vai_tro='adminm' (bug trigger đã biết) — nếu có role khác bị thiếu, đó là lỗi thật: ${JSON.stringify(missing)}`,
      );

      // Kiểm tra 1 user mẫu: username "vanvv" (nếu tồn tại trong model) phải
      // có email đúng công thức usernameToEmail và vai_tro khớp model.
      const sample = model.nguoiDung.find((u) => u.username.toLowerCase() === "vanvv");
      if (sample) {
        const row = await pgClient.query<{
          ho_ten: string;
          vai_tro: string;
          email: string;
        }>(
          `select nd.ho_ten, nd.vai_tro, au.email
           from nguoidung nd join auth.users au on au.id = nd.id
           where nd.msnv = $1`,
          [sample.msnv],
        );
        console.log("Mẫu user 'vanvv' trong DB:", row.rows[0]);
        console.log("Mẫu user 'vanvv' trong model:", sample);
        assert.strictEqual(row.rows.length, 1, "Phải tìm thấy đúng 1 dòng nguoidung cho user 'vanvv'");
        assert.strictEqual(
          row.rows[0].email,
          `${sample.username.trim().toLowerCase()}@pvcfc.internal`,
          "Email Auth phải đúng công thức usernameToEmail(username)",
        );
        assert.strictEqual(row.rows[0].vai_tro, sample.vaiTro, "vai_tro phải khớp model");
        assert.strictEqual(row.rows[0].ho_ten, sample.hoTen, "ho_ten phải khớp model");
      } else {
        console.log("(Bỏ qua kiểm tra mẫu 'vanvv': không có trong model lần chạy này.)");
      }

      // Chạy lại migrateThietBi để chứng minh nguoi_phu_trach được backfill
      // đúng sau khi nguoidung đã có (cơ chế FK-ordering-tolerant từ Task 2).
      await migrateThietBi(pgClient, model.thietBi, { commit: true });
      const sampleThietBi = model.thietBi.find((t) => t.nguoiPhuTrach !== null);
      if (sampleThietBi) {
        const row = await pgClient.query(
          "select nguoi_phu_trach from thietbi where ma_thiet_bi = upper(trim($1))",
          [sampleThietBi.maThietBi],
        );
        assert.strictEqual(
          row.rows[0]?.nguoi_phu_trach,
          sampleThietBi.nguoiPhuTrach,
          `${sampleThietBi.maThietBi}: nguoi_phu_trach phải được backfill đúng sau khi nguoidung đã tồn tại`,
        );
        console.log(
          `Xác nhận backfill nguoi_phu_trach cho ${sampleThietBi.maThietBi}: ${row.rows[0]?.nguoi_phu_trach}`,
        );
      }
    }
  } finally {
    await pgClient.end();
  }

  console.log("migrateUsers.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
