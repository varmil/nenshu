import { test as base, type Page } from "@playwright/test";

/**
 * ランキングを触るテスト用の `test`。**`/` を開いたら全件データの到着まで待つ**
 * （E0・Issue #174・ADR-0013）。
 *
 * E0 で `/` の初回HTMLから全社ぶんのデータを外し、クライアントは
 * `/data/companies.json` を初回に1度だけ取りに行くようになった。**届く前の操作は
 * 実ナビゲーションに倒れる**——これは仕様（届かなくても操作が沈黙しないため）だが、
 * テストから見ると `goto` の直後のクリックが**その時の速さ次第で `pushState` にも
 * 実ナビゲーションにもなる**。実際、E0 の直後に全件を並列で回すと
 * 「戻ると一つ前の絞り込みに戻る」と「従業員数で絞ると全社が1,000人以上」の2件が
 * 落ち、**単体で回すと通った**（履歴の積まれ方と、遷移中に取った要素が原因）。
 *
 * **待ち方を1か所に閉じる。** テストごとに `waitForRankingReady` を書くと、
 * 新しく足したテストで忘れたときに**落ちずに不安定になるだけ**なので気づけない。
 *
 * **待つのは `/` を素で開いたときだけ。**
 * - `/about`・`/company/[id]` にはこの印が無い（出るまで待つと必ずタイムアウトする）
 * - `waitUntil` を明示した `goto` では待たない——**ハイドレーション前のHTMLを見る
 *   テスト**（`e2e/theme.spec.ts` のちらつき防止）は、待った時点でその瞬間を過ぎる
 *
 * 届く前の振る舞いそのものを見るテストは `e2e/initial-payload.spec.ts` にあり、
 * そちらは素の `@playwright/test` を使う。
 */
function isRankingPath(url: string): boolean {
  try {
    return new URL(url, "http://localhost").pathname === "/";
  } catch {
    return false;
  }
}

export const test = base.extend({
  // Playwright の第2引数は「テスト本体を走らせる」関数。名前を `use` にすると
  // eslint の react-hooks/rules-of-hooks が React の `use()` と取り違えるので変えてある。
  page: async ({ page }: { page: Page }, runTest: (page: Page) => Promise<void>) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      if (options?.waitUntil === undefined && isRankingPath(url)) {
        await page.locator("[data-ranking-ready]").waitFor({ state: "attached" });
      }
      return response;
    };
    await runTest(page);
  },
});

export { expect } from "@playwright/test";
