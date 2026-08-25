/**
 * 事前生成した Next.js の 404 ページを、静的アセットの `404.html` として置く
 * （Issue #200 の一部・親 #118）。
 *
 * `wrangler.jsonc` の `not_found_handling: "404-page"` がこれを返す。**置かないと
 * 存在しないパスで Worker が起動し、ボットのスキャン1回あたり 122ms の CPU を
 * 使う**（本番の実測）。
 *
 * **Next.js の 404 と同じ HTML を使う。** `/company/<無いID>` は `run_worker_first`
 * に載っているので Worker が返す 404（Next.js のもの）になり、`/wp-admin/…` は
 * こちらのアセットになる。**別々の見た目にならないよう、出どころを1つにしてある。**
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = resolve(ROOT, ".open-next/cache");

if (!existsSync(CACHE_DIR)) {
  console.error(`\n${CACHE_DIR} がありません。先に opennextjs-cloudflare build を走らせること。\n`);
  process.exit(1);
}

const buildIds = readdirSync(CACHE_DIR);
if (buildIds.length !== 1) {
  console.error(`\nビルドIDのディレクトリが ${buildIds.length} 個あります（1個の想定）\n`);
  process.exit(1);
}

const source = resolve(CACHE_DIR, buildIds[0], "_not-found.cache");
if (!existsSync(source)) {
  console.error(`\n${source} がありません（Next.js の 404 が事前生成されていない）\n`);
  process.exit(1);
}

const { html } = JSON.parse(readFileSync(source, "utf-8"));
if (typeof html !== "string" || html.length === 0) {
  console.error(`\n${source} に html がありません\n`);
  process.exit(1);
}

const out = resolve(ROOT, ".open-next/assets/404.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`404 アセット: ${out}（${html.length} 文字）`);
