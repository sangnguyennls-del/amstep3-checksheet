"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ui } from "@/lib/ui";

const links = [
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/equipment", label: "Thiết bị" },
  { href: "/admin/dong-bo", label: "Đồng bộ CSTB" },
  { href: "/admin/bat-thuong", label: "Bất thường" },
  { href: "/admin/de-xuat", label: "Duyệt đề xuất" },
  { href: "/admin/stats", label: "Thống kê" },
  { href: "/admin/settings", label: "Cài đặt" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? ui.navLinkActive : ui.navLink}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
