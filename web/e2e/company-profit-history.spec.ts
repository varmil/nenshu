import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";
import { history, performance, pickCompany, profitHistory } from "../testing/realData";
import { companyPageData } from "../features/company/lib/pageData";
import { buildProfitSummary, formatSignedManYen } from "../features/company/lib/profitHistory";

/**
 * P2（Issue #168）——企業詳細ページの「稼ぐ力の推移（過去10年間）」。
 * `docs/performance/spec.md` の AC-10・AC-11 に対応する。
 *
 * 値そのものは `build-data.test.ts` と `features/company/lib/profitHistory.test.ts`
 * が固定しているので、ここは**ブラウザでどう出るか**だけを見る。会社は名指しせず、
 * 「最新年がそろっている」「途中の年が欠けている」という状態でデータから選ぶ
 * （refresh の D0・Issue #870）。
 *
 * 他所にあるもの: 節が「平均年収推移」「在籍年数推移」の後ろにあること（AC-10）は `company-refresh.spec.ts` の
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
      list.map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")
      )
    );
}

/** 最新年の稼ぐ力・従業員数・経常利益がそろい、増減の1文が出る会社。 */
const LATEST = pickCompany("稼ぐ力の推移の最新年がそろった会社", ([id]) => {
  const profit = profitHistory.profit[id];
  return (
    profit?.at(-1) != null &&
    profitHistory.employees[id]?.at(-1) != null &&
    profitHistory.income[id]?.at(-1) != null &&
    profit.filter((v) => v !== null).length >= 2
  );
});

/**
 * 稼ぐ力が出ない会社（連結の経常利益が無い会社——IFRS・米国基準。Issue #911）。データからは
 * 「稼ぐ力の推移が無く、レーダーの稼ぐ力も無く、平均年収の推移は10年そろう」という状態で選ぶ。
 * 10年そろう条件は、推移が短くて稼ぐ力も出ない新しい会社（別の理由で無い）を外すため。
 */
const NO_PROFIT = pickCompany(
  "稼ぐ力が出ず、平均年収の推移は10年そろう会社",
  ([id], index) =>
    profitHistory.profit[id] === undefined &&
    performance.perEmployee[index] === null &&
    (history.byId[id] ?? []).filter((value) => value !== null).length >= 10
);

test.describe("Issue 911 稼ぐ力が出ない会社", () => {
  test("稼ぐ力の推移の節が節ごと出ず、レーダーの稼ぐ力は掲載なしで、出典にも稼ぐ力を挙げない", async ({
    page,
  }) => {
    await page.goto(`/company/${NO_PROFIT}`);

    // 節ごと出ない（見出しも、空の図や表も残さない）。ページごと消えているのではない
    await expect(page.getByRole("heading", { name: "稼ぐ力の推移（過去10年間）" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "平均年収推移（過去10年間）" })).toBeVisible();

    // レーダーの稼ぐ力の行は掲載なし
    const radarRow = page
      .getByRole("heading", { name: "公開資料による全体像" })
      .locator("xpath=..")
      .locator("dl > div")
      .filter({ has: page.locator("dt", { hasText: "稼ぐ力" }) });
    await expect(radarRow).toContainText("掲載なし");

    // 出典の一覧にも稼ぐ力を挙げない（ページに無い値を計算値として名乗らない）
    const sources = page.getByRole("heading", { name: "このページの出典" }).locator("xpath=..");
    await expect(sources).toBeVisible();
    await expect(sources).not.toContainText("稼ぐ力");
  });
});

test.describe("AC-10 稼ぐ力の推移", () => {
  test("図と4列の表と増減の1文が出て、分母の範囲が年収と違うことを断る", async ({ page }) => {
    const history = companyPageData(LATEST).profitHistory!;
    await page.goto(`/company/${LATEST}`);

    const figure = section(page).locator("figure");
    await expect(figure).toBeVisible();
    await expect(figure).toContainText(String(history.years[history.years.length - 1]));
    await expect(figure).toContainText("単位は万円");

    expect(await section(page).locator("thead th").allInnerTexts()).toEqual([
      "年度",
      "稼ぐ力",
      "従業員数",
      "経常利益",
    ]);
    const table = await rows(page);
    expect(table).toHaveLength(history.years.length);
    // 最新年の行に3つとも値が入る。経常利益は億円（万円だと8桁が並んで読めない）。
    const last = table[table.length - 1];
    expect(last[0]).toMatch(/^\d{4}年$/);
    expect(last[1]).toMatch(/^[−]?[\d,]+万円$/);
    expect(last[2]).toMatch(/^[\d,]+人$/);
    expect(last[3]).toMatch(/^[−]?[\d,.]+億円$/);

    // 上の節は「提出会社単体」。ここは連結で、パート・アルバイトを含まない。
    await expect(section(page)).toContainText("連結の経常利益 ÷ 連結の従業員数");
    await expect(section(page)).toContainText("パート・アルバイトは従業員数に含まれません");
    await expect(section(page)).toContainText(buildProfitSummary(history)!);
  });

  // 途中の年だけが欠ける会社（前後の年には値がある）。欠けた年も行を残す。
  test("値の無い年は行ごと落とさず「データなし」と出す", async ({ page }) => {
    const id = pickCompany("稼ぐ力の推移の途中の年が欠けている会社", ([id]) => {
      const profit = profitHistory.profit[id] ?? [];
      const present = profit.flatMap((v, i) => (v === null ? [] : [i]));
      return profit.some((v, i) => v === null && i > present[0] && i < present[present.length - 1]);
    });
    const history = companyPageData(id).profitHistory!;
    await page.goto(`/company/${id}`);
    const byYear = new Map((await rows(page)).map((row) => [row[0], row]));
    expect(byYear.size).toBe(history.years.length);
    for (const [i, year] of history.years.entries()) {
      const value = history.profit[i];
      expect(byYear.get(`${year}年`)![1], String(year)).toBe(
        value === null ? "データなし" : formatSignedManYen(value)
      );
    }
  });
});
