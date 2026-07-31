"use client";

// Chuông thông báo (Pha 6, Task 2 + Đợt 5 #5): tải khi mount + sau khi lưu
// checksheet thành công (`CHECKSHEET_SAVED_EVENT`). KHÔNG polling định kỳ.
// Hiển thị gọn: mỗi nhóm là tiêu đề + số đếm + tối đa 5 dòng ("… và N mục
// khác"). Thêm nhóm "Kết quả đề xuất" (được duyệt/từ chối) cho người đề xuất,
// lọc "chưa xem" bằng localStorage để không lặp lại thông báo cũ.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHECKSHEET_SAVED_EVENT,
  getNotifications,
  type NotificationGroup,
} from "@/lib/checksheet/notifications";

const MAX_ITEMS = 5;

const NHOM_STYLE: Record<NotificationGroup["loai"], { color: string; icon: string }> = {
  plan: { color: "text-amber-600", icon: "📋" },
  act: { color: "text-red-600", icon: "⚠️" },
  de_xuat: { color: "text-indigo-600", icon: "🔔" },
};

export function NotificationBell({ msnv }: { msnv: string | null }) {
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [deXuatItems, setDeXuatItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const seenKey = msnv ? `dexuat_seen_at:${msnv}` : null;

  useEffect(() => {
    if (!msnv) return;

    let cancelled = false;
    async function load() {
      const supabase = createClient();
      try {
        const data = await getNotifications(supabase, msnv as string);
        if (cancelled) return;
        setGroups(data.groups);
        // Chỉ giữ đề xuất có kết quả MỚI hơn lần mở chuông gần nhất (đã xem).
        const seenAt = seenKey ? localStorage.getItem(seenKey) : null;
        const fresh = data.deXuat.filter((d) => !seenAt || d.updatedAt > seenAt);
        setDeXuatItems(fresh.map((d) => d.text));
      } catch {
        // Lỗi tải thông báo không phải luồng chính -- bỏ qua âm thầm.
      }
    }

    load();
    window.addEventListener(CHECKSHEET_SAVED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CHECKSHEET_SAVED_EVENT, load);
    };
  }, [msnv, seenKey]);

  const displayGroups = useMemo<NotificationGroup[]>(() => {
    const g = [...groups];
    if (deXuatItems.length > 0) {
      g.push({ loai: "de_xuat", tieuDe: "Kết quả đề xuất", items: deXuatItems });
    }
    return g;
  }, [groups, deXuatItems]);

  const count = displayGroups.length;

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      // Mở chuông = đã xem: ghi mốc thời gian để lần tải sau không hiện lại
      // các đề xuất đã xử lý này. Giữ nguyên danh sách đang hiện của phiên này.
      if (next && seenKey) localStorage.setItem(seenKey, new Date().toISOString());
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
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
        <div className="absolute right-0 z-10 mt-2 w-80 max-w-[90vw] rounded-md border border-[#dee2e6] bg-white p-3 text-left shadow-lg">
          {displayGroups.length === 0 ? (
            <p className="text-sm text-gray-500">Không có thông báo</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {displayGroups.map((g) => {
                const style = NHOM_STYLE[g.loai];
                const shown = g.items.slice(0, MAX_ITEMS);
                const con = g.items.length - shown.length;
                return (
                  <li key={g.loai}>
                    <p className={`text-sm font-medium ${style.color}`}>
                      {style.icon} {g.tieuDe} ({g.items.length})
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600">
                      {shown.map((it, i) => (
                        <li key={i} className="truncate" title={it}>
                          • {it}
                        </li>
                      ))}
                      {con > 0 ? <li className="text-gray-400">… và {con} mục khác</li> : null}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
