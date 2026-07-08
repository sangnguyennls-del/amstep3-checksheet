import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Mặc định Next tự thêm Content-Disposition: attachment cho ảnh qua
    // /_next/image, khiến <img> không hiển thị inline được (chỉ tải xuống)
    // -- logo công ty/xưởng (Việc 3) cần hiển thị trực tiếp trên trang.
    contentDispositionType: "inline",
  },
};

export default nextConfig;
