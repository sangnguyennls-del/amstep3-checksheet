// Tiện ích dùng chung cho các bộ lọc/nhãn trên toàn app (checksheet + admin).

/**
 * Bỏ dấu tiếng Việt + lowercase để so khớp tìm kiếm/nhãn không phân biệt dấu.
 * (Chuyển từ ChecksheetTable.tsx sang đây để SearchableSelect và các bộ lọc
 * dùng chung -- một nguồn duy nhất.)
 */
export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Fix mục 3: giá trị mặc định của bộ lọc (lấy từ hồ sơ người đăng nhập) CHỈ
 * được áp khi nó thực sự tồn tại trong danh sách lựa chọn đang có -- nếu
 * không (vd nguoidung.nhom = "1" nhưng mọi thietbi.nhom đều NULL, hoặc
 * nguoidung.kip gõ tay "1" trong khi thietbi.kip là "Kíp 1") thì mặc định về
 * "" (Tất cả), tránh lọc rỗng toàn bộ danh sách + select hiển thị sai.
 */
export function defaultIfAvailable(value: string | null | undefined, options: (string | null)[]): string {
  if (!value) return "";
  return options.includes(value) ? value : "";
}

/**
 * Fix mục 5: nhiều thiết bị migrate từ Sheet cũ có ten_thiet_bi trùng y hệt
 * ma_thiet_bi (hoặc rỗng) -- hiển thị "B07601 - B07601" rất khó hiểu. Chỉ
 * ghép "mã - tên" khi tên thật sự khác mã.
 */
export function formatThietBiLabel(maThietBi: string, tenThietBi: string | null | undefined): string {
  const ten = (tenThietBi ?? "").trim();
  if (!ten || ten.toUpperCase() === maThietBi.trim().toUpperCase()) {
    return maThietBi;
  }
  return `${maThietBi} - ${ten}`;
}
