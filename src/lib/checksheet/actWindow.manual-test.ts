// Test thuần Node cho `isWithinActWindow` (KHÔNG dùng framework test nào) --
// pure function, không đọc đồng hồ hệ thống, nên chạy trực tiếp bằng `node`
// không cần trình duyệt/build step. FILE VĨNH VIỄN, KHÔNG XOÁ -- cùng kiểu
// với gridReducer.manual-test.ts (Task 2). Chạy:
//   node src/lib/checksheet/actWindow.manual-test.ts
import assert from "node:assert";
import { isWithinActWindow } from "./actWindow.ts";

function run() {
  const today = "2026-07-15";

  // Đúng hôm nay -- luôn trong cửa sổ.
  assert.strictEqual(isWithinActWindow(today, today), true, "đúng hôm nay phải trong cửa sổ");

  // Biên +-4 ngày -- vẫn trong cửa sổ.
  assert.strictEqual(isWithinActWindow("2026-07-11", today), true, "hôm nay - 4 ngày phải trong cửa sổ");
  assert.strictEqual(isWithinActWindow("2026-07-19", today), true, "hôm nay + 4 ngày phải trong cửa sổ");

  // Ngoài biên +-4 ngày (5 ngày) -- ngoài cửa sổ.
  assert.strictEqual(isWithinActWindow("2026-07-10", today), false, "hôm nay - 5 ngày phải NGOÀI cửa sổ");
  assert.strictEqual(isWithinActWindow("2026-07-20", today), false, "hôm nay + 5 ngày phải NGOÀI cửa sổ");

  // Xa hẳn -- ngoài cửa sổ.
  assert.strictEqual(isWithinActWindow("2026-06-01", today), false, "cách xa 1 tháng rưỡi phải NGOÀI cửa sổ");
  assert.strictEqual(isWithinActWindow("2026-08-30", today), false, "cách xa tương lai phải NGOÀI cửa sổ");

  // Vượt ranh giới tháng/năm -- vẫn tính đúng theo số ngày thực, không theo
  // số ngày trong tháng.
  assert.strictEqual(isWithinActWindow("2026-07-31", "2026-07-30"), true, "31/07 cách 30/07 đúng 1 ngày");
  assert.strictEqual(isWithinActWindow("2026-08-01", "2026-07-30"), true, "01/08 cách 30/07 đúng 2 ngày");
  assert.strictEqual(isWithinActWindow("2027-01-02", "2026-12-30"), true, "vượt ranh giới năm, cách đúng 3 ngày");
  assert.strictEqual(isWithinActWindow("2027-01-04", "2026-12-30"), false, "vượt ranh giới năm, cách 5 ngày phải NGOÀI cửa sổ");

  console.log("actWindow.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run();
