// Pha 7 (Task 1) — chuẩn hoá giá trị "Loại hoạt động" và tra bảng mã thiết bị
// ghép đã xác minh thủ công. Xem docs/plans/pha7-data-migration.md mục
// "Bối cảnh" cho toàn bộ số liệu/luận cứ đứng sau các hằng số dưới đây.

/** 4 giá trị hợp lệ sau khi chuẩn hoá — mọi giá trị Loại hoạt động phải quy về 1 trong 4. */
export const LOAI_HOAT_DONG_ENUM = ["Kiểm tra", "Vệ sinh", "Bôi trơn", "Siết chặt"] as const;
export type LoaiHoatDong = (typeof LOAI_HOAT_DONG_ENUM)[number];

/**
 * Chuẩn hoá giá trị Loại hoạt động thô đọc từ Config/Data.
 * Xử lý 2 lỗi đã biết trong dữ liệu thật:
 *  - "Kiêm tra" (lỗi chính tả, thiếu dấu) -> "Kiểm tra" (45 dòng trong Data)
 *  - "vệ sinh" (viết thường) -> "Vệ sinh" (24+8 dòng trong Data)
 * So khớp case-insensitive với 4 giá trị enum sau khi thử sửa lỗi đã biết.
 * Trả về null nếu rỗng hoặc là giá trị lạ không nhận diện được (không throw —
 * để gọi nơi khác tự quyết định log cảnh báo / coi là orphan).
 */
export function normalizeLoaiHoatDong(raw: string | null | undefined): LoaiHoatDong | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;

  // Sửa lỗi chính tả đã biết trước khi so khớp enum.
  const knownTypoFixed = trimmed === "Kiêm tra" ? "Kiểm tra" : trimmed;

  const lower = knownTypoFixed.toLowerCase();
  const match = LOAI_HOAT_DONG_ENUM.find((candidate) => candidate.toLowerCase() === lower);
  return match ?? null;
}

/** Cách xử lý 1 mã thiết bị (thô, có thể là mã ghép) đọc từ Config. */
export type DeviceResolution =
  | { kind: "split"; parts: string[] }
  | { kind: "keep" }; // giữ nguyên mã gốc làm 1 thiết bị (mã ghép không tách được, hoặc mã đơn không có trong danh sách đầy đủ)

/**
 * Bảng 13 mã thiết bị ghép/không khớp trong Config đã được xác minh thủ công
 * từng trường hợp (tra cứu thật vào sheet "Thiết bị ") — KHÔNG dùng regex tự
 * tách vì rủi ro tách sai các trường hợp tương lai không có trong bảng này.
 * Xem bảng đầy đủ + lý do từng dòng trong plan, mục "Bảng xử lý 13 mã thiết
 * bị ghép/không khớp trong Config".
 */
export const COMPOUND_DEVICE_RESOLUTIONS: Record<string, DeviceResolution> = {
  "E06119-E06120-E06121": { kind: "split", parts: ["E06119", "E06120", "E06121"] },
  "KT06101 - K06101": { kind: "split", parts: ["KT06101", "K06101"] },
  "T06104-P06116AB": { kind: "split", parts: ["T06104", "P06116A", "P06116B"] },
  "T07605-P07606": { kind: "split", parts: ["T07605", "P07606"] },
  "H07601,Z07602,V07604": { kind: "keep" },
  "T06105": { kind: "keep" },
  "T07604-E07604": { kind: "split", parts: ["T07604", "E07604"] },
  "Z06112, Z06113": { kind: "split", parts: ["Z06112", "Z06113"] },
  "E06116A/B": { kind: "split", parts: ["E06116A", "E06116B"] },
  "S06114/E06114/T06114": { kind: "keep" },
  "E06124/E06125/E06126": { kind: "split", parts: ["E06124", "E06125/26"] },
  "T06106": { kind: "keep" },
  "E06118AB": { kind: "split", parts: ["E06118A", "E06118B"] },
};

/**
 * Tra bảng COMPOUND_DEVICE_RESOLUTIONS theo mã thiết bị thô (đã trim).
 * Trả về danh sách 1 hoặc nhiều mã thiết bị con thật sự sẽ dùng làm THIETBI.
 * Không có trong bảng -> thiết bị bình thường, không ghép, trả về [rawCode].
 */
export function resolveDeviceCode(rawCode: string): string[] {
  const trimmed = rawCode.trim();
  const resolution = COMPOUND_DEVICE_RESOLUTIONS[trimmed];
  if (!resolution) return [trimmed];
  if (resolution.kind === "keep") return [trimmed];
  return resolution.parts;
}
