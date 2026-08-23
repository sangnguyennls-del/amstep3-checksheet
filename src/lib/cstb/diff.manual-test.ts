// Self-check cho computeCstbDiff (theo mẫu *.manual-test.ts trong repo).
// Chạy: node src/lib/cstb/diff.manual-test.ts  (Node 24 tự strip types)
import assert from "node:assert";
import { computeCstbDiff, type NguoiDung, type ThietBiSnapshot } from "./diff.ts";

const nd: NguoiDung[] = [
  { msnv: "000301", hoTen: "Nguyễn Việt Trung", nhom: "1" },
  { msnv: "000407", hoTen: "Tạ Ngọc Định", nhom: "3" },
];
const tb: ThietBiSnapshot[] = [
  { id: "tb-1", maThietBi: "E06105A", nguoiPhuTrach: "000407", nhom: "3" }, // đang là Định (nhóm 3)
  { id: "tb-2", maThietBi: "E06121", nguoiPhuTrach: "000301", nhom: "1" }, // đang là Trung (nhóm 1)
];

// Ca 1: đổi người (E06105A: Định -> Trung) => 1 change, nhom cũng đổi 3->1.
// Ca 2: không đổi (E06121 vẫn Trung).
// Ca 3: mã thiết bị lạ -> unmatchedDevice.
// Ca 4: tên người lạ -> unmatchedCaretaker.
// Ca 5: trùng mã trong sheet -> duplicateDevice (chỉ xử lý lần đầu).
const sheet = [
  { maThietBi: "E06105A", nhanVienChamSoc: "Nguyễn Việt Trung" },
  { maThietBi: "E06121", nhanVienChamSoc: "Nguyễn Việt Trung" },
  { maThietBi: "Lube oil Unit MNCO2", nhanVienChamSoc: "Tạ Ngọc Định" },
  { maThietBi: "E06121", nhanVienChamSoc: "Người Không Tồn Tại" }, // trùng E06121 -> duplicate
  { maThietBi: "  e06105a ", nhanVienChamSoc: "Ai Đó Lạ" }, // trùng (chuẩn hoá) -> duplicate
];
// Thêm 1 thiết bị có tên chăm sóc lạ (mã khớp) để test unmatchedCaretaker riêng.
tb.push({ id: "tb-3", maThietBi: "P06101A", nguoiPhuTrach: null, nhom: null });
sheet.push({ maThietBi: "P06101A", nhanVienChamSoc: "Không Có Tên Này" });

const d = computeCstbDiff(sheet, tb, nd);

assert.equal(d.changes.length, 1, "phải có đúng 1 thay đổi");
assert.equal(d.changes[0].maThietBi, "E06105A");
assert.equal(d.changes[0].oldMsnv, "000407");
assert.equal(d.changes[0].newMsnv, "000301");
assert.equal(d.changes[0].oldNhom, "3");
assert.equal(d.changes[0].newNhom, "1");

assert.equal(d.noChange.length, 1, "E06121 không đổi");
assert.equal(d.noChange[0].maThietBi, "E06121");

assert.equal(d.unmatchedDevice.length, 1, "Lube oil Unit MNCO2 không khớp mã");
assert.equal(d.unmatchedDevice[0].maThietBi, "Lube oil Unit MNCO2");

assert.equal(d.unmatchedCaretaker.length, 1, "P06101A: tên chăm sóc lạ");
assert.equal(d.unmatchedCaretaker[0].maThietBi, "P06101A");

assert.equal(d.duplicateDevice.length, 2, "2 dòng trùng mã E06105A/E06121");

console.log("OK — computeCstbDiff pass tất cả assert.");
