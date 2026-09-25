import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";

/**
 * P2（Issue #168）——企業詳細ページの「稼ぐ力の推移（過去10年間）」。
 * `docs/performance/spec.md` の AC-10・AC-11 に対応する。
 *
 * 値そのものは `build-data.test.ts` と `features/company/lib/profitHistory.test.ts`
 * が固定しているので、ここは**ブラウザでどう出るか**だけを見る。
 *
 * 他所にあるもの: 節が「平均年収推移」の直後にあること（AC-10）は `company-refresh.spec.ts` の
 * 「節の並び」、表示基準と独立であること（AC-11）は `company-page.spec.ts` の AC-3、
 * JS 実行前の HTML に入っていることは同じく AC-10、モバイルの横スクロールは
 * `company-refresh.spec.ts` の AC-15。
 */

const section = (page: Page) =>
  page.getByRole("heading", { name: "稼ぐ力の推移（過去10年間）" }).locator("xpath=..");

/** 表の各行を「年 / 稼ぐ力 / 従業員数 / 経常利益」の4セルで読む。 */
async function rows(page: Page): Promise<string[][]> {
  return section(page)
    .locator("tbody tr")
    .evaluateAll((list) =>
      list.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""))
    );
}

test.describe("AC-10 稼ぐ力の推移", () => {
  test("図と4列の表と増減の1文が出て、分母の範囲が年収と違うことを断る", async ({ page }) => {
    await page.goto("/company/6861");

    const figure = section(page).locator("figure");
    await expect(figure).toBeVisible();
    await expect(figure).toContainText("2026");
    await expect(figure).toContainText("単位は万円");

    expect(await section(page).locator("thead th").allInnerTexts()).toEqual([
      "年度",
      "稼ぐ力",
      "従業員数",
      "経常利益",
    ]);
    const table = await rows(page);
    expect(table).toHaveLength(10);
    // 最新年の行に3つとも値が入る。経常利益は億円（万円だと8桁が並んで読めない）。
    const last = table[table.length - 1];
    expect(last[0]).toMatch(/^\d{4}年$/);
    expect(last[1]).toMatch(/^[−]?[\d,]+万円$/);
    expect(last[2]).toMatch(/^[\d,]+人$/);
    expect(last[3]).toMatch(/^[−]?[\d,.]+億円$/);

    // 上の節は「提出会社単体」。ここは連結で、パート・アルバイトを含まない。
    await expect(section(page)).toContainText("連結の経常利益 ÷ 連結の従業員数");
    await expect(section(page)).toContainText("パート・アルバイトは従業員数に含まれません");
    await expect(section(page)).toContainText(/\d+年で[＋−±][\d,]+万円/);
  });

  // 2117 は2023・2024年の稼ぐ力を持たない（平均年収の推移も同じ2年が欠ける）。
  test("値の無い年は行ごと落とさず「データなし」と出す", async ({ page }) => {
    await page.goto("/company/2117");
    const byYear = new Map((await rows(page)).map((row) => [row[0], row]));
    expect(byYear.size).toBe(10);
    expect(byYear.get("2023年")![1]).toBe("データなし");
    expect(byYear.get("2024年")![1]).toBe("データなし");
    expect(byYear.get("2025年")![1]).toMatch(/万円$/);
  });
});
