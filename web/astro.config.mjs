// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL(".", import.meta.url));

/**
 * **`astro dev` ではアダプタを付けない**（F1・Issue #209）。
 *
 * `@astrojs/cloudflare` は dev でも workerd を立て、Vite のモジュールランナーで
 * その中を走らせる。**この構成では起動しない**——依存の事前バンドルが遅れて
 * 走るたびにランナーが再読込され、古いチャンクを掴んで `require is not defined`
 * / `deps_ssr/*.js does not exist` で落ちる（実測。最小のページ・最小の
 * `wrangler.jsonc` でも同じ）。
 *
 * **dev は Astro 自身のサーバーで足りる。** Worker に固有のもの——`_headers`・
 * `run_worker_first`・`not_found_handling`——は**もともと dev サーバーでは効かない**
 * ので（CLAUDE.md）、確かめる場所は前から `wrangler dev` だった。E2E も
 * `E2E_BASE_URL` を渡してそちらへ向ける（`e2e/asset-routing.spec.ts` ほか）。
 *
 * **ビルドには必ず付く。** `astro build`・`astro check` はここを通る。
 */
const isDev = process.argv.includes("dev");

/**
 * Astro（ADR-0014・F1・Issue #209）。
 *
 * **`/` 以外はすべてビルド時に生成し、静的アセットとして返す。** `output: "static"`
 * が既定で、`/` だけが `export const prerender = false` で SSR に残る
 * （`?age=N` 8件・`?ind=X` 33件を別内容・別canonicalでインデックスさせている。ADR-0006）。
 */
export default defineConfig({
  output: "static",
  /*
    **既定は `/about/` のようにスラッシュで終わる。** ADR-0006 は「一度公開したURLは
    変えない」ので、末尾スラッシュ無しのまま出す必要がある。この2行が無いと
    canonical・sitemap・実際のURLが食い違う（調査のプローブで実測。
    `docs/framework/intent.md`「URL の形」）。
  */
  trailingSlash: "never",
  build: { format: "file" },
  ...(isDev
    ? {}
    : {
        adapter: cloudflare({
          // 画像の変換は使わない（`next.config.ts` の `images.unoptimized` と同じ立場）。
          // 有効なままだと Images バインディングを前提にしたコードが Worker に載る。
          imageService: "passthrough",
        }),
      }),
  /*
    **開発ツールバーは出さない**（F1・Issue #209）。Astro の dev サーバーは既定で
    画面にオーバーレイを差し込むが、その中身に `h1` が3つ入っている（`Audit`・
    `No accessibility or performance issues detected.`・`Settings`）。**E2E は dev
    サーバーに対して走る**ので、`locator("h1")` が4件に当たって strict mode で落ちる
    （実測。`e2e/ranking-filters.spec.ts`）。テストの側を `.first()` で逃がすと、
    本物の `h1` が2つある事故を見逃す。
  */
  /*
    **セッションは使わない**（F1・Issue #209）。`@astrojs/cloudflare` は既定で
    セッションを有効にし、`SESSION` という**KV バインディングを生成後の
    `wrangler.json` に足す**（id 無しで）。**このサイトはリクエスト時に何も憶えない**
    ——`/` はクエリだけを読んで描き、それ以外はビルド時に確定している。R1（ADR-0012）
    が「KV・R2・D1 を増やさずに済む」ことを条件に組み立てた構成なので、
    使わないバインディングを宣言だけ残さない。
  */
  session: false,
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // `@/...` は `web/` の直下を指す（`tsconfig.json` の paths と同じ）。
      alias: [{ find: /^@\//, replacement: web }],
    },
  },
});
