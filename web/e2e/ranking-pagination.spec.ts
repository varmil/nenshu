import { test, expect } from "./rankingTest";
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
