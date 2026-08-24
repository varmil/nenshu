import { test, expect, type Page } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * P2（Issue #168）——企業詳細ページの「稼ぐ力の推移（過去10年間）」。
 * `docs/performance/spec.md` の AC-10・AC-11 に対応する。
 *
 * 値そのものは `build-data.test.ts` と `features/company/lib/profitHistory.test.ts`
 * が固定しているので、ここは**ブラウザでどう出るか**だけを見る。
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
  test("節が「平均年収推移」の直後にある", async ({ page }) => {
    await page.goto("/company/6861");
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    const salary = headings.indexOf("平均年収推移（過去10年間）");
    const profit = headings.indexOf("稼ぐ力の推移（過去10年間）");
    expect(salary).toBeGreaterThanOrEqual(0);
    expect(profit).toBe(salary + 1);
  });

  test("表に 年度・稼ぐ力・従業員数・経常利益 の4列が並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    const headers = await section(page).locator("thead th").allInnerTexts();
    expect(headers).toEqual(["年度", "稼ぐ力", "従業員数", "経常利益"]);
  });

  test("最新年の行に3つとも値が入る", async ({ page }) => {
    await page.goto("/company/6861");
    const table = await rows(page);
    const last = table[table.length - 1];
    expect(last[0]).toMatch(/^\d{4}年$/);
    expect(last[1]).toMatch(/^[−]?[\d,]+万円$/);
    expect(last[2]).toMatch(/^[\d,]+人$/);
    expect(last[3]).toMatch(/^[−]?[\d,.]+億円$/);
  });

  test("値の無い年は行ごと落とさず「データなし」と出す", async ({ page }) => {
    await page.goto("/company/6861");
    const table = await rows(page);
    // 年の列はすべての行にある（欠測でも行は残る）。
    for (const row of table) expect(row[0]).toMatch(/^\d{4}年$/);
    // 稼ぐ力が無い年は「データなし」。空文字にはしない。
    for (const row of table) {
      expect(row[1] === "データなし" || /万円$/.test(row[1])).toBe(true);
    }
  });

  test("チャートの棒と年ラベルが出る", async ({ page }) => {
    await page.goto("/company/6861");
    const figure = section(page).locator("figure");
    await expect(figure).toBeVisible();
    await expect(figure).toContainText("2026");
    await expect(figure).toContainText("単位は万円");
  });

  test("分母の範囲が年収と違うことを断る", async ({ page }) => {
    await page.goto("/company/6861");
    // 上の節は「提出会社単体」。ここは連結で、パート・アルバイトを含まない。
    await expect(section(page)).toContainText("連結の経常利益 ÷ 連結の従業員数");
    await expect(section(page)).toContainText("パート・アルバイトは従業員数に含まれません");
  });

  test("増減の1文が図と表の後ろに出る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(section(page)).toContainText(/\d+年で[＋−±][\d,]+万円/);
  });
});

test.describe("AC-11 表示基準と独立", () => {
  test("年齢そろえに切り替えても値が変わらず、ページ遷移も起きない", async ({ page }) => {
    // ハイドレーションを待つ（値は SSR の HTML で満たされるため）。
    await page.goto("/company/6861", { waitUntil: "networkidle" });
    const before = await rows(page);

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();

    expect(await rows(page)).toEqual(before);
    expect(requests).toHaveLength(0);
  });
});

test.describe("レイアウトと初期HTML", () => {
  test("390px で横スクロールが出ない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/company/6861");
    await expect(section(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("JS実行前のHTMLに表の値が入っている", async ({ request }) => {
    const html = await (await request.get("/company/6861")).text();
    expect(html).toContain("稼ぐ力の推移（過去10年間）");
    expect(html).toContain("経常利益");
    expect(html).toContain("億円");
  });
});
