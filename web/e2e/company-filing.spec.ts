import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";
import { companyFilingDocId } from "../features/company/lib/pageData";
import { edinetDocumentUrl } from "../lib/data/sources";

/**
 * 有報への直リンク（C13・Issue #814、`docs/company/spec.md` 1.20・AC-31）。
 *
 * 実測値の4項目の下辺に、その会社の有報——4項目を取った書類そのもの——を EDINET で開く
 * 帯を付ける（Claude Design の案 D）。**リンク先は書類ごとの閲覧ページ**で、EDINET のトップではない。
 * C16（#838）で4項目を Q&A に作り替えたので、帯はいま Q&A の4問の枠の下辺に付いている。
 *
 * JS 実行前の HTML にあり `/` には書類 ID が無いことは `company-page.spec.ts` の AC-10、
 * 文書の横スクロールは `company-refresh.spec.ts` の AC-15 が見ている。
 */

const filing = (page: Page) => page.getByTestId("company-filing");
// 4問の枠。帯はこの下辺に付く（C16 までは4セルの表の下辺だった）。
const qaList = (page: Page) => page.getByTestId("company-qa-list");

test.describe("AC-31 有報への直リンク", () => {
  test("Q&A の4問の枠の下辺に、その会社の書類を別タブで開く帯があり、出典の実測値の行も同じ書類を指す", async ({
    page,
  }) => {
    // 平均年間給与を取った書類（`filings.json`）。書類 ID は有報を出し直すたびに変わるので、
    // データから引く（refresh の D0・Issue #870）。
    const docUrl = edinetDocumentUrl(companyFilingDocId("6861"));
    await page.goto("/company/6861");

    // 帯全体が1つのリンク。押せる範囲を広げるため（spec 1.20）。
    await expect(filing(page)).toHaveAttribute("href", docUrl);
    await expect(filing(page)).toHaveAttribute("target", "_blank");
    await expect(filing(page)).toContainText("この会社の有価証券報告書");
    await expect(filing(page)).toContainText("EDINETで開く");
    // 決算期は同じ節の Q&A の説明が持っている（企業詳細は2か所まで・S3）。
    await expect(filing(page)).not.toContainText(/\d{4}年\d{1,2}月期/);

    // 4問の枠とつながって見える——帯の上辺が枠の下辺に接し、左右がそろう。
    const grid = (await qaList(page).boundingBox())!;
    const bar = (await filing(page).boundingBox())!;
    expect(Math.abs(bar.y - (grid.y + grid.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.x - grid.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.width - grid.width)).toBeLessThanOrEqual(1);

    // 「このページの出典」の実測値の行の「有価証券報告書」も同じ書類へ（C12 の時点ではトップだった）。
    const row = page
      .getByTestId("company-sources")
      .locator("dl > div", { has: page.locator("dt", { hasText: "実測値" }) });
    await expect(row.getByRole("link", { name: "有価証券報告書" })).toHaveAttribute("href", docUrl);
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
  });
});
