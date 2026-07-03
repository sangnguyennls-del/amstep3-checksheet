// Hàm THUẦN cho luồng ghi nhận bất thường (Task 4, Actual="R"). Validate
// `mo_ta` Ở CLIENT TRƯỚC KHI gọi RPC `set_ket_qua_r_with_bat_thuong` -- RPC đó
// (0002_functions_triggers.sql) raise exception nếu `p_mo_ta` rỗng, nhưng bắt
// lỗi phải round-trip lên server mới biết là UX tệ (xem Global Constraints
// trong docs/plans/pha4-checksheet-grid.md, mục RPC set_ket_qua_r_with_bat_thuong).
// Test bằng Node thuần, không cần trình duyệt -- xem batThuong.manual-test.ts.

/**
 * Validate `mo_ta` (mô tả bất thường) trước khi gọi RPC. Trả về thông báo lỗi
 * tiếng Việt (hiện trực tiếp trong form) nếu không hợp lệ, `null` nếu hợp lệ.
 */
export function validateBatThuongMoTa(text: string): string | null {
  if (text.trim() === "") {
    return "Mô tả bất thường không được để trống.";
  }
  return null;
}
