// Test thuần Node cho validateBatThuongMoTa (KHÔNG dùng framework test nào) --
// pure function, chạy trực tiếp bằng `node` không cần trình duyệt/build step.
// FILE VĨNH VIỄN, KHÔNG XOÁ -- cùng kiểu với gridReducer.manual-test.ts (Task 2)
// và actWindow.manual-test.ts (Task 3). Chạy:
//   node src/lib/checksheet/batThuong.manual-test.ts
import assert from "node:assert";
import { validateBatThuongMoTa } from "./batThuong.ts";

function run() {
  assert.strictEqual(
    validateBatThuongMoTa(""),
    "Mô tả bất thường không được để trống.",
    "chuỗi rỗng phải bị chặn",
  );
  assert.strictEqual(
    validateBatThuongMoTa("   "),
    "Mô tả bất thường không được để trống.",
    "chuỗi chỉ có khoảng trắng phải bị chặn (trim trước khi kiểm tra)",
  );
  assert.strictEqual(
    validateBatThuongMoTa("Rò rỉ dầu tại khớp nối"),
    null,
    "mô tả hợp lệ phải trả về null (không lỗi)",
  );
  assert.strictEqual(
    validateBatThuongMoTa("  Kẹt van  "),
    null,
    "mô tả có khoảng trắng thừa 2 đầu nhưng có nội dung thật vẫn hợp lệ",
  );

  console.log("batThuong.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run();
