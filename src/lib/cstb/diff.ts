// Đồng bộ phân công CSTB: logic ánh xạ + tính diff THUẦN (không I/O, testable).
// Nguồn chân lý = Google Sheet của sếp (mã thiết bị -> tên người chăm sóc).
// App cập nhật thietbi.nguoi_phu_trach theo tên đó (map ho_ten -> msnv) và
// thietbi.nhom suy từ nhóm của người chăm sóc (quyết định #3). kip được suy ở
// bước áp dụng (kipFromNhom), không tham gia diff vì luôn = "Kíp <nhom>".

export type SheetRow = { maThietBi: string; nhanVienChamSoc: string };

export type ThietBiSnapshot = {
  id: string;
  maThietBi: string;
  nguoiPhuTrach: string | null; // msnv hiện tại
  nhom: string | null;
};

export type NguoiDung = { msnv: string; hoTen: string; nhom: string | null };

export type CstbChange = {
  thietBiId: string;
  maThietBi: string;
  oldMsnv: string | null;
  oldHoTen: string | null;
  oldNhom: string | null;
  newMsnv: string;
  newHoTen: string;
  newNhom: string | null;
};

export type CstbDiff = {
  changes: CstbChange[];
  noChange: { maThietBi: string; hoTen: string }[];
  unmatchedDevice: SheetRow[]; // mã thiết bị không có trong thietbi
  unmatchedCaretaker: SheetRow[]; // tên người chăm sóc không có trong nguoidung
  duplicateDevice: string[]; // mã thiết bị xuất hiện >1 lần trong sheet (chỉ xử lý lần đầu)
};

const normMa = (s: string): string => s.trim().replace(/\s+/g, " ").toUpperCase();
const normName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
const eq = (a: string | null, b: string | null): boolean => (a ?? "") === (b ?? "");

export function computeCstbDiff(
  sheetRows: SheetRow[],
  thietBiList: ThietBiSnapshot[],
  nguoiDungList: NguoiDung[],
): CstbDiff {
  const tbByMa = new Map<string, ThietBiSnapshot>();
  for (const t of thietBiList) tbByMa.set(normMa(t.maThietBi), t);

  const ndByName = new Map<string, NguoiDung>();
  const ndByMsnv = new Map<string, NguoiDung>();
  for (const u of nguoiDungList) {
    ndByName.set(normName(u.hoTen), u);
    ndByMsnv.set(u.msnv, u);
  }

  const diff: CstbDiff = {
    changes: [],
    noChange: [],
    unmatchedDevice: [],
    unmatchedCaretaker: [],
    duplicateDevice: [],
  };
  const seenMa = new Set<string>();

  for (const row of sheetRows) {
    const ma = row.maThietBi.trim();
    const ten = row.nhanVienChamSoc.trim();
    if (ma === "" && ten === "") continue; // dòng trống
    if (ma === "") continue; // không có mã -> bỏ qua (không phải dòng thiết bị)

    const key = normMa(ma);
    if (seenMa.has(key)) {
      diff.duplicateDevice.push(ma);
      continue; // chỉ xử lý lần xuất hiện đầu
    }
    seenMa.add(key);

    const tb = tbByMa.get(key);
    if (!tb) {
      diff.unmatchedDevice.push(row);
      continue;
    }

    const nd = ten === "" ? undefined : ndByName.get(normName(ten));
    if (!nd) {
      diff.unmatchedCaretaker.push(row);
      continue;
    }

    if (eq(tb.nguoiPhuTrach, nd.msnv) && eq(tb.nhom, nd.nhom)) {
      diff.noChange.push({ maThietBi: tb.maThietBi, hoTen: nd.hoTen });
      continue;
    }

    const oldNd = tb.nguoiPhuTrach ? ndByMsnv.get(tb.nguoiPhuTrach) : undefined;
    diff.changes.push({
      thietBiId: tb.id,
      maThietBi: tb.maThietBi,
      oldMsnv: tb.nguoiPhuTrach,
      oldHoTen: oldNd?.hoTen ?? null,
      oldNhom: tb.nhom,
      newMsnv: nd.msnv,
      newHoTen: nd.hoTen,
      newNhom: nd.nhom,
    });
  }

  return diff;
}
