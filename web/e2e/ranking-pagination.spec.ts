import { test, expect } from "@playwright/test";

test.describe("0件・端の状態と段階表示", () => {
  test("AC-8: 0件のとき条件を緩める案内が出る（エラー表示にはならない）", async ({ page }) => {
    await page.goto("/?ind=鉱業");
    await page.getByRole("searchbox", { name: "会社名で検索" }).fill("存在しない社名");

    await expect(page.getByText("条件に一致する企業が見つかりませんでした")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("ページ送りをクリックすると内容が変わり、URLにpage=2が反映される", async ({ page }) => {
    await page.goto("/");
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toContainText("株式会社キーエンス");

    await page.getByRole("button", { name: "次のページへ" }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(firstRow).toContainText("岩谷産業株式会社");
    await expect(firstRow).not.toContainText("株式会社キーエンス");
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

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

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
    expect(tableHtml).toContain("岩谷産業株式会社");
    expect(tableHtml).not.toContain("株式会社キーエンス");
  });

  test("範囲外のpageは最終ページにクランプされる（クラッシュしない）", async ({ request }) => {
    const response = await request.get("/?page=999999");
    expect(response.status()).toBe(200);
    const html = await response.text();

    const tableHtml = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(tableHtml).toContain("オーケー株式会社");
  });
});
