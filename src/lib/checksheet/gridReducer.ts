// Reducer THUẦN (pure function, không side-effect) quản lý toàn bộ state ô
// đã tô trên lưới checksheet + đánh dấu "dirty" (đã đổi, chưa lưu). Dùng qua
// `useReducer` ở ChecksheetApp.tsx. Vì là hàm thuần, verify được bằng script
// Node thuần không cần trình duyệt -- xem gridReducer.manual-test.ts.
import { cellKey, type KetQua, type ThucHienCell, type ThucHienMap } from "./types.ts";

export type GridState = {
  cells: ThucHienMap; // giá trị HIỆN TẠI đang hiển thị
  dirty: Set<string>; // cellKey của các ô đã đổi so với lúc tải
  initial: ThucHienMap; // snapshot lúc tải, để so sánh dirty và để revert
};

export type GridAction =
  | { type: "load"; cells: ThucHienMap }
  | { type: "setPlan"; congViecId: string; ngay: string; keHoach: boolean }
  | { type: "setAct"; congViecId: string; ngay: string; ketQua: KetQua }
  | { type: "markSaved"; keys: string[]; savedAt: string } // sau khi lưu thành công TOÀN BỘ (cả 2 field, hoặc chỉ 1 field từng dirty), đồng bộ lại initial + xoá dirty cho các key đó
  // markFieldsApplied: dùng khi upsert_thuc_hien() báo MỘT PHẦN của 1 ô được
  // áp dụng (vd Plan applied nhưng Actual bị từ chối trong CÙNG 1 lần lưu --
  // xem finding review Task 3). Chỉ field nào `planApplied`/`actApplied` mới
  // được đồng bộ vào `initial`; field còn lại giữ nguyên initial cũ (KHÔNG
  // đổi), nên nếu current value của field đó vẫn khác initial cũ, `dirty`
  // được TÍNH LẠI (không xoá cứng) và ô đó vẫn hiện "chưa lưu" đúng thực tế.
  | {
      type: "markFieldsApplied";
      entries: { congViecId: string; ngay: string; planApplied: boolean; actApplied: boolean }[];
      savedAt: string;
    };

const EMPTY_CELL: ThucHienCell = { id: null, keHoach: false, ketQua: "N", updatedAt: null };

export function initialGridState(cells: ThucHienMap = {}): GridState {
  return { cells, dirty: new Set(), initial: cells };
}

/**
 * So sánh 2 ô để quyết định còn "dirty" hay không. Nếu người dùng đổi 1 ô rồi
 * đổi NGƯỢC LẠI đúng giá trị ban đầu (keHoach + ketQua giống hệt lúc tải),
 * coi là KHÔNG dirty nữa -- tức là dirty được tính bằng so sánh giá trị hiện
 * tại với initial mỗi lần đổi, không phải 1 cờ "đã từng đổi" không đảo ngược
 * được. Lý do: tránh gửi lên server các ô thực chất không đổi gì so với DB,
 * đúng tinh thần "chỉ gửi ô đã đổi" của Task 3. Chỉ so keHoach/ketQua (2
 * trường người dùng thao tác được ở Task 2) -- không so id/updatedAt vì đó là
 * metadata server, không phải giá trị người dùng đổi.
 */
function isSameValue(a: ThucHienCell, b: ThucHienCell): boolean {
  return a.keHoach === b.keHoach && a.ketQua === b.ketQua;
}

function withCellUpdate(
  state: GridState,
  congViecId: string,
  ngay: string,
  patch: Partial<Pick<ThucHienCell, "keHoach" | "ketQua">>,
): GridState {
  const key = cellKey(congViecId, ngay);
  const current = state.cells[key] ?? EMPTY_CELL;
  const updated: ThucHienCell = { ...current, ...patch };

  const cells: ThucHienMap = { ...state.cells, [key]: updated };

  const original = state.initial[key] ?? EMPTY_CELL;
  const dirty = new Set(state.dirty);
  if (isSameValue(updated, original)) {
    dirty.delete(key);
  } else {
    dirty.add(key);
  }

  return { ...state, cells, dirty };
}

export function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case "load":
      return { cells: action.cells, dirty: new Set(), initial: action.cells };

    case "setPlan":
      return withCellUpdate(state, action.congViecId, action.ngay, { keHoach: action.keHoach });

    case "setAct":
      return withCellUpdate(state, action.congViecId, action.ngay, { ketQua: action.ketQua });

    case "markSaved": {
      const cells = { ...state.cells };
      const initial = { ...state.initial };
      const dirty = new Set(state.dirty);
      for (const key of action.keys) {
        const cell = cells[key];
        if (cell) {
          const withSavedAt: ThucHienCell = { ...cell, updatedAt: action.savedAt };
          cells[key] = withSavedAt;
          initial[key] = withSavedAt;
        }
        dirty.delete(key);
      }
      return { cells, dirty, initial };
    }

    case "markFieldsApplied": {
      const cells = { ...state.cells };
      const initial = { ...state.initial };
      const dirty = new Set(state.dirty);
      for (const { congViecId, ngay, planApplied, actApplied } of action.entries) {
        const key = cellKey(congViecId, ngay);
        const cell = cells[key];
        if (!cell) continue;
        const prevInitial = initial[key] ?? EMPTY_CELL;
        // Chỉ "khoá" lại field đã thực sự applied vào initial mới; field bị
        // từ chối giữ nguyên initial CŨ (giá trị server thật vẫn có), để so
        // sánh isSameValue bên dưới tự phát hiện field đó còn khác initial
        // (tức vẫn dirty) mà không cần đảo ngược giá trị current của người
        // dùng đang thao tác.
        const newInitial: ThucHienCell = {
          ...prevInitial,
          keHoach: planApplied ? cell.keHoach : prevInitial.keHoach,
          ketQua: actApplied ? cell.ketQua : prevInitial.ketQua,
          updatedAt: planApplied || actApplied ? action.savedAt : prevInitial.updatedAt,
          id: cell.id ?? prevInitial.id,
        };
        initial[key] = newInitial;
        if (isSameValue(cell, newInitial)) {
          dirty.delete(key);
        } else {
          dirty.add(key);
        }
      }
      return { cells, dirty, initial };
    }

    default:
      return state;
  }
}
