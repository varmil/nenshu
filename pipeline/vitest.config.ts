import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // web/ は別プロジェクト（独自の package.json・vitest）。
    // デフォルトのファイル探索だと web/features/**/*.test.ts まで拾ってしまうため明示的に絞る。
    include: ["scripts/**/*.test.ts", "worklife/**/*.test.ts"],
  },
});
