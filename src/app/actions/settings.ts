"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export type SettingsActionState = {
  error: string | null;
  success?: boolean;
};

// Checkbox HTML không gửi field nếu bị bỏ tick -- phải map "có mặt trong
// formData" thành "true" và "vắng mặt" thành "false", KHÔNG được bỏ qua
// việc cập nhật field đó.
function checkboxToText(formData: FormData, key: string): "true" | "false" {
  return formData.get(key) != null ? "true" : "false";
}

export async function updateSettings(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không có quyền truy cập" };
  }

  const lockDateRaw = String(formData.get("lockDate") ?? "").trim();
  const lockDate = lockDateRaw ? Number(lockDateRaw) : NaN;

  if (!lockDateRaw || !Number.isFinite(lockDate) || !Number.isInteger(lockDate) || lockDate < 1) {
    return { error: "Ngày khoá (Lock Date) phải là số nguyên hợp lệ" };
  }

  const enableLockDate = checkboxToText(formData, "enableLockDate");
  const enableTimeLimit = checkboxToText(formData, "enableTimeLimit");
  const enableDeviceLock = checkboxToText(formData, "enableDeviceLock");
  // KHÔNG giới hạn thêm quyền chỉnh maintenanceMode chỉ cho adminm -- RLS
  // cai_dat_write hiện tại đã cho phép bất kỳ admin/adminm nào ghi bảng
  // này, giữ nguyên đúng như vậy (quyết định đã chốt, xem plan Task 3).
  const maintenanceMode = checkboxToText(formData, "maintenanceMode");

  const supabase = await createClient();

  // 5 dòng cai_dat luôn tồn tại sẵn từ migration seed -- dùng update theo
  // key là đủ, không cần insert/upsert.
  const updates: Array<{ key: string; value: string }> = [
    { key: "LOCK_DATE", value: String(lockDate) },
    { key: "ENABLE_LOCK_DATE", value: enableLockDate },
    { key: "ENABLE_TIME_LIMIT", value: enableTimeLimit },
    { key: "ENABLE_DEVICE_LOCK", value: enableDeviceLock },
    { key: "MAINTENANCE_MODE", value: maintenanceMode },
  ];

  for (const { key, value } of updates) {
    const { error } = await supabase.from("cai_dat").update({ value }).eq("key", key);
    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/admin/settings");
  return { error: null, success: true };
}
