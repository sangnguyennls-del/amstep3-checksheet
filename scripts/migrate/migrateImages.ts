// Pha 7 (Task 3) — cập nhật `anh_url` cho các THIETBI đã tạo ở Task 2, theo
// sheet "Images". Xem docs/plans/pha7-data-migration.md mục "Task 3".
//
// LƯU Ý: `buildMigrationModel` (Task 1) đã tự gắn `anh_url` vào từng
// `ThietBiRecord` (bước 4 trong buildModel.ts) và `migrateThietBi` (Task 2)
// đã ghi giá trị đó lúc INSERT/backfill — nên trong luồng chạy đầy đủ
// (run.ts, Task 4), hàm này phần lớn sẽ là no-op (đã có sẵn `anh_url`). Vẫn
// giữ như 1 bước độc lập đọc THẲNG từ RawImageRow (không qua model đã merge)
// vì: (1) đúng theo file list Task 3 trong plan, (2) là lưới an toàn thứ 2 —
// nếu 1 thiết bị vì lý do nào đó bị lọt mất anh_url ở bước migrateThietBi
// (vd chạy migrateThietBi trước khi Task 1 gắn xong ảnh, hoặc chạy lại từng
// phần thủ công), bước này vẫn tự backfill đúng mà không ghi đè link admin
// đã tự sửa qua UI (`WHERE anh_url IS NULL`).
import type { Client } from "pg";
import type { MigrateOptions } from "./migrateEquipment.ts";
import { resolveDeviceCode } from "./normalize.ts";
import type { RawImageRow } from "./types.ts";

/**
 * Cập nhật `thietbi.anh_url` theo danh sách `images` (đọc thẳng từ sheet
 * "Images", `RawImageRow[]`, KHÔNG qua model đã merge). Với mỗi `(mã, url)`:
 * áp `resolveDeviceCode` phòng trường hợp mã ghép (giống bước 4 buildModel),
 * tra `id` qua `thietBiIdMap` (map `ma_thiet_bi -> id` do `migrateThietBi`
 * trả về), rồi `UPDATE ... WHERE id = $id AND anh_url IS NULL` — chỉ set nếu
 * đang trống, không ghi đè dữ liệu admin đã tự sửa tay qua /admin/equipment.
 */
export async function migrateAnhUrl(
  client: Client,
  images: RawImageRow[],
  thietBiIdMap: Map<string, string>,
  { commit }: MigrateOptions,
): Promise<void> {
  let soCapNhat = 0;
  let soBoQuaDaCo = 0;
  let soKhongTimThayThietBi = 0;

  for (const img of images) {
    const resolvedDevices = resolveDeviceCode(img.thietBi);
    for (const dev of resolvedDevices) {
      const id = thietBiIdMap.get(dev);
      if (!id) {
        soKhongTimThayThietBi++;
        console.warn(
          `migrateAnhUrl: thiết bị "${dev}" (từ mã gốc "${img.thietBi}" trong sheet Images) không có trong thietBiIdMap — bỏ qua ảnh này (kiểm tra lại đã gọi migrateThietBi trước chưa).`,
        );
        continue;
      }

      if (!commit) {
        // Dry-run: không UPDATE, không biết chắc thietbi đã có anh_url hay
        // chưa (không query), chỉ đếm như "sẽ xử lý" để báo cáo số lượng.
        soCapNhat++;
        continue;
      }

      const result = await client.query(
        `update thietbi set anh_url = $1, updated_at = now() where id = $2 and anh_url is null`,
        [img.url, id],
      );
      if (result.rowCount && result.rowCount > 0) {
        soCapNhat++;
      } else {
        soBoQuaDaCo++;
      }
    }
  }

  console.log(
    `migrateAnhUrl: ${commit ? "đã ghi" : "dự kiến (dry-run)"} — cập nhật: ${soCapNhat}, bỏ qua (đã có anh_url từ trước): ${soBoQuaDaCo}, không tìm thấy thiết bị: ${soKhongTimThayThietBi} (tổng ${images.length} dòng Images).`,
  );
}
