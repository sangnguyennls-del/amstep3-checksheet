"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { createThietBi, deleteThietBi, type EquipmentActionState } from "@/app/actions/equipment";
import { ui } from "@/lib/ui";
import { defaultIfAvailable, formatThietBiLabel } from "@/lib/filters";
import { SearchableSelect } from "@/components/SearchableSelect";

export type ThietBiRow = {
  id: string;
  ma_thiet_bi: string;
  ten_thiet_bi: string;
  xuong: string | null;
  kip: string | null;
  nhom: string | null;
  khu_vuc: string | null;
  nguoi_phu_trach: string | null;
};

export type CurrentUserProfile = {
  msnv: string | null;
  xuong: string | null;
  kip: string | null;
  nhom: string | null;
};

export type NguoiDungOption = { msnv: string; ho_ten: string };

const initialState: EquipmentActionState = { error: null };

function CreateThietBiForm({ users }: { users: NguoiDungOption[] }) {
  const [state, formAction, isPending] = useActionState(createThietBi, initialState);
  const [open, setOpen] = useState(false);
  // SearchableSelect là component controlled không có name -- giữ giá trị ở
  // state + <input type="hidden"> để form action (FormData) vẫn nhận được.
  const [nguoiPhuTrach, setNguoiPhuTrach] = useState("");

  return (
    <div className="mb-6">
      <button type="button" onClick={() => setOpen((v) => !v)} className={ui.buttonPrimary}>
        {open ? "Đóng" : "+ Thêm thiết bị"}
      </button>

      {open ? (
        <form action={formAction} className={`mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 ${ui.card}`}>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Mã thiết bị</label>
            <input name="maThietBi" required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Tên thiết bị</label>
            <input name="tenThietBi" required className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Cụm</label>
            <input name="cum" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Khu vực</label>
            <input name="khuVuc" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Xưởng</label>
            <input name="xuong" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Kíp</label>
            <input name="kip" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Nhóm nhỏ</label>
            <input name="nhom" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Lãnh đạo</label>
            <input name="lanhDao" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Trưởng ca</label>
            <input name="truongCa" className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={ui.label}>Người phụ trách</label>
            <input type="hidden" name="nguoiPhuTrach" value={nguoiPhuTrach} />
            <SearchableSelect
              value={nguoiPhuTrach}
              onChange={setNguoiPhuTrach}
              placeholder="-- Chưa gán --"
              options={users.map((u) => ({ value: u.msnv, label: `${u.ho_ten} (${u.msnv})` }))}
            />
          </div>

          {state.error ? (
            <p role="alert" className={`col-span-full ${ui.errorText}`}>
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className={`col-span-full ${ui.successText}`}>Tạo thiết bị thành công.</p>
          ) : null}

          <div className="col-span-full">
            <button type="submit" disabled={isPending} className={ui.buttonPrimary}>
              {isPending ? "Đang tạo..." : "Tạo thiết bị"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

export function EquipmentList({
  items,
  users,
  currentUser,
}: {
  items: ThietBiRow[];
  users: NguoiDungOption[];
  currentUser: CurrentUserProfile;
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameByMsnv = new Map(users.map((u) => [u.msnv, u.ho_ten]));

  // Việc 1: mặc định lọc theo hồ sơ người đang đăng nhập (Xưởng/Kíp/Nhóm
  // nhỏ/Nhân viên phụ trách), người dùng vẫn tự do đổi lại sau đó. Function
  // initializer (không phải useEffect) để tránh lint set-state-in-effect.
  // Fix mục 3: chỉ áp mặc định khi giá trị đó thực sự có trong dữ liệu thiết
  // bị -- hồ sơ có nhom/kip lệch format (vd "1" vs "Kíp 1", hoặc thietbi.nhom
  // chưa nhập) sẽ mặc định về "Tất cả" thay vì lọc rỗng cả danh sách.
  const initialXuong = defaultIfAvailable(currentUser.xuong, items.map((i) => i.xuong));
  const initialKip = defaultIfAvailable(currentUser.kip, items.map((i) => i.kip));
  const initialNhom = defaultIfAvailable(currentUser.nhom, items.map((i) => i.nhom));
  const [filterXuong, setFilterXuong] = useState(initialXuong);
  const [filterKip, setFilterKip] = useState(initialKip);
  const [filterNhom, setFilterNhom] = useState(initialNhom);
  const [filterKhuVuc, setFilterKhuVuc] = useState("");
  // Chỉ mặc định về "chính mình" nếu msnv đó thực sự đứng tên phụ trách ít
  // nhất 1 thiết bị khớp Xưởng/Kíp đã mặc định -- nếu không, mặc định về
  // msnv sẽ lọc rỗng toàn bộ danh sách (đa số Admin không đứng tên phụ trách
  // thiết bị nào).
  const [filterNguoiPhuTrach, setFilterNguoiPhuTrach] = useState(() => {
    if (!currentUser.msnv) return "";
    const isOwnerOfSomeDevice = items.some(
      (i) =>
        (!initialXuong || i.xuong === initialXuong) &&
        (!initialKip || i.kip === initialKip) &&
        i.nguoi_phu_trach === currentUser.msnv,
    );
    return isOwnerOfSomeDevice ? currentUser.msnv : "";
  });

  const xuongOptions = uniqueSorted(items.map((i) => i.xuong));
  const kipOptions = uniqueSorted(items.map((i) => i.kip));
  const nhomOptions = uniqueSorted(items.map((i) => i.nhom));
  const khuVucOptions = uniqueSorted(items.map((i) => i.khu_vuc));

  const filteredItems = items.filter(
    (item) =>
      (!filterXuong || item.xuong === filterXuong) &&
      (!filterKip || item.kip === filterKip) &&
      (!filterNhom || item.nhom === filterNhom) &&
      (!filterKhuVuc || item.khu_vuc === filterKhuVuc) &&
      (!filterNguoiPhuTrach || item.nguoi_phu_trach === filterNguoiPhuTrach),
  );

  function handleDelete(item: ThietBiRow) {
    if (
      !confirm(
        `Xoá thiết bị ${formatThietBiLabel(item.ma_thiet_bi, item.ten_thiet_bi)}?\n\nHành động này XOÁ VĨNH VIỄN toàn bộ Chi tiết và Công việc con của thiết bị, không thể hoàn tác. Nếu chỉ muốn ngừng theo dõi một hạng mục, hãy dùng chức năng "loại bỏ dần" (đặt Active = false) ở trang Chi tiết thiết bị thay vì xoá ở đây.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteThietBi(item.id);
      if (result.error) {
        setDeleteError(result.error);
      }
    });
  }

  return (
    <div>
      <CreateThietBiForm users={users} />

      {deleteError ? <p className={`mb-3 ${ui.errorText}`}>{deleteError}</p> : null}

      {/* Mục 11: bộ lọc gõ-tìm không dấu (SearchableSelect) thay <select>. */}
      <div className={`mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${ui.card}`}>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Xưởng</label>
          <SearchableSelect
            value={filterXuong}
            onChange={setFilterXuong}
            options={xuongOptions.map((x) => ({ value: x, label: x }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Kíp</label>
          <SearchableSelect
            value={filterKip}
            onChange={setFilterKip}
            options={kipOptions.map((k) => ({ value: k, label: k }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Nhóm nhỏ</label>
          <SearchableSelect
            value={filterNhom}
            onChange={setFilterNhom}
            options={nhomOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Khu vực</label>
          <SearchableSelect
            value={filterKhuVuc}
            onChange={setFilterKhuVuc}
            options={khuVucOptions.map((k) => ({ value: k, label: k }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={ui.label}>Nhân viên phụ trách</label>
          <SearchableSelect
            value={filterNguoiPhuTrach}
            onChange={setFilterNguoiPhuTrach}
            options={users.map((u) => ({ value: u.msnv, label: `${u.ho_ten} (${u.msnv})` }))}
          />
        </div>
      </div>

      <div className={`overflow-x-auto ${ui.card} p-0!`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">Mã</th>
              <th className="px-4 py-2.5">Tên</th>
              <th className="px-4 py-2.5">Xưởng</th>
              <th className="px-4 py-2.5">Kíp</th>
              <th className="px-4 py-2.5">Nhóm nhỏ</th>
              <th className="px-4 py-2.5">Người phụ trách</th>
              <th className="px-4 py-2.5">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{item.ma_thiet_bi}</td>
                <td className="px-4 py-2.5">{item.ten_thiet_bi}</td>
                <td className="px-4 py-2.5 text-gray-600">{item.xuong ?? ""}</td>
                <td className="px-4 py-2.5 text-gray-600">{item.kip ?? ""}</td>
                <td className="px-4 py-2.5 text-gray-600">{item.nhom ?? ""}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {item.nguoi_phu_trach
                    ? `${nameByMsnv.get(item.nguoi_phu_trach) ?? "?"} (${item.nguoi_phu_trach})`
                    : "— Chưa gán —"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <Link href={`/admin/equipment/${item.id}`} className={`${ui.buttonSecondary} px-2! py-1! text-xs!`}>
                      Chi tiết
                    </Link>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(item)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Xoá
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {items.length === 0 ? "Chưa có thiết bị nào." : "Không có thiết bị khớp bộ lọc."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
