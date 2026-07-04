// Pha 7 (Task 1) — orchestrate toàn bộ việc đọc + chuẩn hoá + build model
// trong bộ nhớ, sẵn sàng cho Task 2-4 ghi vào Postgres. KHÔNG ghi DB ở đây.
import type { WorkBook } from "xlsx";
import { computeNgayThat } from "./dateUtils.ts";
import { LOAI_HOAT_DONG_ENUM, normalizeLoaiHoatDong, resolveDeviceCode } from "./normalize.ts";
import {
  readConfigRows,
  readDataRows,
  readImagesRows,
  readLogsRows,
  readThietBiFullList,
  readUsersRows,
} from "./readXlsx.ts";
import type {
  ChiTietKey,
  ChiTietRecord,
  CongViecKey,
  CongViecRecord,
  MigrationModel,
  NguoiDungRecord,
  OrphanThucHienRecord,
  RawDataRow,
  ThietBiRecord,
  ThucHienRecord,
  VaiTro,
} from "./types.ts";

function chiTietKeyOf(maThietBi: string, tenChiTiet: string, dieuKienCoBan: string): ChiTietKey {
  return `${maThietBi}||${tenChiTiet}||${dieuKienCoBan}`;
}

function congViecKeyOf(chiTietKey: ChiTietKey, loaiHoatDong: string): CongViecKey {
  return `${chiTietKey}||${loaiHoatDong}`;
}

function mapVaiTro(raw: string, warnings: string[], msnv: string): VaiTro {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "admin") return "admin";
  if (trimmed === "adminm") return "adminm";
  if (trimmed === "" || trimmed === "user") return "user";
  warnings.push(
    `Users: MSNV ${msnv} có giá trị Role lạ "${raw}" — không nhận diện được, mặc định coi là "user".`,
  );
  return "user";
}

interface CongViecRaw {
  stt: number | null;
  maThietBi: string;
  tenChiTiet: string;
  dieuKienCoBan: string;
  loaiHoatDong: string;
  thoiGian: number | null;
  tanSuatChu: string;
  tanSuatSo: number | null;
}

