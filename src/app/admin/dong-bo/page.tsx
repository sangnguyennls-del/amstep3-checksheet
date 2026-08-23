import { requireAdmin } from "@/lib/auth/require-admin";
import { DongBoCstb } from "./DongBoCstb";
import { ui } from "@/lib/ui";

// Đồng bộ phân công CSTB từ Google Sheet của sếp (nguồn chân lý). Chỉ AdminM.
export default async function DongBoPage() {
  const ctx = await requireAdmin(); // layout đã chặn non-admin; ở đây siết AdminM.
  if (ctx.vaiTro !== "adminm") {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold tracking-tight text-gray-900">
          Đồng bộ phân công (CSTB)
        </h1>
        <p className={`p-4 ${ui.card} ${ui.errorText}`}>
          Chỉ AdminM mới được đồng bộ phân công từ Google Sheet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold tracking-tight text-gray-900">
        Đồng bộ phân công (CSTB) từ Google Sheet
      </h1>
      <p className="mb-4 max-w-3xl text-sm text-gray-600">
        Đọc file phân công của sếp (tab CSTB) và cập nhật <strong>người chăm sóc</strong> + nhóm của
        thiết bị theo đúng file. Luôn <strong>xem trước</strong> rồi mới áp dụng; dòng nào mã/tên không
        khớp sẽ được liệt kê và bỏ qua (không đoán).
      </p>
      <DongBoCstb />
    </div>
  );
}
