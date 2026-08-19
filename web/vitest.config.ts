import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: [
      "features/**/*.test.ts",
      "lib/**/*.test.ts",
      "design-system/**/*.test.ts",
    ],
  },
  resolve: {
    // tsconfig の paths（`@/*` → `./*`）に合わせる。アプリのコードが `@/` で
    // 書かれている以上、テストからも同じ解決になっていないと import で落ちる。
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
