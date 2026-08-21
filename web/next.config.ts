import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  async headers() {
    // どちらのページもデータはビルド時に確定し、実行中は変わらない（更新は年1回）。
    // ブラウザには短め、エッジには長めに持たせる。
    // 静的アセット（_next/static/*）はWorkerを経由しないためここでは効かない。
    // そちらは public/_headers で設定している。
    const cacheHeaders = [
      { key: "Cache-Control", value: "public, max-age=3600" },
      {
        key: "Cloudflare-CDN-Cache-Control",
        value: "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    ];
    return [
      { source: "/", headers: cacheHeaders },
      { source: "/about", headers: cacheHeaders },
      { source: "/company/:id", headers: cacheHeaders },
      // sitemap・robots も中身がビルド時に確定する（U8）。クローラが取りに来る
      // たびにWorkerを起こす理由がないので、同じキャッシュに乗せる。
      { source: "/sitemap.xml", headers: cacheHeaders },
      { source: "/robots.txt", headers: cacheHeaders },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
