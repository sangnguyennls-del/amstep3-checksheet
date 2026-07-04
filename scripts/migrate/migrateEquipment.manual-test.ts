// Pha 7 (Task 2) — kiểm tra thủ công migrateThietBi()/migrateChiTietCongViec()
// bằng cách chạy thật trên file .xlsx nguồn + Postgres local Supabase (KHÔNG
// commit file .xlsx vào repo). FILE VĨNH VIỄN, cùng kiểu với
// buildModel.manual-test.ts (Task 1). Chạy (PowerShell):
//   $env:MIGRATION_XLSX_PATH="D:\Sang\Work\PVCFC\AM\AM Step 3.xlsx"
//   $env:SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//   node scripts/migrate/migrateEquipment.manual-test.ts [--commit]
//
// Mặc định (không có --commit) là dry-run: chỉ đếm, KHÔNG ghi DB.
import assert from "node:assert";
import { buildMigrationModel } from "./buildModel.ts";
import { getPgClient } from "./db.ts";
import { migrateChiTietCongViec, migrateThietBi } from "./migrateEquipment.ts";
import { loadWorkbook, readThietBiFullList } from "./readXlsx.ts";

async function run() {
  const xlsxPath = process.env.MIGRATION_XLSX_PATH;
  if (!xlsxPath) {
    console.log(
      "Bỏ qua migrateEquipment.manual-test.ts: biến môi trường MIGRATION_XLSX_PATH chưa được set.",
    );
    return;
  }
  if (!process.env.SUPABASE_DB_URL) {
    console.log(
      "Bỏ qua migrateEquipment.manual-test.ts: biến môi trường SUPABASE_DB_URL chưa được set.",
    );
    return;
  }

  const commit = process.argv.includes("--commit");
  console.log(`Chế độ chạy: ${commit ? "--commit (GHI THẬT vào DB)" : "dry-run (mặc định)"}`);

  const wb = loadWorkbook(xlsxPath);
  const model = buildMigrationModel(wb);
  console.log(
    `Model (Task 1): THIETBI=${model.thietBi.length} CHITIET=${model.chiTiet.length} CONGVIEC=${model.congViec.length}`,
  );

  const client = await getPgClient();
  try {
    const thietBiIdMap = await migrateThietBi(client, model.thietBi, { commit });
    assert.strictEqual(
      thietBiIdMap.size,
      model.thietBi.length,
      "thietBiIdMap phải có đúng 1 entry cho mỗi thiết bị trong model",
    );

    const congViecIdMap = await migrateChiTietCongViec(
      client,
      model.chiTiet,
      model.congViec,
      thietBiIdMap,
      { commit },
    );
    assert.strictEqual(
      congViecIdMap.size,
      model.congViec.length,
      "congViecIdMap phải có đúng 1 entry cho mỗi CONGVIEC trong model",
    );

    if (commit) {
      // Đối chiếu số dòng thật trong DB với model.
      const countThietBi = await client.query<{ count: string }>("select count(*) from thietbi");
      const countChiTiet = await client.query<{ count: string }>("select count(*) from chitiet");
      const countCongViec = await client.query<{ count: string }>("select count(*) from congviec");
      console.log(
        `DB thật sau khi ghi: thietbi=${countThietBi.rows[0].count} chitiet=${countChiTiet.rows[0].count} congviec=${countCongViec.rows[0].count}`,
      );

      // Sample: E06105A phải có xuong/kip đúng như Config. LƯU Ý: nguoi_phu_trach
      // sẽ là NULL ở lần chạy này vì bảng `nguoidung` (Task 3, chưa build) đang
      // rỗng — đây là hành vi ĐÚNG dự kiến của cơ chế FK-ordering-tolerant (xem
      // JSDoc migrateThietBi trong migrateEquipment.ts). Ta chứng minh cơ chế
      // backfill hoạt động đúng bằng cách chèn 1 nguoidung giả cho msnv của
      // E06105A rồi CHẠY LẠI migrateThietBi, xác nhận nguoi_phu_trach được
      // tự động backfill mà KHÔNG cần insert lại thietbi.
      const e06105a = model.thietBi.find((t) => t.maThietBi === "E06105A");
      if (e06105a) {
        const row = await client.query(
          "select ma_thiet_bi, xuong, kip, nguoi_phu_trach from thietbi where ma_thiet_bi = $1",
          ["E06105A"],
        );
        console.log("Mẫu E06105A trong DB (trước khi có nguoidung):", row.rows[0]);
        console.log("Mẫu E06105A trong model:", {
          xuong: e06105a.xuong,
          kip: e06105a.kip,
          nguoiPhuTrach: e06105a.nguoiPhuTrach,
        });
        assert.strictEqual(row.rows[0]?.xuong, e06105a.xuong, "E06105A: xuong phải khớp model");
        assert.strictEqual(row.rows[0]?.kip, e06105a.kip, "E06105A: kip phải khớp model");
        // nguoi_phu_trach phải là NULL (chưa có nguoidung) HOẶC đã đúng bằng
        // giá trị model (nếu 1 lần chạy trước đó trong CÙNG DB đã backfill,
        // vd khi script này chạy lại lần 2 trên 1 DB chưa reset) — không được
        // là 1 giá trị KHÁC.
        assert.ok(
          row.rows[0]?.nguoi_phu_trach === null || row.rows[0]?.nguoi_phu_trach === e06105a.nguoiPhuTrach,
          "E06105A: nguoi_phu_trach phải là NULL (chưa có nguoidung) hoặc đã khớp model (đã backfill từ lần chạy trước)",
        );

        if (e06105a.nguoiPhuTrach) {
          // Demo cơ chế backfill: chèn 1 auth.users + nguoidung giả (mô phỏng
          // việc Task 3 chạy migrateNguoiDung sau đó), rồi chạy lại migrateThietBi.
          const fakeAuthId = "00000000-0000-0000-0000-000000000001";
          await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [
            fakeAuthId,
          ]);
          await client.query(
            `insert into nguoidung (id, msnv, ho_ten, vai_tro) values ($1, $2, 'Test Backfill', 'user')
             on conflict do nothing`,
            [fakeAuthId, e06105a.nguoiPhuTrach],
          );
          await migrateThietBi(client, [e06105a], { commit: true });
          const rowAfter = await client.query(
            "select nguoi_phu_trach from thietbi where ma_thiet_bi = $1",
            ["E06105A"],
          );
          console.log("Mẫu E06105A trong DB (sau khi backfill nguoidung + chạy lại migrateThietBi):", rowAfter.rows[0]);
          assert.strictEqual(
            rowAfter.rows[0]?.nguoi_phu_trach,
            e06105a.nguoiPhuTrach,
            "E06105A: nguoi_phu_trach phải được backfill đúng sau khi nguoidung tồn tại",
          );
        }
      } else {
        console.log("(Bỏ qua kiểm tra mẫu E06105A: không có trong model lần chạy này.)");
      }

      // Thiết bị tách từ mã ghép E06119-E06120-E06121: mỗi cái phải có CHITIET
      // /CONGVIEC riêng, số lượng bằng nhau (nhân bản y hệt).
      const counts: number[] = [];
      for (const ma of ["E06119", "E06120", "E06121"]) {
        const tbRow = await client.query("select id from thietbi where ma_thiet_bi = $1", [ma]);
        assert.strictEqual(tbRow.rows.length, 1, `Thiết bị tách "${ma}" phải tồn tại trong DB`);
        const ctCount = await client.query(
          "select count(*) from chitiet where thietbi_id = $1",
          [tbRow.rows[0].id],
        );
        console.log(`Thiết bị tách ${ma}: id=${tbRow.rows[0].id}, số CHITIET=${ctCount.rows[0].count}`);
        counts.push(Number(ctCount.rows[0].count));
      }
      assert.ok(
        counts.every((c) => c === counts[0]) && counts[0] > 0,
        `3 thiết bị tách từ mã ghép phải có SỐ CHITIET bằng nhau và > 0 (thực tế: ${counts.join(", ")})`,
      );
    }

    // Đối chiếu: tổng số thiết bị trong model phải >= số thiết bị trong danh
    // sách đầy đủ "Thiết bị " (169 theo Task 1).
    const fullList = readThietBiFullList(wb);
    assert.ok(
      model.thietBi.length >= fullList.length,
      `Model THIETBI (${model.thietBi.length}) phải >= danh sách đầy đủ (${fullList.length})`,
    );
  } finally {
    await client.end();
  }

  console.log("migrateEquipment.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
