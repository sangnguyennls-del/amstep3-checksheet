// Nhắc việc chưa thực hiện + tổng hợp thời gian/lần cập nhật cuối cho 1 thiết
// bị + tháng đang xem. TẤT CẢ là hàm THUẦN tính trên dữ liệu client đã tải
// (rows + thucHien) -- KHÔNG gọi RPC/DB.
//
// Vì sao không dùng chuông `get_notifications` sẵn có: RPC đó chỉ trả
// loai/thiet_bi/noi_dung ở mức tóm tắt (xem notifications.ts), thiếu STT/ngày
// plan/thời gian nên không dựng được bảng nhắc việc. Trong khi ChecksheetApp
// sau khi load đã có đủ mọi thứ cần thiết.

import { isWithinActWindow } from "./actWindow";
import { cellKey, type CongViecRow, type ThucHienMap } from "./types";

export type ViecChuaLam = {
  congViecId: string;
  stt: number | null;
  tenChiTiet: string;
  /** Hiển thị dưới cột "Tiêu chuẩn" đúng như lưới checksheet (xem CLAUDE.md:
   * header "TIÊU CHUẨN" thực chất hiện `loai_hoat_dong`). */
  loaiHoatDong: string;
  /** Ngày đã lên kế hoạch (ISO) mà tới giờ vẫn chưa tô xanh. */
  ngay: string;
  thoiGian: number | null;
};

/**
 * Các việc ĐÃ tới hạn nhưng CHƯA thực hiện, và vẫn còn sửa được.
 *
 * Điều kiện 1 ô (congViec, ngay) được tính là "chưa làm":
 *   1. có cờ kế hoạch (`keHoach`),
 *   2. kết quả vẫn là "N" (chưa tô xanh, cũng chưa ghi bất thường),
 *   3. `ngay <= todayIso` -- chỉ nhắc việc ĐÃ tới hạn, không nhắc kế hoạch
 *      tương lai (chưa đến ngày thì chưa thể coi là trễ),
 *   4. còn trong cửa sổ +-4 ngày (`isWithinActWindow`) -- quá 4 ngày thì thôi
 *      nhắc, vì lúc đó server cũng không cho sửa Actual nữa (nhắc chỉ gây
 *      nhiễu khi người dùng không làm gì được).
 * Kết hợp (3) + (4) => đúng khoảng 0..4 ngày trễ.
 *
 * Sắp xếp theo `stt` rồi `ngay` cho khớp thứ tự trên phiếu.
 */
export function getViecChuaLam(
  rows: CongViecRow[],
  thucHien: ThucHienMap,
  todayIso: string,
  days: string[],
): ViecChuaLam[] {
  const ketQua: ViecChuaLam[] = [];

  for (const row of rows) {
    for (const ngay of days) {
      if (ngay > todayIso) continue;
      if (!isWithinActWindow(ngay, todayIso)) continue;

      const cell = thucHien[cellKey(row.congViecId, ngay)];
      if (!cell?.keHoach) continue;
      if ((cell.ketQua ?? "N") !== "N") continue;

      ketQua.push({
        congViecId: row.congViecId,
        stt: row.stt,
        tenChiTiet: row.tenChiTiet,
        loaiHoatDong: row.loaiHoatDong,
        ngay,
        thoiGian: row.thoiGian,
      });
    }
  }

  return ketQua.sort((a, b) => {
    const sttA = a.stt ?? Number.MAX_SAFE_INTEGER;
    const sttB = b.stt ?? Number.MAX_SAFE_INTEGER;
    if (sttA !== sttB) return sttA - sttB;
    return a.ngay.localeCompare(b.ngay);
  });
}

/** Tổng thời gian dự kiến (phút) của danh sách việc chưa làm. */
export function tongThoiGian(viec: ViecChuaLam[]): number {
  return viec.reduce((sum, v) => sum + (v.thoiGian ?? 0), 0);
}

export type LanCapNhatCuoi = {
  /** ISO timestamp của ô được sửa gần nhất. */
  at: string;
  /** Họ tên người sửa; null nếu ô đó chưa có `nguoi_thuc_hien` hoặc chưa
   * join được tên (vd ô vừa sửa optimistic, chưa bấm Lưu). */
  ten: string | null;
};

/**
 * Ô có `updatedAt` LỚN NHẤT trong tháng đang xem -> dùng cho dòng "Lần chỉnh
 * sửa cuối ... bởi ...". Chỉ phản ánh dữ liệu ĐÃ LƯU: ô sửa optimistic chưa
 * bấm Lưu thì chưa có tên từ server, không đoán tên ở client.
 */
export function getLanCapNhatCuoi(thucHien: ThucHienMap): LanCapNhatCuoi | null {
  let moiNhat: LanCapNhatCuoi | null = null;

  for (const cell of Object.values(thucHien)) {
    if (!cell.updatedAt) continue;
    if (moiNhat === null || cell.updatedAt > moiNhat.at) {
      moiNhat = { at: cell.updatedAt, ten: cell.nguoiThucHienTen ?? null };
    }
  }

  return moiNhat;
}
