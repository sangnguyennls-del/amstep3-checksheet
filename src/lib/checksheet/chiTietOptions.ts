// Danh sách chi tiết DISTINCT của thiết bị đang xem, dựng từ các dòng công
// việc đã load (CongViecRow) — dùng cho dropdown "Thêm công việc vào chi tiết
// có sẵn" (ThemHangMucModal) mà không cần truy vấn thêm. Giữ thứ tự xuất hiện.
export function chiTietOptions(
  rows: { chiTietId: string; tenChiTiet: string }[],
): { id: string; ten: string }[] {
  const seen = new Set<string>();
  const out: { id: string; ten: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.chiTietId)) continue;
    seen.add(r.chiTietId);
    out.push({ id: r.chiTietId, ten: r.tenChiTiet });
  }
  return out;
}
