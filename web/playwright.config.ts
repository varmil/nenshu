import { defineConfig } from "@playwright/test";

// Next.js の dev サーバーはプロジェクトディレクトリ単位で単一インスタンスしか
// 許可しない（ポートを変えても2つ目は起動を拒否される）ため、既定の3000番を使い、
// 既存のdevサーバーがあればそれを再利用する。
const PORT = 3000;

// **キャッシュヘッダの検証だけは dev サーバーでは足りない。** `headers()` の
// `has`/`missing` を評価するのは、本番では Next.js 本体ではなく OpenNext の
// マッチャで、両者の挙動が食い違う（ADR-0004「RSC応答を…」参照。`next start`
// では通るのに Worker 上でだけ規則が不成立になる不具合を実際に踏んだ）。
//
// `E2E_BASE_URL` を渡すと、その宛先に対してそのまま流す。dev サーバーは起動
// しない。Worker に向けるなら:
//
//   npx opennextjs-cloudflare build && npx wrangler dev --port 3801 --local
//   E2E_BASE_URL=http://127.0.0.1:3801 npx playwright test e2e/cache-headers.spec.ts
//
// デプロイ済みのプレビューURLを渡してもよい。
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 30_000,
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
