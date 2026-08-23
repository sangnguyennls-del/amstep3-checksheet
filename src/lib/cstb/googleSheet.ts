// Đọc tab CSTB trong Google Sheet của sếp qua Google Sheets API, xác thực bằng
// service account. Ký JWT RS256 tự làm bằng node:crypto -> KHÔNG thêm
// dependency (ponytail). Chỉ đọc (scope spreadsheets.readonly).
//
// Biến môi trường (server-only, đặt ở .env.local / Vercel env):
//   GOOGLE_SA_EMAIL        - email service account (client_email)
//   GOOGLE_SA_PRIVATE_KEY  - private key PEM (xuống dòng có thể lưu dạng \n)
//   CSTB_SHEET_ID          - id spreadsheet (đoạn giữa /d/.../edit)
//   CSTB_SHEET_RANGE       - vd "CSTB!A1:F1000"
import { createSign } from "node:crypto";
import type { SheetRow } from "./diff.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Thiếu biến môi trường ${name} (cấu hình đồng bộ Google Sheet)`);
  }
  return v;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(): Promise<string> {
  const email = requireEnv("GOOGLE_SA_EMAIL");
  // Key trong env thường lưu literal "\n" -> khôi phục xuống dòng thật.
  const privateKey = requireEnv("GOOGLE_SA_PRIVATE_KEY").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signingInput = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Lấy access token Google thất bại (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google không trả access_token");
  return json.access_token;
}

// Chuẩn hoá header để so khớp bất chấp hoa/thường + khoảng trắng (giữ dấu).
function normHeader(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function findCol(header: string[], accepted: string[]): number {
  const norm = header.map(normHeader);
  for (const target of accepted) {
    const i = norm.indexOf(target);
    if (i !== -1) return i;
  }
  // fallback: header chứa chuỗi mục tiêu
  for (const target of accepted) {
    const i = norm.findIndex((h) => h.includes(target));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Đọc các dòng thiết bị (mã + tên người chăm sóc) từ tab CSTB.
 * Tự tìm cột theo TÊN HEADER "Thiết bị" / "Nhân viên chăm sóc" nên không phụ
 * thuộc vị trí cột (sheet có 2 bảng cạnh nhau). Bỏ dòng không có mã thiết bị.
 */
export async function readCstbDeviceRows(): Promise<SheetRow[]> {
  const sheetId = requireEnv("CSTB_SHEET_ID");
  const range = requireEnv("CSTB_SHEET_RANGE");
  const token = await getAccessToken();

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Đọc Google Sheet thất bại (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  const rows = json.values ?? [];
  if (rows.length < 2) return [];

  const header = rows[0];
  const idxMa = findCol(header, ["thiết bị"]);
  const idxTen = findCol(header, ["nhân viên chăm sóc", "người chăm sóc"]);
  if (idxMa === -1 || idxTen === -1) {
    throw new Error(
      `Không tìm thấy cột "Thiết bị" và/hoặc "Nhân viên chăm sóc" trong header sheet (nhận được: ${header.join(" | ")})`,
    );
  }

  const out: SheetRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const maThietBi = (r[idxMa] ?? "").trim();
    const nhanVienChamSoc = (r[idxTen] ?? "").trim();
    if (maThietBi === "") continue;
    out.push({ maThietBi, nhanVienChamSoc });
  }
  return out;
}