export function buildMigrationModel(wb: WorkBook): MigrationModel {
  const warnings: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Users thật (58 dòng) — map Tên -> MSNV (giả định Tên duy nhất, nhưng
  //    code phòng thủ nếu có 2 người trùng tên: coi là không tra được).
  // -------------------------------------------------------------------------
  const rawUsers = readUsersRows(wb);
  const nguoiDung: NguoiDungRecord[] = rawUsers.map((u) => ({
    msnv: u.msnv,
    username: u.username,
    hoTen: u.hoTen,
    donVi: u.donVi === "" ? null : u.donVi,
    vaiTro: mapVaiTro(u.role, warnings, u.msnv),
  }));

  const tenToMsnv = new Map<string, string | null>(); // null = ambiguous (>=2 người trùng tên)
  for (const u of rawUsers) {
    const hoTen = u.hoTen.trim();
    if (hoTen === "") continue;
    if (tenToMsnv.has(hoTen)) {
      warnings.push(
        `Users: tên "${hoTen}" trùng lặp giữa >=2 tài khoản — không thể dùng để tra MSNV, coi là không tra được.`,
      );
      tenToMsnv.set(hoTen, null);
    } else {
      tenToMsnv.set(hoTen, u.msnv);
    }
  }

  // Tra cứu MSNV theo tên KHÔNG log cảnh báo khi không tìm thấy — dùng cho
  // cột "người chỉnh sửa cuối" của Data (10585 dòng): plan chỉ yêu cầu cảnh
  // báo rõ ràng cho trường hợp nguoi_phu_trach (THIETBI) không tra được (vd
  // "Dương Văn Hào"), không yêu cầu cảnh báo riêng cho lookup này — nếu dùng
  // hàm có cảnh báo ở trên sẽ tạo hàng nghìn dòng warning gây nhiễu báo cáo.
  function lookupMsnvByTenSilent(ten: string): string | null {
    const trimmed = ten.trim();
    if (trimmed === "") return null;
    return tenToMsnv.get(trimmed) ?? null;
  }

  // -------------------------------------------------------------------------
  // 2. Config: dedupe theo (thietbi_sau_resolve, ten_chi_tiet, dieu_kien,
  //    loai_da_chuan_hoa), giữ STT nhỏ nhất nếu trùng. Xử lý mã ghép ngay ở
  //    đây bằng cách lặp qua từng thiết bị con đã resolve — điều này tự
  //    động "nhân bản" CHITIET/CONGVIEC cho từng thiết bị con vì mỗi thiết
  //    bị con nhận 1 khoá dedupe riêng dù nội dung là 1 dòng Config gốc.
  // -------------------------------------------------------------------------
  const rawConfig = readConfigRows(wb);

  interface DeviceOrgInfo {
    xuong: string;
    kip: string;
    cum: string;
    khuVuc: string;
    lanhDao: string;
    truongCa: string;
    ten: string; // người phụ trách (TÊN, chưa map sang MSNV)
  }
  const deviceOrgInfo = new Map<string, DeviceOrgInfo>();

  const congViecRaw = new Map<CongViecKey, CongViecRaw>();

  for (const row of rawConfig) {
    const loai = normalizeLoaiHoatDong(row.loaiHoatDong);
    if (!loai) {
      warnings.push(
        `Config: STT ${row.stt ?? "?"} thiết bị "${row.thietBi}" có Loại hoạt động không nhận diện được ("${row.loaiHoatDong}") — bỏ qua dòng này.`,
      );
      continue;
    }
    const resolvedDevices = resolveDeviceCode(row.thietBi);
    for (const dev of resolvedDevices) {
      // Ghi nhận thông tin tổ chức theo thiết bị (đã xác minh nhất quán 100%
      // trong cùng 1 thiết bị ở toàn bộ dữ liệu thật — không cần merge/so
      // sánh xung đột, chỉ cần lưu lần đầu gặp).
      if (!deviceOrgInfo.has(dev)) {
        deviceOrgInfo.set(dev, {
          xuong: row.xuong,
          kip: row.kip,
          cum: row.cumThietBi,
          khuVuc: row.khuVuc,
          lanhDao: row.lanhDaoXuong,
          truongCa: row.truongCa,
          ten: row.ten,
        });
      }

      const chiTietKey = chiTietKeyOf(dev, row.tenChiTiet, row.dieuKienCoBan);
      const key = congViecKeyOf(chiTietKey, loai);
      const existing = congViecRaw.get(key);
      const sttOrInf = row.stt ?? Number.POSITIVE_INFINITY;
      const existingSttOrInf = existing?.stt ?? Number.POSITIVE_INFINITY;
      if (!existing || sttOrInf < existingSttOrInf) {
        congViecRaw.set(key, {
          stt: row.stt,
          maThietBi: dev,
          tenChiTiet: row.tenChiTiet,
          dieuKienCoBan: row.dieuKienCoBan,
          loaiHoatDong: loai,
          thoiGian: row.thoiGian,
          tanSuatChu: row.tanSuatChu,
          tanSuatSo: row.tanSuatSo,
        });
      }
    }
  }

  // Build CHITIET (dedupe theo thietbi+tenChiTiet+dieuKien, giữ STT nhỏ nhất
  // trong số các CONGVIEC con của nó — stt chỉ phục vụ hiển thị).
  const chiTietMap = new Map<ChiTietKey, ChiTietRecord>();
  for (const cv of congViecRaw.values()) {
    const key = chiTietKeyOf(cv.maThietBi, cv.tenChiTiet, cv.dieuKienCoBan);
    const existing = chiTietMap.get(key);
    if (!existing || (cv.stt ?? Infinity) < (existing.stt ?? Infinity)) {
      chiTietMap.set(key, {
        key,
        maThietBi: cv.maThietBi,
        stt: cv.stt,
        tenChiTiet: cv.tenChiTiet,
        dieuKienCoBan: cv.dieuKienCoBan,
      });
    }
  }

  const congViec: CongViecRecord[] = Array.from(congViecRaw.entries()).map(([key, cv]) => ({
    key,
    chiTietKey: chiTietKeyOf(cv.maThietBi, cv.tenChiTiet, cv.dieuKienCoBan),
    loaiHoatDong: cv.loaiHoatDong,
    thoiGian: cv.thoiGian,
    tanSuatChu: cv.tanSuatChu === "" ? null : cv.tanSuatChu,
    tanSuatSo: cv.tanSuatSo,
  }));

  // -------------------------------------------------------------------------
  // 3. Hợp danh sách đầy đủ 169 thiết bị + danh sách thiết bị suy ra từ
  //    Config (đã resolve) -> danh sách THIETBI cuối cùng.
  // -------------------------------------------------------------------------
  const fullList = readThietBiFullList(wb);
  const allDeviceCodes = new Set<string>([...fullList, ...deviceOrgInfo.keys()]);

  // Gom nhóm cảnh báo "không tra được MSNV" theo TÊN (không theo từng thiết
  // bị) rồi in 1 dòng duy nhất mỗi tên, kèm danh sách thiết bị liên quan --
  // 1 người phụ trách (vd "Dương Văn Hào") thường đứng tên ở nhiều dòng
  // Config ứng với nhiều thiết bị, nếu cảnh báo theo từng thiết bị sẽ ra
  // nhiều dòng trùng ý nghĩa, không đúng tinh thần "1 dòng cảnh báo" của plan.
  const nguoiPhuTrachNotFound = new Map<string, string[]>();

  const thietBi: ThietBiRecord[] = Array.from(allDeviceCodes)
    .sort()
    .map((ma) => {
      const org = deviceOrgInfo.get(ma);
      if (!org) {
        // 1 trong 34 thiết bị chỉ có trong danh sách đầy đủ, chưa từng có
        // checksheet trong Config -> mọi trường tổ chức = null, không tự gán
        // nguoi_phu_trach (đúng yêu cầu người dùng, để admin gán sau).
        return {
          maThietBi: ma,
          tenThietBi: ma,
          cum: null,
          khuVuc: null,
          xuong: null,
          kip: null,
          lanhDao: null,
          truongCa: null,
          nguoiPhuTrach: null,
          anhUrl: null,
        };
      }
      const tenTrimmed = org.ten.trim();
      let nguoiPhuTrach: string | null = null;
      if (tenTrimmed === "") {
        nguoiPhuTrach = null;
      } else if (!tenToMsnv.has(tenTrimmed)) {
        nguoiPhuTrach = null;
        if (!nguoiPhuTrachNotFound.has(tenTrimmed)) nguoiPhuTrachNotFound.set(tenTrimmed, []);
        nguoiPhuTrachNotFound.get(tenTrimmed)!.push(ma);
      } else {
        nguoiPhuTrach = tenToMsnv.get(tenTrimmed) ?? null;
        if (nguoiPhuTrach === null) {
          warnings.push(
            `THIETBI ${ma}: tên "${tenTrimmed}" bị trùng lặp giữa nhiều user, không tra được MSNV.`,
          );
        }
      }
      return {
        maThietBi: ma,
        tenThietBi: ma,
        cum: org.cum === "" ? null : org.cum,
        khuVuc: org.khuVuc === "" ? null : org.khuVuc,
        xuong: org.xuong === "" ? null : org.xuong,
        kip: org.kip === "" ? null : org.kip,
        lanhDao: org.lanhDao === "" ? null : org.lanhDao,
        truongCa: org.truongCa === "" ? null : org.truongCa,
        nguoiPhuTrach,
        anhUrl: null, // gắn ở bước 4
      };
    });

  for (const [ten, devices] of nguoiPhuTrachNotFound) {
    warnings.push(
      `Không tìm thấy MSNV cho tên "${ten}" trong danh sách 58 user thật (đứng tên phụ trách ${devices.length} thiết bị: ${devices.join(", ")}) — nguoi_phu_trach để null, cần admin gán thủ công sau.`,
    );
  }

  const thietBiByMa = new Map(thietBi.map((t) => [t.maThietBi, t]));

  // -------------------------------------------------------------------------
  // 4. Images -> gắn anh_url (copy nguyên URL gốc, không resolve Drive).
  //    Áp dụng resolveDeviceCode phòng trường hợp Images cũng ghi mã ghép.
  // -------------------------------------------------------------------------
  const rawImages = readImagesRows(wb);
  for (const img of rawImages) {
    const resolvedDevices = resolveDeviceCode(img.thietBi);
    for (const dev of resolvedDevices) {
      const target = thietBiByMa.get(dev);
      if (!target) {
        warnings.push(
          `Images: thiết bị "${dev}" (từ mã gốc "${img.thietBi}") không có trong danh sách THIETBI cuối cùng — bỏ qua ảnh này.`,
        );
        continue;
      }
      target.anhUrl = img.url;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Data -> THUC_HIEN (chỉ ô khác "N|N") + orphanThucHien (không match
  //    được CONGVIEC nào).
  // -------------------------------------------------------------------------
  const rawData = readDataRows(wb);
  const thucHien: ThucHienRecord[] = [];
  const orphanThucHien: OrphanThucHienRecord[] = [];

  function parseOCell(
    cell: string,
    row: RawDataRow,
    dayIndex: number,
  ): { keHoach: boolean; ketQua: "G" | "R" | "N" } {
    const [planRaw, actRaw] = cell.split("|");
    const keHoach = planRaw === "Y";
    let ketQua: "G" | "R" | "N";
    if (actRaw === "G" || actRaw === "R" || actRaw === "N") {
      ketQua = actRaw;
    } else {
      warnings.push(
        `Data: ${row.thangNam} thiết bị "${row.thietBi}" ngày ${dayIndex} có giá trị Actual không nhận diện được ("${actRaw}") trong ô "${cell}" — coi như "N".`,
      );
      ketQua = "N";
    }
    return { keHoach, ketQua };
  }

  for (const row of rawData) {
    const loai = normalizeLoaiHoatDong(row.loaiHoatDong);
    const resolvedDevices = resolveDeviceCode(row.thietBi);
    const nguoiThucHien = lookupMsnvByTenSilent(row.tenNguoiChinhSuaCuoi);

    for (let dayIndex = 1; dayIndex <= 31; dayIndex++) {
      const cell = row.ngay31[dayIndex - 1];
      if (cell === "N|N" || cell === "") continue; // lưu thưa: bỏ qua ô rỗng/không có dữ liệu

      const ngay = computeNgayThat(row.thangNam, dayIndex);
      const { keHoach, ketQua } = parseOCell(cell, row, dayIndex);

      if (!loai) {
        for (const dev of resolvedDevices) {
          orphanThucHien.push({
            thietBi: dev,
            tenChiTiet: row.tenChiTiet,
            dieuKienCoBan: row.dieuKienCoBan,
            loaiHoatDong: row.loaiHoatDong,
            thangNam: row.thangNam,
            ngay,
            giaTriO: cell,
            legacyRowId: row.legacyRowId,
            lyDo: "Loại hoạt động không nhận diện được",
          });
        }
        continue;
      }

      if (ngay === null) {
        for (const dev of resolvedDevices) {
          orphanThucHien.push({
            thietBi: dev,
            tenChiTiet: row.tenChiTiet,
            dieuKienCoBan: row.dieuKienCoBan,
            loaiHoatDong: loai,
            thangNam: row.thangNam,
            ngay: null,
            giaTriO: cell,
            legacyRowId: row.legacyRowId,
            lyDo: `Ngày không hợp lệ (${row.thangNam}, ngày ${dayIndex})`,
          });
        }
        continue;
      }

      for (const dev of resolvedDevices) {
        const chiTietKey = chiTietKeyOf(dev, row.tenChiTiet, row.dieuKienCoBan);
        const congViecKey = congViecKeyOf(chiTietKey, loai);
        if (!congViecRaw.has(congViecKey)) {
          orphanThucHien.push({
            thietBi: dev,
            tenChiTiet: row.tenChiTiet,
            dieuKienCoBan: row.dieuKienCoBan,
            loaiHoatDong: loai,
            thangNam: row.thangNam,
            ngay,
            giaTriO: cell,
            legacyRowId: row.legacyRowId,
            lyDo: "Không tìm thấy CONGVIEC khớp",
          });
          continue;
        }
        thucHien.push({
          congViecKey,
          ngay,
          keHoach,
          ketQua,
          nguoiThucHien,
          legacyRowId: row.legacyRowId,
          legacyMonthYear: row.thangNam,
          needsBatThuong: ketQua === "R",
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Logs — copy nguyên trạng, không transform nghiệp vụ.
  // -------------------------------------------------------------------------
  const logs = readLogsRows(wb);

  return {
    nguoiDung,
    thietBi,
    chiTiet: Array.from(chiTietMap.values()),
    congViec,
    thucHien,
    orphanThucHien,
    logs,
    warnings,
  };
}

// Xuất lại để report.ts / các script khác tham chiếu enum hợp lệ nếu cần.
export { LOAI_HOAT_DONG_ENUM };
