import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { DongBoCstb } from "./DongBoCstb";
import { DoiNhanSu } from "./DoiNhanSu";
import { ui } from "@/lib/ui";

// Cập nhật phân công: (1) đồng bộ CSTB từ Google Sheet của sếp; (2) đổi Trưởng
// ca / Lãnh đạo hàng loạt. Chỉ AdminM.
export default async function DongBoPage() {
  const ctx = await requireAdmin(); // layout đã chặn non-admin; ở đây siết AdminM.
  if (ctx.vaiTro !== "adminm") {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold tracking-tight text-gray-900">
          Cập nhật phân công
        </h1>
        <p className={`p-4 ${ui.card} ${ui.errorText}`}>
          Chỉ AdminM mới dùng được trang này.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [tbRes, ndRes] = await Promise.all([
    supabase.from("thietbi").select("truong_ca, lanh_dao"),
    supabase.from("nguoidung").select("ho_ten").order("ho_ten"),
  ]);
  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
  const truongCaValues = uniq((tbRes.data ?? []).map((t) => t.truong_ca as string | null));
  const lanhDaoValues = uniq((tbRes.data ?? []).map((t) => t.lanh_dao as string | null));
  const nguoiDungNames = uniq((ndRes.data ?? []).map((u) => u.ho_ten as string | null));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-1 text-lg font-semibold tracking-tight text-gray-900">
          Đồng bộ phân công (CSTB) từ Google Sheet
        </h1>
        <p className="mb-4 max-w-3xl text-sm text-gray-600">
          Đọc file phân công của sếp (tab CSTB) và cập nhật <strong>người chăm sóc</strong> + nhóm của
          thiết bị theo đúng file. Luôn <strong>xem trước</strong> rồi mới áp dụng; dòng nào mã/tên không
          khớp sẽ được liệt kê và bỏ qua (không đoán).
        </p>
        <DongBoCstb />
      </section>

      <section className="border-t border-[#dee2e6] pt-6">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-gray-900">
          Đổi Trưởng ca / Lãnh đạo hàng loạt
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-gray-600">
          Thay một người bằng người khác cho <strong>mọi thiết bị</strong> đang để tên đó (vd trưởng ca
          chuyển công tác). Không phải sửa từng thiết bị. Có xem trước + ghi nhật ký.
        </p>
        <DoiNhanSu
          truongCaValues={truongCaValues}
          lanhDaoValues={lanhDaoValues}
          nguoiDungNames={nguoiDungNames}
        />
      </section>
    </div>
  );
}
