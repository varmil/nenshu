import { test, expect } from "./appTest";

/**
 * 0件・端の状態とページ送り（U6・U17）。
 *
 * どのページ番号を並べるか（`getPaginationRange`）・件数表示の範囲（`pageRange`）・
 * 範囲外のページの丸め（`buildRankedCompanies`）は単体テストが持つ。ここで見るのは
 * 描かれた結果と、押したときに画面が届くこと。
 *
 * JS 実行前の HTML（`/?page=2`・範囲外の `page`）は `ranking-url-sync.spec.ts` の
 * SSR の表に、操作でネットワークが起きないことは同じファイルの流れにまとめてある。
 */
test.describe("0件・端の状態と段階表示", () => {
  test("AC-8: 0件のとき条件を緩める案内が出る（エラー表示にはならない）", async ({ page }) => {
    await page.goto("/?ind=鉱業");
    await page.getByRole("searchbox", { name: "会社名で検索" }).fill("存在しない社名");

    await expect(page.getByText("条件に一致する企業が見つかりませんでした")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  // Issue #103。100件から30件に減らした。件数表示・行数・総ページ数が同じ刻みで
  // 動いていること（どれか1つだけ100のまま残っていないこと）をここで固定する。
  test("1ページは30件で、件数表示と行数が一致し、最終ページは端数の21社になる", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);
    await expect(page.getByText("2,961社 中 1〜30社目")).toBeVisible();
    // 2,961 / 30 = 99ページ。末尾のページ番号がそのまま総ページ数になる。
    // `PaginationLink` は `<a role="button">` なので role は button で引く。
    await expect(page.getByRole("button", { name: "99", exact: true })).toBeVisible();

    await page.goto("/?page=99");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(21);
    await expect(page.getByText("2,961社 中 2,941〜2,961社目")).toBeVisible();
  });

  /*
   * Issue #96。ページ送りのボタンは表1ページぶん下にあるので、位置を保ったままだと
   * 入れ替わった行が視界に入らず「押しても何も起きていない」ように見える。
   */
  test("ページ送りを押すと次の30社に入れ替わり、URLに page=2 が出て、最上部へ戻る", async ({
    page,
  }) => {
    await page.goto("/");
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toContainText("ヒューリック株式会社");

    const next = page.getByRole("button", { name: "次のページへ" });
    await next.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await next.click();

    await expect(page).toHaveURL(/[?&]page=2/);
    // 既定は実測値なので、2ページ目の先頭は実測値の並びで31位（PAGE_SIZE + 1）の会社になる。
    await expect(firstRow).toContainText("ジャフコ　グループ株式会社");
    await expect(firstRow).not.toContainText("ヒューリック株式会社");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  // U17・Issue #813。前後1ページだった頃は、2ページ先へ移るのに2回押していた。
  // 並ぶ番号の規則そのもの（先頭・末尾での並び）は `lib/pagination.test.ts` が持つ。
  test("AC-17: 10ページ目では前後2ページ（8・9・11・12）へのボタンが並び、12を押すと移る", async ({
    page,
  }) => {
    await page.goto("/?page=10");
    await expect(page.getByText("2,961社 中 271〜300社目")).toBeVisible();

    const pageButton = (n: number) => page.getByRole("button", { name: String(n), exact: true });
    for (const n of [8, 9, 11, 12]) await expect(pageButton(n)).toBeVisible();
    // 前後3ページ目は並ばない（間は省略記号になる）
    await expect(pageButton(7)).toHaveCount(0);
    await expect(pageButton(13)).toHaveCount(0);

    await pageButton(12).click();

    await expect(page).toHaveURL(/[?&]page=12(&|$)/);
    await expect(page.getByText("2,961社 中 331〜360社目")).toBeVisible();
    await expect(pageButton(12)).toHaveAttribute("aria-current", "page");
  });

  test.describe("AC-17 モバイル", () => {
    test.use({ viewport: { width: 360, height: 800 } });

    /**
     * 並びは中央寄せなので、本文の幅を超えると**左右の両側へ**はみ出す。左へ出た
     * 「前へ」は画面の外になり、スクロールでも戻せない（`scrollWidth` は増えない）。
     * だから横スクロールの有無ではなく、並びの左右の端を本文の器と突き合わせる。
     *
     * 測るのは並びが一番長くなるページ（前後2ページの両側に省略記号が出る位置）。
     * 1ページ目や最終ページは短いので、見ても何も守らない。5 と 95 は隠すのが
     * 1ページだけの位置（数字にせず省略記号にしている）、10 はその間。
     */
    test("360px で並びが最も長くなるページ（5・10・95）でも本文の幅からはみ出さない", async ({
      page,
    }) => {
      for (const n of [5, 10, 95]) {
        await page.goto(`/?page=${n}`);

        const nav = page.getByRole("navigation", { name: "ページネーション", exact: true });
        const list = nav.locator("ul").first();
        // 前へ・数字7・省略記号2・次へ。これより短ければ最悪ケースを測れていない。
        await expect(list.locator(":scope > li"), `${n}ページ目の項目数`).toHaveCount(11);

        const navBox = (await nav.boundingBox())!;
        const listBox = (await list.boundingBox())!;
        expect(listBox.x, `${n}ページ目の左端`).toBeGreaterThanOrEqual(navBox.x);
        expect(listBox.x + listBox.width, `${n}ページ目の右端`).toBeLessThanOrEqual(
          navBox.x + navBox.width
        );

        // 押せる大きさは削っていない（数字の器は 32px のまま。CLAUDE.md）
        const current = page.getByRole("button", { name: String(n), exact: true });
        expect((await current.boundingBox())!.width, `${n}ページ目の番号の幅`).toBeGreaterThanOrEqual(32);

        // 並びは表の下にあるので、縦にスクロールしてから両端が丸ごと見えているかを見る
        await nav.scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: "前のページへ" })).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole("button", { name: "次のページへ" })).toBeInViewport({ ratio: 1 });
      }
    });
  });
});
