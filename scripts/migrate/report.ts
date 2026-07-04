// Pha 7 (Task 1) — in báo cáo đối chiếu số liệu ra console (tiếng Việt),
// theo đúng "Verify" của Task 1 (docs/plans/pha7-data-migration.md).
import type { MigrationModel } from "./types.ts";

const MAX_WARNINGS_SHOWN = 50;

export function printSummary(model: MigrationModel): void {
  const soLuongR = model.thucHien.filter((t) => t.ketQua === "R").length;

  console.log("");
  console.log("========== BÁO CÁO MIGRATION MODEL (Pha 7 - Task 1) ==========");
  console.log(`NGUOIDUNG dự kiến:         ${model.nguoiDung.length}`);
  console.log(`THIETBI dự kiến:           ${model.thietBi.length}`);
  console.log(`CHITIET dự kiến:           ${model.chiTiet.length}`);
  console.log(`CONGVIEC dự kiến:          ${model.congViec.length}`);
  console.log(`THUC_HIEN dự kiến:         ${model.thucHien.length}`);
  console.log(`  trong đó ket_qua='R':    ${soLuongR}  (=> sẽ tạo tương ứng ${soLuongR} BAT_THUONG)`);
  console.log(`ORPHAN_THUC_HIEN:          ${model.orphanThucHien.length}`);
  console.log(`LEGACY_LOGS (Logs gốc):    ${model.logs.length}`);
  console.log(`WARNINGS:                  ${model.warnings.length}`);
  console.log("================================================================");

  if (model.orphanThucHien.length > 0) {
    console.log("");
    console.log(`-- Chi tiết orphanThucHien (tối đa ${MAX_WARNINGS_SHOWN} dòng đầu) --`);
    for (const o of model.orphanThucHien.slice(0, MAX_WARNINGS_SHOWN)) {
      console.log(
        `  [${o.lyDo}] thietBi=${o.thietBi} thangNam=${o.thangNam} ngay=${o.ngay ?? "?"} tenChiTiet="${o.tenChiTiet}" loai=${o.loaiHoatDong} giaTri=${o.giaTriO} legacyRowId=${o.legacyRowId}`,
      );
    }
    if (model.orphanThucHien.length > MAX_WARNINGS_SHOWN) {
      console.log(`  ... còn ${model.orphanThucHien.length - MAX_WARNINGS_SHOWN} dòng orphan khác.`);
    }
  }

  if (model.warnings.length > 0) {
    console.log("");
    console.log(`-- Chi tiết warnings (tối đa ${MAX_WARNINGS_SHOWN} dòng đầu) --`);
    for (const w of model.warnings.slice(0, MAX_WARNINGS_SHOWN)) {
      console.log(`  - ${w}`);
    }
    if (model.warnings.length > MAX_WARNINGS_SHOWN) {
      console.log(`  ... còn ${model.warnings.length - MAX_WARNINGS_SHOWN} cảnh báo khác.`);
    }
  }
  console.log("");
}
