import { test, expect, type Page } from "@playwright/test";

/**
 * **ページを開いただけでリクエストが暴走しないこと**（#183）。
 *
 * `enableCacheInterception` を入れたとき、本番で `/about?_rsc=…` が
 * **毎秒およそ128回・15秒で1,918回**飛んだ。Next.js のルーティングに入る前に
 * キャッシュから返す設定で、プリフェッチのリクエスト（`Next-Router-Prefetch: 1`）
 * にもフルの RSC ペイロードを返してしまい、クライアントのルーターが頼んだものが
 * 返っていないと判断して取り直し続けていた。
 *
 * **このとき E2E は311件すべて通っていた。プリフェッチが本番ビルドでしか動かない
 * ためで、dev サーバー相手にどれだけテストを足しても永久に捕まらない。** だから
 * このファイルは Worker（`E2E_BASE_URL`）に向けたときだけ走る——dev で走らせると
 * 「暴走していない」が自明に通り、**守っているつもりで守っていない**状態になる。
 * それが #183 で起きたことそのものなので、skip する側を既定にしてある。
 *
 * 回し方（CLAUDE.md「Workers 無料枠の CPU」の節）:
 *
 *   npx opennextjs-cloudflare build
 *   npx wrangler dev --port 3801 --local
 *   E2E_BASE_URL=http://localhost:3801 npx playwright test e2e/prefetch-loop.spec.ts
 *
 * **`127.0.0.1` ではなく `localhost` を渡すこと**（CLAUDE.md・W1 の節）。
 */

/** 開いてから数える時間。異常時はこの間に約1,000件出る。 */
const WINDOW_MS = 8_000;

/**
 * 同じURLへの上限。正常なプリフェッチは1ページあたり2件で、異常時は3桁に乗る。
 * **`_rsc` の値はビルドごとに変わるので畳んでから数える**——畳まないと
 * 「毎回違うURL」に見えて、繰り返しを見逃す。
 */
const MAX_PER_URL = 15;

/** 総数の上限。正常は40〜60件（チャンク・ロゴ・プリフェッチ）。 */
const MAX_TOTAL = 200;

const PAGES = ["/", "/company/8282", "/about"];

function countRequests(page: Page): Map<string, number> {
  const counts = new Map<string, number>();
  page.on("request", (req) => {
    const key = req.url().replace(/(_rsc=)[^&]*/, "$1…");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

test.describe("プリフェッチが暴走しない（Issue 183）", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "プリフェッチは本番ビルドでしか動かない。`E2E_BASE_URL` で Worker に向けたときだけ意味がある"
  );

  for (const path of PAGES) {
    test(`${path} を開いて ${WINDOW_MS / 1000} 秒放置してもリクエストが繰り返されない`, async ({
      page,
    }) => {
      const counts = countRequests(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(WINDOW_MS);

      const worst = [...counts].sort((a, b) => b[1] - a[1])[0];
      const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

      expect(worst?.[1] ?? 0, `最も多いURL: ${worst?.[0]}`).toBeLessThanOrEqual(MAX_PER_URL);
      expect(total, `全リクエスト: ${[...counts.keys()].slice(0, 5).join(", ")}`).toBeLessThanOrEqual(
        MAX_TOTAL
      );
    });
  }
});
