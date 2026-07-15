"use client";

// Chuông thông báo (Pha 6, Task 2): tải khi mount + sau khi lưu checksheet
// thành công (sự kiện `CHECKSHEET_SAVED_EVENT`). KHÔNG polling định kỳ --
// đúng hành vi hệ cũ (App "chuông" trong Javascript.html chỉ tải lại lúc mở
// trang hoặc sau khi lưu, xem CLAUDE.md).
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHECKSHEET_SAVED_EVENT,
  getNotificationGroups,
  type NotificationGroup,
} from "@/lib/checksheet/notifications";

const TIEU_DE_COLOR: Record<NotificationGroup["loai"], string> = {
  plan: "text-amber-600",
  act: "text-red-600",
};

export function NotificationBell({ msnv }: { msnv: string | null }) {
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!msnv) return;

    let cancelled = false;
    async function load() {
      const supabase = createClient();
      try {
        const result = await getNotificationGroups(supabase, msnv as string);
        if (!cancelled) setGroups(result);
      } catch {
        // Lỗi tải thông báo không phải luồng chính (chấm công) -- bỏ qua âm
        // thầm, giữ nguyên nhóm cũ thay vì chặn UI bằng thông báo lỗi.
      }
    }

    load();
    window.addEventListener(CHECKSHEET_SAVED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CHECKSHEET_SAVED_EVENT, load);
    };
  }, [msnv]);

  const count = groups.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-md border px-2.5 py-1.5 text-sm hover:bg-gray-50"
        aria-label="Thông báo"
      >
        🔔
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium leading-none text-white">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-[#dee2e6] bg-white p-3 text-left shadow-lg">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500">Không có thông báo</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.loai}>
                  <p className={`text-sm font-medium ${TIEU_DE_COLOR[g.loai]}`}>{g.tieuDe}</p>
                  <p className="whitespace-pre-line text-sm text-gray-600">{g.noiDung}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
