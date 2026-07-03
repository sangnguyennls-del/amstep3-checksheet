// Hàm THUẦN (pure, không async, không đọc đồng hồ hệ thống nội bộ) tính cửa
// sổ +-4 ngày cho phép sửa Actual -- CHỈ dùng để tô UI gợi ý (style nhạt/đậm
// hoặc hint), KHÔNG phải quyết định thật. Quyết định thật luôn là kết quả
// `status` trả về từ `upsert_thuc_hien` (xem Global Constraints trong
// docs/plans/pha4-checksheet-grid.md, mục "Quy tắc nghiệp vụ phải bảo toàn"
// #2) -- vì vậy hàm này KHÔNG được dùng để chặn cứng click ở Cell.tsx.
export function isWithinActWindow(targetDateIso: string, todayIso: string): boolean {
  const target = new Date(`${targetDateIso}T00:00:00Z`);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return Math.abs(diffDays) <= 4;
}
