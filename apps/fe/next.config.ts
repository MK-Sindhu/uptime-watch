import path from "node:path"
import type { NextConfig } from "next"

// The Express API (apps/api). The browser calls /api/*, and Next proxies it here,
// so the API needs no CORS setup.
const API_URL = process.env.API_URL ?? "http://localhost:3000"

const nextConfig: NextConfig = {
  // Monorepo root: Bun installs `next` in the root node_modules, not in apps/fe.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/:path*`,
      },
    ]
  },
}

export default nextConfig
