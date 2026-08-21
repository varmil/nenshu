import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { cacheHeaderRules } from "./lib/cache/headers";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  // 規則の本体と、その理由・順序の制約は `lib/cache/headers.ts` にある。
  // ここに直接書き足さないこと（順序に意味があり、静かに壊れる）。
  // 静的アセット（_next/static/*）はWorkerを経由しないためここでは効かない。
  // そちらは public/_headers で設定している。
  headers: cacheHeaderRules,
};

export default nextConfig;

initOpenNextCloudflareForDev();
