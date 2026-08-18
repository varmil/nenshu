import { test, expect } from "@playwright/test";

test.describe("計算方法ページ（/about）", () => {
  test("AC-10: ランキングから計算方法リンクをたどると、式・出典・対象範囲・限界が読める", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "計算方法" }).click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { name: "計算方法", level: 1 })).toBeVisible();

    // 式
    await expect(page.getByRole("heading", { name: "補正の式" })).toBeVisible();
    await expect(page.getByText("推定年収（目標年齢）＝ 平均年間給与 ×")).toBeVisible();

    // 出典
    await expect(page.getByRole("heading", { name: "出典", exact: true })).toBeVisible();
    await expect(page.getByText("令和5年賃金構造基本統計調査")).toBeVisible();
    await expect(page.getByRole("link", { name: /EDINET/ })).toBeVisible();

    // 対象範囲
    await expect(page.getByRole("heading", { name: "対象範囲" })).toBeVisible();
    await expect(page.getByText("1,867社")).toBeVisible();

    // 限界
    await expect(page.getByRole("heading", { name: "この方法の限界" })).toBeVisible();
    await expect(page.getByText("推定値であって実測ではありません")).toBeVisible();
  });

  test("AC-10: 年齢スイッチが同業種内の順位を動かさないことが書かれている", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: "年齢スイッチは同業種内の順位を動かしません" })
    ).toBeVisible();
    // 理由（目標年齢が式から約分で消えること）まで書かれている
    await expect(page.getByText("目標年齢が式から消えます")).toBeVisible();
  });

  test("若年側が過大に出るという限界が数値付きで書かれている", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByText("産業平均より大幅に高い会社ほど、若い側の推定が過大になります")
    ).toBeVisible();
    // 印象ではなく実データの数値で書かれている
    await expect(page.getByText("中央値1.22倍")).toBeVisible();
  });

  test("「本社のみ」バッジの意味が実例付きで書かれている", async ({ page }) => {
    await page.goto("/about");
    const table = page.getByRole("table");
    await expect(table).toContainText("株式会社みずほフィナンシャルグループ");
    await expect(table).toContainText("株式会社みずほ銀行");
    await expect(table).toContainText("本社のみ");
    // 表に出す金額（丸め後）と、本文が述べる差額が食い違わないこと。
    // 丸める前の差を取ると1万円ずれる（1,167万 − 870万 = 297万 だが 296.4万 → 296万）。
    await expect(table).toContainText("1,167万円");
    await expect(table).toContainText("870万円");
    await expect(page.getByText("297万円の差があります")).toBeVisible();
  });

  test("計算方法ページからランキングへ戻れる", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("link", { name: "← ランキングに戻る" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("table").locator("tbody tr").first()).toContainText(
      "株式会社キーエンス"
    );
  });

  test("SSR: 生HTTPリクエスト（JS実行なし）でも本文が返る", async ({ request }) => {
    const response = await request.get("/about");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("令和5年賃金構造基本統計調査");
    expect(html).toContain("目標年齢が式から消えます");
    expect(html).toContain("株式会社みずほ銀行");
  });
});
