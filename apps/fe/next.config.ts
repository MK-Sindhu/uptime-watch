import path from "node:path"
import type { NextConfig } from "next"

// The Express API (apps/api). The browser calls /api/*, and Next proxies it here,
// so the API needs no CORS setup.
const API_URL = process.env.API_URL ?? "http://localhost:3000"

const MONOREPO_ROOT = path.join(__dirname, "../..")

const nextConfig: NextConfig = {
  // Monorepo root: Bun installs `next` in the root node_modules, not in apps/fe.
  turbopack: {
    root: MONOREPO_ROOT,
  },
  // For the Docker image (apps/fe/Dockerfile): .next/standalone holds a
  // minimal server and only the node_modules files it uses. Traced from the
  // monorepo root so packages/api-client and hoisted modules are included.
  output: "standalone",
  outputFileTracingRoot: MONOREPO_ROOT,
  // packages/api-client ships TypeScript source; let Next compile it.
  transpilePackages: ["api-client"],
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
