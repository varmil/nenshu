import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";

/**
 * 有報への直リンク（C13・Issue #814、`docs/company/spec.md` 1.20・AC-31）。
 *
 * 実測値の4項目の表の下辺に、その会社の有報——4項目を取った書類そのもの——を EDINET で開く
 * 帯を付ける（Claude Design の案 D）。**リンク先は書類ごとの閲覧ページ**で、EDINET のトップではない。
 */

// キーエンスの平均年間給与を取った書類（`ranking_unified_2026.csv` の `doc_id`）。
// 年1回のデータ更新で変わる（同じ spec の金額と同じ扱い）。
const KEYENCE_DOC_URL = "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100YAHE,,";

const filing = (page: Page) => page.getByTestId("company-filing");
const actuals = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: /^有価証券報告書の実測値/ }) });

test.describe("AC-31 有報への直リンク", () => {
  test("4項目の表の下辺に、その会社の書類を別タブで開く帯がある", async ({ page }) => {
    await page.goto("/company/6861");

    // 帯全体が1つのリンク。押せる範囲を広げるため（spec 1.20）。
    await expect(filing(page)).toHaveAttribute("href", KEYENCE_DOC_URL);
    await expect(filing(page)).toHaveAttribute("target", "_blank");
    await expect(filing(page)).toContainText("この会社の有価証券報告書");
    await expect(filing(page)).toContainText("EDINETで開く");
    // 決算期は真上の見出しが持っている（企業詳細は2か所まで・S3）。
    await expect(filing(page)).not.toContainText(/\d{4}年\d{1,2}月期/);

    // 表とつながって見える——帯の上辺が表の下辺に接し、左右がそろう。
    const grid = (await actuals(page).locator("dl").boundingBox())!;
    const bar = (await filing(page).boundingBox())!;
    expect(Math.abs(bar.y - (grid.y + grid.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.x - grid.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.width - grid.width)).toBeLessThanOrEqual(1);
  });

  test("JS 実行前の HTML にあり、/ には書類 ID が無い", async ({ request }) => {
    const company = await (await request.get("/company/6861")).text();
    expect(company).toContain(KEYENCE_DOC_URL);
    expect(company).toContain("この会社の有価証券報告書");

    // 書類 ID は企業詳細だけが読む（トップページの HTML を増やさない）。
    const top = await (await request.get("/")).text();
    expect(top).not.toContain("S100YAHE");
    expect(top).not.toContain("WZEK0040");
  });

  test("390px でも1行に収まり、押せる高さが 44px ある", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/6861");
    const bar = (await filing(page).boundingBox())!;
    expect(bar.height).toBeGreaterThanOrEqual(44);
    // 1行＝左右の2つの文字の上端がそろっている。折れると右側が下の行に落ちる。
    const [left, right] = await filing(page).evaluate((el) =>
      [...el.children].map((c) => Math.round(c.getBoundingClientRect().top))
    );
    expect(Math.abs(left - right)).toBeLessThanOrEqual(4);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("「このページの出典」の実測値の行も同じ書類へのリンクになっている", async ({ page }) => {
    await page.goto("/company/6861");
    const row = page
      .getByTestId("company-sources")
      .locator("dl > div", { has: page.locator("dt", { hasText: "実測値" }) });
    await expect(row.getByRole("link", { name: "有価証券報告書" })).toHaveAttribute(
      "href",
      KEYENCE_DOC_URL
    );
  });
});
