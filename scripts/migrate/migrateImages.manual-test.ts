// Pha 7 (Task 3) — kiểm tra thủ công migrateAnhUrl() bằng cách chạy thật trên
// file .xlsx nguồn + Postgres local Supabase (KHÔNG commit file .xlsx vào
// repo). FILE VĨNH VIỄN, cùng kiểu với các *.manual-test.ts khác. Chạy (PowerShell):
//   $env:MIGRATION_XLSX_PATH="D:\Sang\Work\PVCFC\AM\AM Step 3.xlsx"
//   $env:SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//   node scripts/migrate/migrateImages.manual-test.ts [--commit]
//
// Mặc định (không có --commit) là dry-run.
//
// LƯU Ý: `migrateThietBi` (Task 2) đã ghi `anh_url` từ model (model đã merge
// Images ở buildModel.ts bước 4) ngay lúc INSERT, nên chạy `migrateAnhUrl`
// ngay sau đó thường là no-op cho các thiết bị đã có ảnh. Để thực sự luyện
// tới nhánh "cập nhật" (không chỉ nhánh "bỏ qua vì đã có"), script này CHỦ
// ĐỘNG xoá `anh_url` của 1 thiết bị mẫu trước khi gọi `migrateAnhUrl`, rồi
// xác nhận nó được backfill lại đúng — giống cách migrateEquipment.manual-test.ts
// demo cơ chế backfill nguoi_phu_trach.
import assert from "node:assert";
import { buildMigrationModel } from "./buildModel.ts";
import { getPgClient } from "./db.ts";
import { migrateChiTietCongViec, migrateThietBi } from "./migrateEquipment.ts";
import { migrateAnhUrl } from "./migrateImages.ts";
import { loadWorkbook, readImagesRows } from "./readXlsx.ts";

async function run() {
  const xlsxPath = process.env.MIGRATION_XLSX_PATH;
  if (!xlsxPath) {
    console.log(
      "Bỏ qua migrateImages.manual-test.ts: biến môi trường MIGRATION_XLSX_PATH chưa được set.",
    );
    return;
  }
  if (!process.env.SUPABASE_DB_URL) {
    console.log(
      "Bỏ qua migrateImages.manual-test.ts: biến môi trường SUPABASE_DB_URL chưa được set.",
    );
    return;
  }

  const commit = process.argv.includes("--commit");
  console.log(`Chế độ chạy: ${commit ? "--commit (GHI THẬT vào DB)" : "dry-run (mặc định)"}`);

  const wb = loadWorkbook(xlsxPath);
  const model = buildMigrationModel(wb);
  const rawImages = readImagesRows(wb);
  console.log(`Model (Task 1): THIETBI=${model.thietBi.length}, Images (raw)=${rawImages.length}`);

  const client = await getPgClient();
  try {
    const thietBiIdMap = await migrateThietBi(client, model.thietBi, { commit });
    await migrateChiTietCongViec(client, model.chiTiet, model.congViec, thietBiIdMap, { commit });

    if (commit) {
      // Đối chiếu ban đầu: các thiết bị có anh_url trong model phải khớp với
      // URL gốc trong DB (đã được migrateThietBi ghi trực tiếp từ model).
      const withImage = model.thietBi.filter((t) => t.anhUrl !== null).slice(0, 5);
      for (const t of withImage) {
        const row = await client.query(
          "select anh_url from thietbi where ma_thiet_bi = upper(trim($1))",
          [t.maThietBi],
        );
        console.log(`Mẫu ${t.maThietBi}: anh_url DB="${row.rows[0]?.anh_url}" model="${t.anhUrl}"`);
        assert.strictEqual(row.rows[0]?.anh_url, t.anhUrl, `${t.maThietBi}: anh_url DB phải khớp model`);
      }

      // Demo nhánh "cập nhật" thật của migrateAnhUrl: xoá anh_url của 1 thiết
      // bị mẫu (đang có ảnh), rồi gọi migrateAnhUrl, xác nhận được backfill
      // đúng trở lại từ sheet Images (không phải từ model đã merge).
      const sample = withImage[0];
      if (sample) {
        await client.query("update thietbi set anh_url = null where ma_thiet_bi = upper(trim($1))", [
          sample.maThietBi,
        ]);
        const cleared = await client.query(
          "select anh_url from thietbi where ma_thiet_bi = upper(trim($1))",
          [sample.maThietBi],
        );
        assert.strictEqual(cleared.rows[0]?.anh_url, null, "anh_url phải là NULL sau khi xoá thử nghiệm");

        await migrateAnhUrl(client, rawImages, thietBiIdMap, { commit: true });

        const restored = await client.query(
          "select anh_url from thietbi where ma_thiet_bi = upper(trim($1))",
          [sample.maThietBi],
        );
        console.log(
          `Sau khi xoá thử nghiệm rồi chạy migrateAnhUrl, ${sample.maThietBi}: anh_url="${restored.rows[0]?.anh_url}"`,
        );
        assert.strictEqual(
          restored.rows[0]?.anh_url,
          sample.anhUrl,
          `${sample.maThietBi}: migrateAnhUrl phải tự backfill lại đúng anh_url từ sheet Images`,
        );

        // Chạy lại lần 2: phải là no-op (không lỗi, không đổi giá trị) vì
        // anh_url đã có — xác nhận nhánh "bỏ qua vì đã có" hoạt động đúng.
        await migrateAnhUrl(client, rawImages, thietBiIdMap, { commit: true });
        const afterSecondRun = await client.query(
          "select anh_url from thietbi where ma_thiet_bi = upper(trim($1))",
          [sample.maThietBi],
        );
        assert.strictEqual(
          afterSecondRun.rows[0]?.anh_url,
          sample.anhUrl,
          `${sample.maThietBi}: chạy migrateAnhUrl lần 2 không được đổi giá trị (idempotent)`,
        );
      } else {
        console.log("(Bỏ qua demo backfill: không có thiết bị nào có anh_url trong model lần chạy này.)");
      }
    } else {
      await migrateAnhUrl(client, rawImages, thietBiIdMap, { commit: false });
    }
  } finally {
    await client.end();
  }

  console.log("migrateImages.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
