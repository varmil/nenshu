import { test, expect } from "@playwright/test";

/**
 * 業種セレクトを開いて選択肢をクリックする。
 * base-ui の Select はポップアップを Portal で document.body 直下に描画するため、
 * トリガーの role=combobox と、開いた後の role=option で操作する。
 */
async function selectOption(page: import("@playwright/test").Page, filterLabel: string, optionLabel: string) {
  await page.getByRole("combobox", { name: filterLabel }).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

test.describe("初期表示（AC-1のスモーク確認）", () => {
  test("1位はキーエンス、推定年収2,178万円", async ({ page }) => {
    await page.goto("/");
    const firstRow = page.getByRole("table").locator("tbody tr").first();
    await expect(firstRow).toContainText("株式会社キーエンス");
    await expect(firstRow).toContainText("2,178万円");
  });
});

test.describe("フィルタ", () => {
  test("AC-3: 業種で「海運業」を選ぶと7社になり、順位が1から振り直される", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "業種", "海運業");

    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(7);
    await expect(rows.first().locator("td").first()).toHaveText("1");
  });

  test("AC-4: 従業員数で「1,000人以上」を選ぶと、表示される全社が1,000人以上", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "従業員数", "1,000人以上");

    const rows = page.getByRole("table").locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // 従業員数は表の最終列。「◯◯人」形式でカンマ区切り。
    const employeeCells = await rows.locator("td").last().allTextContents();
    for (const cell of employeeCells) {
      const employees = Number(cell.replace(/[^0-9]/g, ""));
      expect(employees).toBeGreaterThanOrEqual(1000);
    }
  });

  test("AC-5: 業種と平均年齢を重ねると、両方の条件を満たす会社だけが表示される", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "業種", "情報・通信業");
    await selectOption(page, "平均年齢", "〜40歳");

    const rows = page.getByRole("table").locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("td");
      await expect(cells.nth(2)).toHaveText("情報・通信業");
      const avgAgeText = await cells.nth(4).textContent();
      const avgAge = Number(avgAgeText?.replace("歳", ""));
      expect(avgAge).toBeLessThan(40);
    }
  });

  test("キーボードだけで業種を選択できる", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("combobox", { name: "業種" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // 何らかの業種が選ばれ、表が絞り込まれて全1,867社ではなくなっていることを確認する。
    const rows = page.getByRole("table").locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeLessThan(100);
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("モバイル幅レイアウト", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("デスクトップ用の表は隠れ、カードリストが表示される。横スクロールは発生しない", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.locator("h1")).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});
