// Tách riêng khỏi ChecksheetApp.tsx (Task 4) vì BatThuongModal.tsx cũng cần
// "hôm nay theo giờ VN" làm mặc định cho `ngay_phat_hien` -- import thẳng từ
// ChecksheetApp.tsx sẽ tạo import vòng (ChecksheetApp render BatThuongModal).

/**
 * Ngày hiện tại theo giờ Việt Nam (Asia/Ho_Chi_Minh), dạng "YYYY-MM-DD" --
 * dùng làm gợi ý UI (cửa sổ +-4 ngày ở actWindow.ts, mặc định ngày phát hiện ở
 * BatThuongModal.tsx). KHÔNG dùng `new Date().toISOString().slice(0, 10)` vì
 * đó là ngày lịch UTC, có thể lệch 1 ngày so với "hôm nay" thật ở VN (UTC+7)
 * vào khoảng 17:00-24:00 giờ VN.
 */
export function vnTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
