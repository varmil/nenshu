import { test, expect } from "@playwright/test";

test.describe("URLクエリとの同期", () => {
  test("SSR: 生HTTPリクエスト（JS実行なし）でも/?age=45&ind=銀行業のレスポンスHTMLが絞り込み済みになっている", async ({
    request,
  }) => {
    // ブラウザ・JSを介さない生のHTTPリクエスト。検索エンジンのクローラーが取得する
    // HTMLと同じものを見る。SSR化前（output:'export'）はここが常にビルド時の
    // 初期値（絞り込みなし）になっており、この検証自体が原理的に不可能だった
    // （`docs/ranking/ssr-migration/design.md`参照）。
    const response = await request.get("/?age=45&ind=%E9%8A%80%E8%A1%8C%E6%A5%AD");
    expect(response.status()).toBe(200);
    const html = await response.text();

    // companies.json全件がハイドレーション用データとして<script>内にも埋め込まれる
    // ため、単純な会社名の文字列検索では実際に描画された<table>の中身かどうかを
    // 区別できない。<table>...</table>内のtbody行数（見た目に表示される内容）だけを
    // 数える。AC-7どおり銀行業は82社。
    const tableHtml = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    const rowCount = (tableHtml.match(/<tr/g) ?? []).length - 1; // theadの1行を除く
    expect(rowCount).toBe(82);
  });

  test("AC-7: /?age=45&ind=銀行業 を直接開くと、45歳・銀行業82社の状態で復元される", async ({ page }) => {
    await page.goto("/?age=45&ind=銀行業");

    await expect(page.getByRole("button", { name: "45歳" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("銀行業");

    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(82);
  });

  test("初期状態（何も操作しない）のURLは / のまま", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
  });

  // 既定は実測値で年齢スイッチは無効なので、まず「年齢そろえ」に切り替える（ADR-0007）。
  test("フィルタを操作するとURLにクエリが反映される", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);
  });

  test("ブラウザの戻るを押すと一つ前の絞り込み状態に戻る", async ({ page }) => {
    await page.goto("/?age=35");

    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page).toHaveURL(/[?&]age=45/);

    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    await expect(page).toHaveURL(/[?&]ind=/);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=45/);
    await expect(page).not.toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("button", { name: "45歳" })).toHaveAttribute("aria-pressed", "true");

    await page.goBack();
    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByRole("button", { name: "35歳" })).toHaveAttribute("aria-pressed", "true");
  });

  // 実測値 ⇄ 年齢そろえ の切替も履歴に積まれる。
  test("年齢そろえに切り替えたあと戻ると実測値に戻る", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "45歳" })).toBeDisabled();
  });

  test("フィルタ操作中にネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/?age=35");

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.getByRole("button", { name: "実測値" }).click();
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "45歳" }).click();
    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();

    expect(requests).toHaveLength(0);
  });

  test("並び順は操作した順序に関係なく常に同じクエリ文字列になる（カノニカル化）", async ({ page }) => {
    await page.goto("/?age=35");
    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    await page.getByRole("button", { name: "45歳" }).click();
    const urlA = new URL(page.url()).search;

    await page.goto("/?age=35");
    await page.getByRole("button", { name: "45歳" }).click();
    await page.getByRole("combobox", { name: "業種" }).click();
    await page.getByRole("option", { name: "海運業", exact: true }).click();
    const urlB = new URL(page.url()).search;

    expect(urlA).toBe(urlB);
  });
});
