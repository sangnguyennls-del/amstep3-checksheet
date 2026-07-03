// Test thuần Node cho gridReducer (KHÔNG dùng framework test nào) -- pure
// function nên chạy trực tiếp bằng `node` không cần trình duyệt/build step.
// FILE VĨNH VIỄN, KHÔNG XOÁ -- đáng giữ làm regression check thủ công (chạy
// bằng tay, không có CI). Chạy: `node src/lib/checksheet/gridReducer.manual-test.ts`
// (Node >= 22.6 hỗ trợ chạy .ts trực tiếp qua type-stripping có sẵn, đã xác
// nhận hoạt động trên Node v24 dùng trong repo này -- không cần cài `tsx`.)
import assert from "node:assert";
import { gridReducer, initialGridState, type GridState } from "./gridReducer.ts";
import { cellKey } from "./types.ts";

function run() {
  // --- setPlan: bật/tắt đúng ---
  let state: GridState = initialGridState({});
  state = gridReducer(state, {
    type: "setPlan",
    congViecId: "CV1",
    ngay: "2026-07-01",
    keHoach: true,
  });
  const k1 = cellKey("CV1", "2026-07-01");
  assert.strictEqual(state.cells[k1].keHoach, true, "setPlan phải bật keHoach=true");
  assert.strictEqual(state.cells[k1].ketQua, "N", "setPlan không được đụng vào ketQua");
  assert.ok(state.dirty.has(k1), "ô vừa đổi phải nằm trong dirty");

  state = gridReducer(state, {
    type: "setPlan",
    congViecId: "CV1",
    ngay: "2026-07-01",
    keHoach: false,
  });
  assert.strictEqual(state.cells[k1].keHoach, false, "setPlan phải tắt lại được keHoach=false");
  assert.ok(
    !state.dirty.has(k1),
    "đổi về đúng giá trị ban đầu (keHoach=false, ketQua=N) thì KHÔNG còn dirty",
  );

  // --- setAct: đổi đúng giá trị ---
  state = gridReducer(state, { type: "setAct", congViecId: "CV1", ngay: "2026-07-01", ketQua: "G" });
  assert.strictEqual(state.cells[k1].ketQua, "G", "setAct phải đổi ketQua");
  assert.ok(state.dirty.has(k1), "ô vừa đổi ketQua phải dirty");

  // setAct hỗ trợ kỹ thuật cho ketQua "R" dù Task 2 không có UI nào gọi nó
  // (theo brief: Task 4 sẽ tái dùng action này cho luồng bất thường).
  state = gridReducer(state, { type: "setAct", congViecId: "CV1", ngay: "2026-07-01", ketQua: "R" });
  assert.strictEqual(state.cells[k1].ketQua, "R", "setAct phải chấp nhận ketQua=R về mặt kỹ thuật");

  // --- dirty đúng tập hợp sau nhiều thao tác trên nhiều ô ---
  state = initialGridState({});
  const k2 = cellKey("CV2", "2026-07-05");
  const k3 = cellKey("CV3", "2026-07-10");
  state = gridReducer(state, { type: "setPlan", congViecId: "CV2", ngay: "2026-07-05", keHoach: true });
  state = gridReducer(state, { type: "setAct", congViecId: "CV3", ngay: "2026-07-10", ketQua: "G" });
  assert.deepStrictEqual(
    new Set(state.dirty),
    new Set([k2, k3]),
    "dirty phải chứa đúng 2 key vừa đổi, không hơn không kém",
  );

  // --- load: reset cells/dirty/initial đúng ---
  const loadedCells = {
    [k1]: { id: "id-1", keHoach: true, ketQua: "G" as const, updatedAt: "2026-06-01T00:00:00Z" },
  };
  state = gridReducer(state, { type: "load", cells: loadedCells });
  assert.deepStrictEqual(state.cells, loadedCells, "load phải thay thế cells");
  assert.strictEqual(state.dirty.size, 0, "load phải xoá sạch dirty");
  assert.deepStrictEqual(state.initial, loadedCells, "load phải đặt initial = cells vừa tải");

  // --- markSaved: xoá đúng key khỏi dirty và đồng bộ initial ---
  state = gridReducer(state, {
    type: "setPlan",
    congViecId: "CV1",
    ngay: "2026-07-01",
    keHoach: false,
  });
  assert.ok(state.dirty.has(k1), "vừa đổi Plan nên phải dirty");

  const savedAt = "2026-07-02T00:00:00Z";
  state = gridReducer(state, { type: "markSaved", keys: [k1], savedAt });
  assert.ok(!state.dirty.has(k1), "markSaved phải xoá key khỏi dirty");
  assert.strictEqual(state.cells[k1].updatedAt, savedAt, "markSaved phải cập nhật updatedAt trong cells");
  assert.deepStrictEqual(
    state.initial[k1],
    state.cells[k1],
    "markSaved phải đồng bộ initial[key] = cells[key] hiện tại",
  );

  // markSaved với 1 key không tồn tại trong cells không được throw, chỉ bỏ qua.
  assert.doesNotThrow(() => {
    gridReducer(state, { type: "markSaved", keys: ["khong-ton-tai"], savedAt });
  });

  // --- markFieldsApplied: fix review finding Task 3 (Important) -- 1 ô có
  // CẢ Plan lẫn Actual dirty trong cùng 1 lần lưu, server chỉ applied được
  // Plan (Actual bị từ chối, vd ngoài cửa sổ +-4 ngày). Field bị từ chối
  // KHÔNG được ghi vào `initial`, nên ô đó phải VẪN CÒN dirty sau đó (chỉ
  // phần Actual), khác hẳn `markSaved` (vốn coi cả ô là sạch bất kể field nào
  // thực sự applied).
  state = initialGridState({
    [k1]: { id: "id-1", keHoach: false, ketQua: "G", updatedAt: "2026-06-01T00:00:00Z" },
  });
  state = gridReducer(state, { type: "setPlan", congViecId: "CV1", ngay: "2026-07-01", keHoach: true });
  state = gridReducer(state, { type: "setAct", congViecId: "CV1", ngay: "2026-07-01", ketQua: "N" });
  assert.ok(state.dirty.has(k1), "cả Plan lẫn Actual vừa đổi nên ô phải dirty");

  const partialSavedAt = "2026-07-03T00:00:00Z";
  state = gridReducer(state, {
    type: "markFieldsApplied",
    entries: [{ congViecId: "CV1", ngay: "2026-07-01", planApplied: true, actApplied: false }],
    savedAt: partialSavedAt,
  });
  assert.ok(
    state.dirty.has(k1),
    "markFieldsApplied: Actual bị từ chối (actApplied=false) nên ô phải VẪN CÒN dirty, không được xoá sạch",
  );
  assert.strictEqual(
    state.initial[k1].keHoach,
    true,
    "markFieldsApplied: Plan applied phải được đồng bộ vào initial",
  );
  assert.strictEqual(
    state.initial[k1].ketQua,
    "G",
    "markFieldsApplied: Actual bị từ chối phải GIỮ NGUYÊN initial cũ (G), không được đồng bộ giá trị N vừa gõ",
  );
  assert.strictEqual(
    state.cells[k1].ketQua,
    "N",
    "markFieldsApplied: giá trị HIỆN TẠI người dùng đang gõ (N) không bị đảo ngược -- vẫn hiện trên UI, chỉ không được coi là đã lưu",
  );

  // Khi CẢ 2 field đều applied, ô phải sạch hoàn toàn (tương đương markSaved).
  state = gridReducer(state, {
    type: "markFieldsApplied",
    entries: [{ congViecId: "CV1", ngay: "2026-07-01", planApplied: true, actApplied: true }],
    savedAt: "2026-07-04T00:00:00Z",
  });
  assert.ok(!state.dirty.has(k1), "markFieldsApplied: cả 2 field applied thì ô phải hết dirty");
  assert.strictEqual(state.initial[k1].ketQua, "N", "markFieldsApplied: Actual applied lần này phải đồng bộ initial");

  // --- Đảm bảo hàm là THUẦN: không mutate state đầu vào ---
  const before = initialGridState({});
  const beforeSnapshot = JSON.parse(JSON.stringify({ cells: before.cells, dirty: [...before.dirty] }));
  gridReducer(before, { type: "setPlan", congViecId: "CVX", ngay: "2026-07-01", keHoach: true });
  const afterSnapshot = JSON.parse(JSON.stringify({ cells: before.cells, dirty: [...before.dirty] }));
  assert.deepStrictEqual(beforeSnapshot, afterSnapshot, "gridReducer không được mutate state đầu vào");

  console.log("gridReducer.manual-test.ts: TẤT CẢ ASSERT PASS");
}

run();
