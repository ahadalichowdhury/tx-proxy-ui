import { setupDevPlatform } from "@cloudflare/next-on-pages/next-dev";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const proxyOrigin =
      process.env.PROXY_BASE_URL?.replace(/\/proxy\/?$/, "") ??
      "http://127.0.0.1:8080";

    return [
      {
        source: "/proxy",
        destination: `${proxyOrigin}/proxy`,
      },
    ];
  },
};

if (process.env.NODE_ENV === "development") {
  await setupDevPlatform();
}

export default nextConfig;
