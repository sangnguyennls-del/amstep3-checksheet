import { createClient } from "@/lib/supabase/server";
import { EquipmentList, type ThietBiRow } from "./EquipmentList";

export default async function AdminEquipmentPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("thietbi")
    .select("id, ma_thiet_bi, ten_thiet_bi, xuong, kip, nguoi_phu_trach")
    .order("ma_thiet_bi");
  const { data: users } = await supabase.from("nguoidung").select("msnv, ho_ten").order("ho_ten");

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold tracking-tight text-gray-900">Quản lý thiết bị</h1>
      <EquipmentList items={(items ?? []) as ThietBiRow[]} users={users ?? []} />
    </div>
  );
}
