"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/equipment", label: "Thiết bị" },
  { href: "/admin/bat-thuong", label: "Bất thường" },
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
            className={
              active
                ? "text-sm font-medium text-blue-600"
                : "text-sm font-medium text-gray-600 transition-colors hover:text-blue-600"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
