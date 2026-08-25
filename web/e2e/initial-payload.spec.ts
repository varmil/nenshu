import { test, expect } from "@playwright/test";

/**
 * 全件を HTML に埋めるのをやめ、静的アセットとして1回だけ配る（E0・Issue #174・
 * ADR-0013。`docs/expansion/initial-payload/design.md`）。
 *
 * ここで固定するのは**届かなかったとき・別の版が返ったとき**に画面が壊れないこと。
 * ふつうに届くときの振る舞い（操作でネットワークが起きない）は各 spec が
 * `waitForRankingReady` の後で数えている。
 */
const DATA_URL = "**/data/companies.json*";

/** 全件が届いていない印。届くと `RankingApp` が `data-ranking-ready` を出す。 */
const READY = "[data-ranking-ready]";

test.describe("全件データが届く前・届かなかったとき", () => {
  /*
   * **この経路を持たない実装にしない**（ADR-0013）。すべての状態は URL にあり、
   * `/` はどの URL でも正しく SSR できる（ADR-0004）ので、届く前の操作は
   * 実ナビゲーションに倒れる——倒れなければ、押しても何も起きない画面になる。
   */
  test("取れなくても操作は実ナビゲーションになり、SSR が絞り込み済みの画面を返す", async ({
    page,
  }) => {
    await page.route(DATA_URL, (route) => route.abort());
    await page.goto("/");

    // 初期表示はサーバーが渡した1ページぶんで、ここまでは届いた場合と同じ。
    await expect(page.getByRole("heading", { name: "平均年収ランキング", level: 1 })).toBeVisible();
    await expect(page.locator(READY)).toHaveCount(0);

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByRole("heading", { name: "35歳年収ランキング", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("table").getByRole("columnheader", { name: /推定年収（35歳）/ })
    ).toBeVisible();
  });

  /*
   * `/` はブラウザ1時間・エッジ24時間キャッシュされる（ADR-0004）ので、
   * **古いHTMLが新しいJSONを引く**組み合わせが起きる。行の並びは stats.json の
   * 順位表やロゴのマスクと添字で結びついており、**ずれると別の会社の順位やロゴを
   * 出す**——受け入れずに実ナビゲーションのまま動かす。
   */
  test("版が食い違うJSONが返っても引き継がない", async ({ page }) => {
    await page.route(DATA_URL, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      await route.fulfill({
        json: { ...json, meta: { ...json.meta, version: "別の版" } },
      });
    });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "平均年収ランキング", level: 1 })).toBeVisible();
    await expect(page.locator(READY)).toHaveCount(0);

    // 引き継いでいないので、操作は実ナビゲーションのまま。
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByRole("heading", { name: "35歳年収ランキング", level: 1 })).toBeVisible();
  });

  /*
   * 版が合っていれば引き継ぐ。上の2つが「印が出ないこと」を見ているので、
   * **印が出る条件があること**を裏で固定しておかないと、印が壊れても気づけない。
   */
  test("版が合えば引き継ぎ、以後の操作はURLだけが変わる", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(READY)).toHaveCount(1);

    const documents: string[] = [];
    page.on("request", (req) => {
      if (req.resourceType() === "document") documents.push(req.url());
    });

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    expect(documents).toHaveLength(0);
  });
});

test.describe("初回ロードのペイロード", () => {
  /*
   * AC-5（gzip 100KB以内）と `docs/ranking/spec.md` 3.「SEO」。**全件を外に
   * 出しても、そのURLで表示する30社は HTML に残っている**——残っていなければ
   * 検索エンジンに1社も見えない。
   */
  test("上位30社は JS 実行なしの HTML に入っている", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();

    const tableHtml = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(tableHtml.match(/<tr/g) ?? []).toHaveLength(31); // 見出し1行＋30社
    expect(tableHtml).toContain("ヒューリック株式会社");
  });

  /*
   * **全件は HTML に入っていない。** これが入り直すと（`RankingApp` に全社ぶんの
   * 配列を渡す props を1つ足すだけで起きる）、予算を割ったことに気づけないまま
   * どのURLのHTMLにも同じ71KBが乗る。1ページ目に出ない会社の名前で数える。
   */
  test("31社目以降は HTML に入っていない", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toContain("ジャフコ　グループ株式会社"); // ページ2の先頭
  });

  /*
   * 取りに行くのは初回だけで、**操作では取り直さない。** 各 spec の「リクエスト数0」も
   * 同じことを見ているが、あちらは除外リストを通した後の数なので、`/data/*` を
   * うっかりそこへ足すと空文になる。ここではパスを名指しで数える。
   *
   * **回数を1で固定しない。** 開発サーバーの StrictMode は effect を2回走らせるので、
   * 初回のぶんは 1 とも 2 ともなる（2回目はブラウザのキャッシュに当たる）。
   */
  test("操作では全件データを取り直さない", async ({ page }) => {
    const hits: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/data/companies.json") hits.push(req.url());
    });

    await page.goto("/");
    await expect(page.locator(READY)).toHaveCount(1);
    const afterLoad = hits.length;
    expect(afterLoad).toBeGreaterThan(0);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page).toHaveURL(/[?&]age=25/);

    expect(hits).toHaveLength(afterLoad);
  });
});
