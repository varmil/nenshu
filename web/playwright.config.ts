import { defineConfig } from "@playwright/test";

// Next.js の dev サーバーはプロジェクトディレクトリ単位で単一インスタンスしか
// 許可しない（ポートを変えても2つ目は起動を拒否される）ため、既定の3000番を使い、
// 既存のdevサーバーがあればそれを再利用する。
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
});
