import { defineConfig } from "@playwright/test";

// dev サーバーのポート。**`astro dev` の既定は 4321 なので、明示的に渡す**
// （F1・Issue #209。Next.js の頃は 3000 が既定だった）。既存の dev サーバーが
// あればそれを再利用する。
const PORT = 4321;

// **Worker に固有のものは dev サーバーでは確かめられない**（F1・ADR-0014）。
// `public/_headers`・`run_worker_first`・`not_found_handling` はどれも Cloudflare の
// 静的アセットの仕組みで、Astro の dev サーバーは読まない。**dev では skip し、
// Worker に向けたときだけ走るテストがある**（`e2e/asset-routing.spec.ts`・
// `e2e/cache-headers.spec.ts` の後半）。
//
// `E2E_BASE_URL` を渡すと、その宛先に対してそのまま流す。dev サーバーは起動しない。
// Worker に向けるなら:
//
//   npx astro build && npx wrangler dev --port 3801 --local
//   E2E_BASE_URL=http://localhost:3801 npx playwright test
//
// **`127.0.0.1` ではなく `localhost` を渡すこと**（CLAUDE.md）。
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        /*
          **`ASTRO_DEV_BACKGROUND=false` を渡す**（F1・Issue #209）。Astro 7 の
          `astro dev` は既定でデーモン化して即座に終了するので、Playwright が
          「サーバーのプロセスが早期に終了した」と判断して落ちる。前面で走らせる。
        */
        command: `ASTRO_DEV_BACKGROUND=false npm run dev -- --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        // Astro の初回起動は依存の事前バンドルを挟むので 30 秒では足りない
        // （実測で 4〜12 秒＋バンドル。コンテナでは遅い）。
        timeout: 120_000,
      },
  use: {
    baseURL: BASE_URL,
    // ブラウザを同梱できない実行環境（コンテナ等）向けの逃げ道。
    // 未設定ならPlaywrightが自前で入れたChromiumをそのまま使う。
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
});
