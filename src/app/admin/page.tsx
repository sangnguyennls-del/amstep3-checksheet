import Link from "next/link";

const SECTIONS = [
  {
    href: "/admin/users",
    title: "Người dùng",
    desc: "Quản lý tài khoản, vai trò, đặt lại mật khẩu",
  },
  {
    href: "/admin/equipment",
    title: "Thiết bị",
    desc: "Quản lý cây thiết bị / chi tiết / công việc",
  },
  {
    href: "/admin/settings",
    title: "Cài đặt",
    desc: "Cấu hình khoá thời gian, chế độ bảo trì",
  },
];

export default function AdminIndexPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Trang quản trị</h1>
      <p className="mb-6 text-sm text-gray-500">Chọn một mục để quản lý bên dưới.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-md border bg-white p-4 hover:border-blue-400 hover:shadow-sm"
          >
            <h2 className="font-medium text-gray-800">{s.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
