import { test as base, type Page } from "@playwright/test";

/**
 * 画面を操作するテスト用の `test`。**`goto` の直後に2つ待つ。**
 *
 * ## 1. ハイドレーションの完了（F1・Issue #209・ADR-0014）
 *
 * Astro は島（`client:load`）ごとに React を後から取り付ける。**取り付く前に来た
 * クリックはどこにも届かない**——SSR したボタンは最初から DOM にあるので
 * Playwright の自動待機は素通りし、`click()` は成功したように見えて何も起きない。
 * Next.js の頃は1つのバンドルが一度に取り付いていたので表に出なかった。
 *
 * 実際、F1 の1巡目は `/company/[id]` の「年齢そろえに切り替える」系が11件落ちた。
 * **単体で走らせても落ち、手で1.5秒待ってから押すと通った**ので、テストの書き方
 * ではなく取り付く前に押していたことが分かる。
 *
 * 印は Astro が付ける `<astro-island ssr>` 属性で、**取り付いた島からは消える**。
 * 島が1つも無いページ（`/robots.txt` 等）では最初から空なので素通りする。
 *
 * ## 2. 全件データの到着（E0・Issue #174・ADR-0013）
 *
 * E0 で `/` の初回HTMLから全社ぶんのデータを外し、クライアントは
 * `/data/companies.json` を初回に1度だけ取りに行くようになった。**届く前の操作は
 * 実ナビゲーションに倒れる**——これは仕様（届かなくても操作が沈黙しないため）だが、
 * テストから見ると `goto` の直後のクリックが**その時の速さ次第で `pushState` にも
 * 実ナビゲーションにもなる**。実際、E0 の直後に全件を並列で回すと
 * 「戻ると一つ前の絞り込みに戻る」と「従業員数で絞ると全社が1,000人以上」の2件が
 * 落ち、**単体で回すと通った**（履歴の積まれ方と、遷移中に取った要素が原因）。
 *
 * **待ち方を1か所に閉じる。** テストごとに書くと、新しく足したテストで忘れたときに
 * **落ちずに不安定になるだけ**なので気づけない。
 *
 * **どちらも `waitUntil` を明示した `goto` では待たない**——**ハイドレーション前の
 * HTML を見るテスト**（`e2e/theme.spec.ts` のちらつき防止）は、待った時点でその
 * 瞬間を過ぎる。全件が届く前の振る舞いそのものを見るテストは
 * `e2e/initial-payload.spec.ts` にあり、そちらは素の `@playwright/test` を使う。
 */
/**
 * 島に React が取り付くまで待つ。**`waitUntil` を明示した `goto`／`reload` の後で
 * それでも操作したいとき**に呼ぶ（`e2e/theme.spec.ts` のように、ハイドレーション前の
 * HTML を見てから続けて押すテスト）。
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

function isRankingPath(url: string): boolean {
  try {
    return new URL(url, "http://localhost").pathname === "/";
  } catch {
    return false;
  }
}

async function settle(page: Page, ranking: boolean): Promise<void> {
  await waitForHydration(page);
  if (ranking) await page.locator("[data-ranking-ready]").waitFor({ state: "attached" });
}

export const test = base.extend({
  // Playwright の第2引数は「テスト本体を走らせる」関数。名前を `use` にすると
  // eslint の react-hooks/rules-of-hooks が React の `use()` と取り違えるので変えてある。
  page: async ({ page }: { page: Page }, runTest: (page: Page) => Promise<void>) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      if (options?.waitUntil === undefined) await settle(page, isRankingPath(url));
      return response;
    };
    // **リロードも同じ扱い**——`reload()` の後もハイドレーションはやり直しになる。
    const reload = page.reload.bind(page);
    page.reload = async (options) => {
      const response = await reload(options);
      if (options?.waitUntil === undefined) {
        await settle(page, isRankingPath(page.url()));
      }
      return response;
    };
    await runTest(page);
  },
});

export { expect } from "@playwright/test";
