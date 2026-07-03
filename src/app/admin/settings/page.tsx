import { createClient } from "@/lib/supabase/server";
import { SettingsForm, type CaiDatRow } from "./SettingsForm";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("cai_dat").select("key, value");

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Cài đặt hệ thống</h1>
      <SettingsForm current={(rows ?? []) as CaiDatRow[]} />
    </div>
  );
}
