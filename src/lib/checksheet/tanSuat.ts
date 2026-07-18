// Đơn vị tần suất chuẩn: đơn vị của `tan_suat_chu` (còn `tan_suat_so` là số
// lần). Dùng CHUNG cho: dropdown nhập ở các form (Sửa/Thêm công việc trên
// checksheet, form quản trị thiết bị) VÀ phân cột NGÀY/TUẦN/THÁNG/QUÝ trên lưới
// (ChecksheetTable.matchTanSuatCol). `tan_suat_chu` vẫn là cột text nullable ở
// DB (0001_schema.sql) -- enum này chỉ ràng buộc đầu vào phía client, không
// phải CHECK constraint.
export const TAN_SUAT_UNITS = ["Ngày", "Tuần", "Tháng", "Quý"] as const;

export type TanSuatUnit = (typeof TAN_SUAT_UNITS)[number];

/**
 * Danh sách option cho dropdown tần suất. Nếu `current` là một giá trị cũ KHÔNG
 * thuộc 4 đơn vị chuẩn (dữ liệu nhập tay từ hệ cũ), chèn nó lên đầu để form Sửa
 * không âm thầm làm mất/đổi giá trị đang có. Gọi không tham số (hoặc null/"")
 * cho form tạo mới -> chỉ 4 đơn vị chuẩn.
 */
export function tanSuatOptions(current?: string | null): string[] {
  const cur = (current ?? "").trim();
  if (cur !== "" && !TAN_SUAT_UNITS.includes(cur as TanSuatUnit)) {
    return [cur, ...TAN_SUAT_UNITS];
  }
  return [...TAN_SUAT_UNITS];
}
