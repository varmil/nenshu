/**
 * <Link> のプリフェッチが本番ビルドで何件のリクエストを生むかを測る。
 *
 * **プリフェッチは本番でしか動かない**（Next.js のドキュメント: "Prefetching is only
 * enabled in production"）。E2E は dev サーバーに対して走るので、この挙動は
 * Playwright のテストでは検出できない。C1 で企業詳細ページへのリンクを100件
 * 並べたとき、実測でトップページ表示だけで34件のプリフェッチが飛んでいた。
 * `/company/[id]` も `/` も動的レンダリングなので、そのぶん Worker が起動する
 * （無料枠は10万リクエスト/日）。
 *
 *   npm run build
 *   npx next start -p 3211
 *   npm run measure:prefetch
 *
 * 期待値: `/company/` を含むリクエストが 0 件。
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3211";

const browser = await chromium.launch();
const page = await browser.newPage();

const requests = [];
page.on("request", (r) => requests.push(r.url()));

await page.goto(`${base}/`, { waitUntil: "networkidle" });
// ビューポート内のリンクだけが対象なので、下まで送って全件を視界に入れる。
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(4000);

const toCompany = requests.filter((u) => u.includes("/company/"));
const rsc = requests.filter((u) => u.includes("_rsc="));

console.log(`総リクエスト数: ${requests.length}`);
console.log(`/company/ への先読み: ${toCompany.length}`);
console.log(`RSCペイロードの取得: ${rsc.length}`);
if (toCompany.length > 0) {
  console.log("例:", [...new Set(toCompany)].slice(0, 5));
}

await browser.close();
process.exit(toCompany.length === 0 ? 0 : 1);
