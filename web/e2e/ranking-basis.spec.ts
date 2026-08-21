import { test, expect } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * 表示基準（実測値 / 年齢そろえ）の切替。ADR-0007。
 *
 * 既定は実測値で、URL に `age` が無い状態がそれを表す。`docs/ranking/spec.md`
 * AC-1・AC-2・AC-9・AC-11。数値は 2026-06 版データの実測値。
 */
test.describe("表示基準の切替", () => {
  test("AC-1: クエリ無しの / は有報の実測値そのままで並ぶ", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "平均年収ランキング", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // 列見出しは「平均年収（有報）」で、「推定」の語を含まない。
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "平均年収（有報）" })).toBeVisible();

    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toContainText("株式会社キーエンス");
    await expect(firstRow).toContainText("2,178万円");
  });

  test("AC-9: 実測値では「推定」の語が画面に出ない", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("推定年収（35歳）")).toHaveCount(0);
    // 同じ文言が表の caption（PC）とカード一覧の注記（モバイル）の両方にある。
    await expect(
      page.getByText("有価証券報告書の平均年間給与（提出会社単体）そのままです", { exact: false }).first()
    ).toBeVisible();
  });

  // 実測値では平均年齢の高い会社が上位に来る。これが「年齢そろえ」を用意する理由。
  test("AC-2: 年齢そろえに切り替えると35歳の推定に変わり、並びも変わる", async ({ page }) => {
    await page.goto("/");
    const table = page.getByRole("table");
    const rawOrder = await table.locator("tbody tr td:nth-child(2)").allInnerTexts();

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByRole("heading", { name: "35歳年収ランキング", level: 1 })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /推定年収（35歳）/ })).toBeVisible();

    const ageOrder = await table.locator("tbody tr td:nth-child(2)").allInnerTexts();
    expect(ageOrder).not.toEqual(rawOrder);
  });

  test("AC-2: 年齢そろえで25歳を選ぶとキーエンスが788万円になる", async ({ page }) => {
    await page.goto("/?age=35");
    await page.getByRole("button", { name: "25歳" }).click();

    await expect(page).toHaveURL(/[?&]age=25/);
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toContainText("株式会社キーエンス");
    await expect(firstRow).toContainText("788万円");
  });

  // 消すと「年齢そろえ」で何が使えるようになるかが分からなくなるので、
  // 無効にしたうえで表示は残す（ADR-0007）。
  test("AC-11: 実測値では年齢スイッチが無効だが表示は残る", async ({ page }) => {
    await page.goto("/");

    const age45 = page.getByRole("button", { name: "45歳" });
    await expect(age45).toBeVisible();
    await expect(age45).toBeDisabled();

    await age45.click({ force: true });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "平均年収ランキング", level: 1 })).toBeVisible();
  });

  test("AC-11: 年齢そろえにすると年齢スイッチが有効になる", async ({ page }) => {
    await page.goto("/?age=35");
    await expect(page.getByRole("button", { name: "45歳" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "年齢そろえ" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("AC-7: /?ind=銀行業（ageなし）は実測値のまま銀行業82社になる", async ({ page }) => {
    await page.goto("/?ind=銀行業");

    await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText("銀行業");
    // 1ページはPAGE_SIZE=30件（Issue #103）なので、82社であることは件数表示で見る。
    await expect(page.getByText("82社 中 1〜30社目")).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);
  });

  // 生のHTTPレスポンス＝クローラーが見るHTML。既定が実測値になっていることを
  // ハイドレーション前の段階で固定する。
  test("SSR: JS実行前のHTMLが既に実測値で並んでいる", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("平均年収ランキング");
    expect(html).toContain("平均年収（有報）");
    expect(html).not.toContain("35歳時点の推定年収");
  });

  test("切替でネットワークリクエストが発生しない", async ({ page }) => {
    await page.goto("/");

    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    await page.getByRole("button", { name: "実測値" }).click();
    await expect(page).toHaveURL(/\/$/);

    expect(requests).toHaveLength(0);
  });

  test("モバイル幅でも切替できて横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");

    // モバイルでは表（`hidden md:block`）ではなく行の一覧が出る。
    // U13 でカードの枠を外したので、行は `md:hidden` の一覧の中の div になった。
    // **実測値では行に注記を付けない**（アートボード 5c）。年齢そろえのときだけ
    // 「推定」の一語が出る（年齢は見出しと帯に出ているので行には書かない）。
    const firstRow = page.locator("div.md\\:hidden > div").first();
    await expect(firstRow).toContainText("2,178万円");
    await expect(firstRow).not.toContainText("推定");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(firstRow).toContainText("推定");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
