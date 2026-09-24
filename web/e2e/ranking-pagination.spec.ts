import { test, expect } from "./appTest";
import { collectPageRequests, waitForRankingReady } from "./network";

test.describe("0件・端の状態と段階表示", () => {
  test("AC-8: 0件のとき条件を緩める案内が出る（エラー表示にはならない）", async ({ page }) => {
    await page.goto("/?ind=鉱業");
    await page.getByRole("searchbox", { name: "会社名で検索" }).fill("存在しない社名");

    await expect(page.getByText("条件に一致する企業が見つかりませんでした")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  // Issue #103。100件から30件に減らした。件数表示・行数・総ページ数が同じ刻みで
  // 動いていること（どれか1つだけ100のまま残っていないこと）をここで固定する。
  test("1ページは30件で、件数表示と行数が一致する", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);
    await expect(page.getByText("2,961社 中 1〜30社目")).toBeVisible();
    // 2,961 / 30 = 99ページ。末尾のページ番号がそのまま総ページ数になる。
    // `PaginationLink` は `<a role="button">` なので role は button で引く。
    await expect(page.getByRole("button", { name: "99", exact: true })).toBeVisible();
  });

  test("最終ページは端数の21社で、件数表示も2,941〜2,961社目になる", async ({ page }) => {
    await page.goto("/?page=99");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(21);
    await expect(page.getByText("2,961社 中 2,941〜2,961社目")).toBeVisible();
  });

  test("ページ送りをクリックすると内容が変わり、URLにpage=2が反映される", async ({ page }) => {
    await page.goto("/");
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toContainText("ヒューリック株式会社");

    await page.getByRole("button", { name: "次のページへ" }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    // 既定は実測値なので、2ページ目の先頭は実測値の並びで31位（PAGE_SIZE + 1）の会社になる。
    await expect(firstRow).toContainText("ジャフコ　グループ株式会社");
    await expect(firstRow).not.toContainText("ヒューリック株式会社");
  });

  // Issue #96。ページ送りのボタンは表1ページぶん下にあるので、位置を保ったままだと
  // 入れ替わった行が視界に入らず「押しても何も起きていない」ように見える。
  test("ページ送りを押すとページ最上部までスクロールが戻る", async ({ page }) => {
    await page.goto("/");

    const next = page.getByRole("button", { name: "次のページへ" });
    await next.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await next.click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("フィルタを変更するとpageが1に戻る", async ({ page }) => {
    await page.goto("/?page=2");
    await expect(page).toHaveURL(/[?&]page=2/);

    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();

    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  test("ページ送り操作中にネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");

    await waitForRankingReady(page);
    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "次のページへ" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);

    expect(requests).toHaveLength(0);
  });

  // U17・Issue #813。前後1ページだった頃は、2ページ先へ移るのに2回押していた。
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

    await waitForRankingReady(page);
    const requests = collectPageRequests(page);

    await pageButton(12).click();

    await expect(page).toHaveURL(/[?&]page=12(&|$)/);
    await expect(page.getByText("2,961社 中 331〜360社目")).toBeVisible();
    await expect(pageButton(12)).toHaveAttribute("aria-current", "page");
    expect(requests).toHaveLength(0);
  });

  test("AC-17: 1ページ目では2・3ページへ、最終ページでは97・98ページへのボタンが並ぶ", async ({
    page,
  }) => {
    const pageButton = (n: number) => page.getByRole("button", { name: String(n), exact: true });

    await page.goto("/");
    for (const n of [1, 2, 3, 99]) await expect(pageButton(n)).toBeVisible();
    await expect(pageButton(4)).toHaveCount(0);

    await page.goto("/?page=99");
    for (const n of [1, 97, 98, 99]) await expect(pageButton(n)).toBeVisible();
    await expect(pageButton(96)).toHaveCount(0);
  });

  test.describe("AC-17 モバイル", () => {
    test.use({ viewport: { width: 360, height: 800 } });

    /**
     * 並びは中央寄せなので、本文の幅を超えると**左右の両側へ**はみ出す。左へ出た
     * 「前へ」は画面の外になり、スクロールでも戻せない（`scrollWidth` は増えない）。
     * だから横スクロールの有無ではなく、並びの左右の端を本文の器と突き合わせる。
     *
     * 測るのは並びが一番長くなるページ（前後2ページの両側に省略記号が出る位置）。
     * 1ページ目や最終ページは短いので、見ても何も守らない。
     */
    for (const n of [5, 10, 95]) {
      test(`360px で ${n}ページ目の並びが本文の幅からはみ出さない`, async ({ page }) => {
        await page.goto(`/?page=${n}`);

        const nav = page.getByRole("navigation", { name: "ページネーション", exact: true });
        const list = nav.locator("ul").first();
        await expect(list.locator(":scope > li")).toHaveCount(11); // 前へ・数字7・省略記号2・次へ

        const navBox = await nav.boundingBox();
        const listBox = await list.boundingBox();
        expect(navBox).not.toBeNull();
        expect(listBox).not.toBeNull();
        expect(listBox!.x).toBeGreaterThanOrEqual(navBox!.x);
        expect(listBox!.x + listBox!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width);

        // 押せる大きさは削っていない（数字の器は 32px のまま）
        const current = page.getByRole("button", { name: String(n), exact: true });
        expect((await current.boundingBox())!.width).toBeGreaterThanOrEqual(32);

        // 並びは表の下にあるので、縦にスクロールしてから両端が丸ごと見えているかを見る
        await nav.scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: "前のページへ" })).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole("button", { name: "次のページへ" })).toBeInViewport({ ratio: 1 });
      });
    }
  });

  test("SSR: 生HTTPリクエスト（JS実行なし）でも/?page=2のレスポンスHTMLがページ2の内容になっている", async ({
    request,
  }) => {
    const response = await request.get("/?page=2");
    expect(response.status()).toBe(200);
    const html = await response.text();

    const tableHtml = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(tableHtml).toContain("ジャフコ　グループ株式会社");
    expect(tableHtml).not.toContain("ヒューリック株式会社");
  });

  test("範囲外のpageは最終ページにクランプされる（クラッシュしない）", async ({ request }) => {
    const response = await request.get("/?page=999999");
    expect(response.status()).toBe(200);
    const html = await response.text();

    const tableHtml = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(tableHtml).toContain("株式会社ＷＯＬＶＥＳ　ＨＡＮＤ");
  });
});
