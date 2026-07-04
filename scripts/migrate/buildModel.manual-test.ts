// Pha 7 (Task 1) — kiểm tra thủ công buildMigrationModel() bằng cách chạy
// thật trên file .xlsx nguồn (KHÔNG commit file này vào repo, đường dẫn lấy
// từ biến môi trường MIGRATION_XLSX_PATH — xem docs/plans/pha7-data-migration.md).
// FILE VĨNH VIỄN, cùng kiểu với batThuong.manual-test.ts (Pha 3). Chạy:
//   MIGRATION_XLSX_PATH="D:\Sang\Work\PVCFC\AM\AM Step 3.xlsx" node scripts/migrate/buildModel.manual-test.ts
import assert from "node:assert";
import { buildMigrationModel } from "./buildModel.ts";
import { loadWorkbook } from "./readXlsx.ts";
import { printSummary } from "./report.ts";

function run() {
  const xlsxPath = process.env.MIGRATION_XLSX_PATH;
  if (!xlsxPath) {
    console.log(
      "Bỏ qua buildModel.manual-test.ts: biến môi trường MIGRATION_XLSX_PATH chưa được set " +
        "(cần trỏ tới file .xlsx nguồn thật để chạy kiểm tra này).",
    );
    return;
  }

  const wb = loadWorkbook(xlsxPath);
  const model = buildMigrationModel(wb);
  printSummary(model);

  // Các khẳng định đối chiếu với "Verify" của Task 1 trong
  // docs/plans/pha7-data-migration.md — chỉ assert những số liệu đã xác
  // minh vững chắc (đếm trực tiếp không phụ thuộc suy diễn), KHÔNG assert
  // cứng các số liệu mà việc phân tích lại cho kết quả lệch nhẹ so với plan
  // (xem task-1-report.md mục "Deviations" để biết chi tiết).
  assert.strictEqual(model.nguoiDung.length, 58, "phải có đúng 58 user thật (MSNV khác rỗng)");

  // M07601 (thiết bị Data-only, không có trong Config) tạo ra 0 orphan như
  // dự kiến của plan (toàn bộ 3 dòng của nó là "N|N", bị lọc trước khi match).
  const m07601Orphans = model.orphanThucHien.filter((o) => o.thietBi === "M07601");
  assert.strictEqual(m07601Orphans.length, 0, "M07601 không được phát sinh orphan (toàn N|N)");

  // KHÔNG có orphan nào do không khớp được CONGVIEC (đã fix lỗi whitespace
  // \n vs " " giữa Config/Data trong readXlsx.ts) -- mọi orphan còn lại phải
  // là do "Ngày không hợp lệ", một phát hiện MỚI ngoài dự kiến ban đầu của
  // plan: sheet Data có cột "31" ngay cả với tháng chỉ có 30 ngày (06/2026),
  // và người dùng cũ đã thực sự tick dữ liệu vào ô đó -- xem task-1-report.md.
  const noCongViecMatchOrphans = model.orphanThucHien.filter(
    (o) => o.lyDo === "Không tìm thấy CONGVIEC khớp",
  );
  assert.strictEqual(
    noCongViecMatchOrphans.length,
    0,
    `Không được có orphan do "Không tìm thấy CONGVIEC khớp" (nếu có nghĩa là còn bug matching) -- thực tế có ${noCongViecMatchOrphans.length}`,
  );
  const unexpectedReasonOrphans = model.orphanThucHien.filter(
    (o) => !o.lyDo.startsWith("Ngày không hợp lệ"),
  );
  assert.strictEqual(
    unexpectedReasonOrphans.length,
    0,
    `Toàn bộ orphan còn lại phải có lý do "Ngày không hợp lệ" (cột ngày 31 tồn tại cả ở tháng 30 ngày) -- có ${unexpectedReasonOrphans.length} orphan lý do khác`,
  );

  const haoWarnings = model.warnings.filter((w) => w.includes("Dương Văn Hào"));
  assert.strictEqual(
    haoWarnings.length,
    1,
    `phải có đúng 1 dòng cảnh báo về "Dương Văn Hào" không tra được MSNV -- thực tế có ${haoWarnings.length}`,
  );

  // THIETBI: 169 (danh sách đầy đủ) hợp với các thiết bị chỉ có trong Config
  // (vd T06105, T06106) -- không assert số chính xác vì phụ thuộc kết quả
  // resolveDeviceCode, chỉ assert cận dưới hợp lý.
  assert.ok(model.thietBi.length >= 169, `THIETBI phải >= 169, thực tế ${model.thietBi.length}`);

  console.log("buildModel.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run();
