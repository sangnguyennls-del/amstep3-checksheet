import assert from "node:assert";
import { chiTietOptions } from "../../src/lib/checksheet/chiTietOptions.ts";

const rows = [
  { chiTietId: "CT00001", tenChiTiet: "Ổ trục" },
  { chiTietId: "CT00001", tenChiTiet: "Ổ trục" }, // trùng -> gộp
  { chiTietId: "CT00002", tenChiTiet: "Dây curoa" },
] as Parameters<typeof chiTietOptions>[0];

const out = chiTietOptions(rows);
assert.deepStrictEqual(out, [
  { id: "CT00001", ten: "Ổ trục" },
  { id: "CT00002", ten: "Dây curoa" },
]);
console.log("chiTietOptions.smoke.ts: PASS");
