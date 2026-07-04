// Pha 7 (Task 1) — tiện ích tính ngày thật từ "Tháng/Năm" (vd "03/2026") +
// chỉ số ngày (1..31) của sheet Data. Validate ngày hợp lệ (vd không cho
// phép 30/2) bằng cách roundtrip qua Date và so lại 3 thành phần.
export function parseThangNam(thangNam: string): { month: number; year: number } | null {
  const parts = thangNam.split("/");
  if (parts.length !== 2) return null;
  const month = Number(parts[0]);
  const year = Number(parts[1]);
  if (!Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12) return null;
  return { month, year };
}

/** Trả về "YYYY-MM-DD" nếu ngày hợp lệ, null nếu không (vd 30/2, 31/4). */
export function computeNgayThat(thangNam: string, dayIndex1to31: number): string | null {
  const parsed = parseThangNam(thangNam);
  if (!parsed) return null;
  const { month, year } = parsed;
  const date = new Date(year, month - 1, dayIndex1to31);
  // Date tự "tràn" sang tháng sau nếu ngày không tồn tại (vd 30/2 -> 2/3) --
  // so lại đúng 3 thành phần để phát hiện trường hợp này.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== dayIndex1to31) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(dayIndex1to31).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
