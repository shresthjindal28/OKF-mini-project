import type { NextConfig } from "next";

// Same-origin proxy to the FastAPI backend; avoids CORS entirely in every environment.
// 127.0.0.1 is deliberate: Node may resolve `localhost` to ::1 while uvicorn binds IPv4.
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
