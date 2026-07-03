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
    }
  // applyBatThuong: Task 4 -- luồng bất thường (Actual="R") KHÔNG đi qua
  // hàng đợi dirty/nút Lưu như Plan/Actual thường (setPlan/setAct đều
  // OPTIMISTIC: đổi state trước, lưu server sau). RPC
  // `set_ket_qua_r_with_bat_thuong` tự lưu thẳng xuống DB ngay khi gọi, nên
  // đây là action riêng, chỉ dispatch SAU KHI RPC đã thành công (xem
  // BatThuongModal.tsx/ChecksheetApp.handleBatThuongApplied) -- ghi thẳng vào
  // CẢ `cells` LẪN `initial` cùng lúc (khác setAct chỉ ghi `cells` rồi tính
  // lại dirty) để ô không bao giờ bị coi là "dirty" (đã lưu xong, không có gì
  // để Lưu lại qua nút Lưu thường -- nút Lưu thường còn CHẶN gửi ket_qua="R"
  // tường minh, xem ChecksheetApp.handleSave). Không tái dùng `markFieldsApplied`
  // vì action đó giả định giá trị current đã tồn tại trong `cells` từ TRƯỚC
  // (do người dùng gõ optimistic) và chỉ đồng bộ `initial` theo field applied
  // -- ở đây giá trị R chưa hề có trong `cells` (bị chặn không dispatch cho
  // tới khi RPC xong), nên cần 1 action ghi cả 2 nơi cùng lúc với đầy đủ
  // metadata mới (id, updatedAt, batThuongMoTa) mà `markFieldsApplied` không
  // nhận tham số nào cho.
  | {
      type: "applyBatThuong";
      congViecId: string;
      ngay: string;
      thuChienId: string;
      updatedAt: string;
      moTa: string;
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

    case "applyBatThuong": {
      const key = cellKey(action.congViecId, action.ngay);
      const currentCell = state.cells[key] ?? EMPTY_CELL;
      const newCell: ThucHienCell = {
        id: action.thuChienId,
        keHoach: currentCell.keHoach,
        ketQua: "R",
        updatedAt: action.updatedAt,
        batThuongMoTa: action.moTa,
      };
      const cells: ThucHienMap = { ...state.cells, [key]: newCell };
      // RPC set_ket_qua_r_with_bat_thuong KHÔNG lưu keHoach xuống DB: khi
      // INSERT (ô mới) nó hard-code ke_hoach=false; khi UPDATE (ô đã có) nó
      // không đụng tới ke_hoach hiện có. Vậy initial.keHoach phải lấy từ
      // initial CŨ (giá trị server thật trước lệnh gọi này), KHÔNG phải từ
      // currentCell.keHoach optimistic -- nếu người dùng vừa tick Plan
      // (chưa lưu) rồi mới trigger luồng R, giá trị Plan optimistic đó CHƯA
      // hề được RPC này ghi xuống DB.
      const prevInitial = state.initial[key] ?? EMPTY_CELL;
      const newInitial: ThucHienCell = { ...newCell, keHoach: prevInitial.keHoach };
      const initial: ThucHienMap = { ...state.initial, [key]: newInitial };
      // Tính lại dirty bằng so sánh giá trị hiện tại (có thể còn giữ 1 lượt
      // tick Plan optimistic chưa lưu) với initial mới -- KHÔNG xoá cứng,
      // để Plan optimistic đó không bị "coi như đã lưu" một cách sai lệch
      // (xem finding review cuối branch: silently mất Plan sau reload).
      const dirty = new Set(state.dirty);
      if (isSameValue(newCell, newInitial)) {
        dirty.delete(key);
      } else {
        dirty.add(key);
      }
      return { cells, dirty, initial };
    }

    default:
      return state;
  }
}
