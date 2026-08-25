/**
 * 事前生成した結果が**静的アセットに載っているか**を確かめる（R1・Issue #180）。
 *
 * `staticAssetsIncrementalCache` は `.open-next/assets/cdn-cgi/_next_cache/` から
 * ページを引く。ここが空でもビルドは通り、デプロイも "successful" になり、
 * **全1,867ページが 404 を返す**——実際にプレビューでそうなった。コピーを担うのは
 * `opennextjs-cloudflare deploy` だが、このプロジェクトのデプロイコマンドは
 * `npx wrangler deploy` なので、`wrangler.jsonc` の `build.command` から
 * `populateCache` を呼んでいる（`docs/runtime/cpu-budget/design.md`）。
 *
 * **静かに壊れる経路なので、ビルドを落とす形で見張る。**
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = resolve(ROOT, ".open-next/assets/cdn-cgi/_next_cache");

function fail(message) {
  console.error(`\n事前生成の検証に失敗しました: ${message}\n`);
  process.exit(1);
}

if (!existsSync(CACHE_DIR)) {
  fail(
    `${CACHE_DIR} がありません。` +
      `wrangler.jsonc の build.command が populateCache を呼べていない可能性があります。`
  );
}

const buildIds = readdirSync(CACHE_DIR);
if (buildIds.length !== 1) {
  fail(`ビルドIDのディレクトリが ${buildIds.length} 個あります（1個の想定）: ${buildIds.join(", ")}`);
}
const base = resolve(CACHE_DIR, buildIds[0]);

const expected = JSON.parse(
  readFileSync(resolve(ROOT, "public/data/companies.json"), "utf-8")
).rows.length;
const companyDir = resolve(base, "company");
if (!existsSync(companyDir)) fail(`${companyDir} がありません（企業詳細ページが1枚も無い）`);
const actual = readdirSync(companyDir).filter((f) => f.endsWith(".cache")).length;
if (actual !== expected) {
  fail(`企業詳細ページが ${actual} 枚しかありません（${expected} 枚の想定）`);
}

for (const name of ["about.cache", "sitemap.xml.cache", "robots.txt.cache"]) {
  if (!existsSync(resolve(base, name))) fail(`${name} がありません`);
}

// 静的アセットの 404（`wrangler.jsonc` の `not_found_handling`）。**無いと存在しない
// パスで Worker が起動する**（`scripts/write-404-asset.mjs` が書く）。
if (!existsSync(resolve(ROOT, ".open-next/assets/404.html"))) {
  fail("404.html がありません（scripts/write-404-asset.mjs が走っていない）");
}

console.log(`事前生成の検証: 企業詳細 ${actual} 枚 ＋ about・sitemap・robots を確認しました`);
