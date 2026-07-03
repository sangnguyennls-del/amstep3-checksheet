import { createClient } from "@/lib/supabase/server";
import { EquipmentList, type ThietBiRow } from "./EquipmentList";

export default async function AdminEquipmentPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("thietbi")
    .select("id, ma_thiet_bi, ten_thiet_bi, xuong, kip, nguoi_phu_trach")
    .order("ma_thiet_bi");

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Quản lý thiết bị</h1>
      <EquipmentList items={(items ?? []) as ThietBiRow[]} />
    </div>
  );
}
