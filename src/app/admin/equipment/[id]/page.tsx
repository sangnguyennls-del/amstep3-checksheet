import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EquipmentDetail, type ChiTietWithCongViec, type ThietBiDetail } from "./EquipmentDetail";

export default async function AdminEquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: thietBi } = await supabase
    .from("thietbi")
    .select(
      "id, ma_thiet_bi, ten_thiet_bi, cum, khu_vuc, xuong, kip, nhom, lanh_dao, truong_ca, nguoi_phu_trach",
    )
    .eq("id", id)
    .maybeSingle();

  if (!thietBi) {
    notFound();
  }

  const { data: chiTietRows } = await supabase
    .from("chitiet")
    .select("id, thietbi_id, stt, ten_chi_tiet, dieu_kien_co_ban")
    .eq("thietbi_id", id)
    .order("stt");

  const chiTietIds = (chiTietRows ?? []).map((ct) => ct.id);

  const { data: congViecRows } = chiTietIds.length
    ? await supabase
        .from("congviec")
        .select(
          "id, chitiet_id, loai_hoat_dong, thoi_gian, tan_suat_chu, tan_suat_so, active, hieu_luc_tu, hieu_luc_den, ngay_loai_bo",
        )
        .in("chitiet_id", chiTietIds)
    : { data: [] };

  const chiTietList: ChiTietWithCongViec[] = (chiTietRows ?? []).map((ct) => ({
    ...ct,
    congviec: (congViecRows ?? []).filter((cv) => cv.chitiet_id === ct.id),
  }));

  const { data: nguoiDungRows } = await supabase
    .from("nguoidung")
    .select("msnv, ho_ten")
    .order("ho_ten");

  return (
    <div>
      <EquipmentDetail
        thietBi={thietBi as ThietBiDetail}
        chiTietList={chiTietList}
        users={nguoiDungRows ?? []}
      />
    </div>
  );
}
