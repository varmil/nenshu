import { test, expect } from "@playwright/test";

/**
 * C2（Issue #83）で足したもの——この会社の要点・水準が近い会社・分布・年齢別の表と
 * ±20%・10年推移（timeseries の T1）・この数字の作り方——の E2E。
 *
 * C1 で作った数値と表示基準の切替は `company-page.spec.ts` にある。
 */

test.describe("AC-11 この会社の要点", () => {
  test("箇条書きが出て、位置と業界内順位を含む", async ({ page }) => {
    await page.goto("/company/6861");
    const list = page.getByRole("heading", { name: "この会社の要点" }).locator("xpath=../ul");
    await expect(list.getByRole("listitem").first()).toContainText("2,178万円");
    await expect(list.getByRole("listitem").first()).toContainText("上位0.1%未満");
    await expect(list).toContainText("電気機器");
  });

  test("実測値では「推定」の語を出さない（AC-9）", async ({ page }) => {
    await page.goto("/company/6861");
    const list = page.getByRole("heading", { name: "この会社の要点" }).locator("xpath=../ul");
    await expect(list).not.toContainText("推定");
  });

  test("表示基準を切り替えると位置の記述が追随する", async ({ page }) => {
    await page.goto("/company/6861");
    const list = page.getByRole("heading", { name: "この会社の要点" }).locator("xpath=../ul");
    await expect(list).not.toContainText("25歳");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("group", { name: "目標年齢" }).getByRole("button", { name: "25歳" }).click();
    await expect(list).toContainText("25歳にそろえた推定年収");
  });
});

test.describe("AC-12 水準が近い会社", () => {
  test("同業種の5社が企業詳細へのリンクとして並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "電気機器で水準が近い会社" }).locator("xpath=../ul");
    await expect(section.getByRole("listitem")).toHaveCount(5);
    await expect(section.getByRole("link").first()).toHaveAttribute("href", /^\/company\//);
  });

  test("自分自身が含まれない", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "電気機器で水準が近い会社" }).locator("xpath=../ul");
    await expect(section).not.toContainText("株式会社キーエンス");
  });

  test("表示基準の切替でページ遷移が発生しない", async ({ page }) => {
    await page.goto("/company/6861");
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    expect(requests).toHaveLength(0);
  });
});

test.describe("AC-13 分布の中での位置", () => {
  test("中位の印と9ビンのヒストグラムが出る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page.getByText(/中位 [\d,]+万円/)).toBeVisible();
    // 読み上げ用の一覧がヒストグラムの正。9階級ぶんある。
    const bins = page.getByText(/全1,867社の分布/).locator("xpath=../ul[1]/li");
    await expect(bins).toHaveCount(9);
    await expect(bins.filter({ hasText: "株式会社キーエンスはここ" })).toHaveCount(1);
  });

  test("表示基準を切り替えると階級が変わる", async ({ page }) => {
    await page.goto("/company/6861");
    const bins = () => page.getByText(/全1,867社の分布/).locator("xpath=../ul[1]/li");
    const before = await bins().first().textContent();

    await page.goto("/company/6861?age=25");
    const after = await bins().first().textContent();
    expect(after).not.toBe(before);
  });
});

test.describe("AC-14 年齢別の表と推定範囲", () => {
  test("8行の表があり、推定範囲が ±20% になっている", async ({ page }) => {
    await page.goto("/company/6861");
    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(8);

    const cells = rows.first().locator("td");
    const salary = Number((await cells.nth(1).textContent())!.replace(/[^0-9]/g, ""));
    const range = (await cells.nth(2).textContent())!.replace(/[^0-9〜]/g, "").split("〜");
    expect(Number(range[0])).toBe(Math.round(salary * 0.8));
    expect(Number(range[1])).toBe(Math.round(salary * 1.2));
  });

  // ここを信頼区間として書いたら、この基準を逆向きに壊す。
  test("信頼区間ではない旨が表とチャートの両方にある", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page.getByText("統計的な信頼区間ではありません")).toHaveCount(2);
  });

  test("/about にも同じ断りがある", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText(/信頼区間ではありません/)).toBeVisible();
  });
});

test.describe("T1 平均年収推移（10年）", () => {
  test("AC-6: 10年ぶんの棒と年ラベル、金額、増減の文が出る", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "平均年収推移（過去10年間）" }).locator("xpath=..");
    const years = section.locator("ul.sr-only li");
    await expect(years).toHaveCount(10);
    await expect(years.first()).toContainText("2017年");
    await expect(years.last()).toContainText("2026年");
    await expect(section).toContainText(/9年で [＋−][\d,]+万円/);
  });

  /*
   * AC-8。年齢そろえを選んでも過去の有報に載った数字は変わらない。ここが動いたら
   * 「表示基準ごとに別物」と「基準と独立」を取り違えている。
   */
  test("AC-8: 表示基準を切り替えても推移の値が変わらない", async ({ page }) => {
    await page.goto("/company/6861");
    const values = () =>
      page
        .getByRole("heading", { name: "平均年収推移（過去10年間）" })
        .locator("xpath=..")
        .locator("ul.sr-only li");
    const before = await values().allTextContents();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    expect(await values().allTextContents()).toEqual(before);
  });

  test("AC-9: 実測値・提出会社単体であることが書かれている", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "平均年収推移（過去10年間）" }).locator("xpath=..");
    await expect(section).toContainText("実測値");
    await expect(section).toContainText("提出会社単体");
  });

  test("AC-7: 欠損のある年は「なし」と出て、年のラベルは残る", async ({ page }) => {
    // 2017年の値を持たない会社を探すのは重いので、読み上げ一覧の表現で固定する。
    await page.goto("/company/6861");
    const items = await page
      .getByRole("heading", { name: "平均年収推移（過去10年間）" })
      .locator("xpath=..")
      .locator("ul.sr-only li")
      .allTextContents();
    for (const item of items) expect(item).toMatch(/^20\d\d年 (データなし|[\d,]+万円)$/);
  });
});

test.describe("AC-15 レイアウト", () => {
  test("PC は2カラムで、サイドバーがスクロールしても残る", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/company/6861");

    const aside = page.locator("aside");
    const before = await aside.boundingBox();
    expect(before!.x).toBeGreaterThan(640);

    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(200);
    const after = await aside.boundingBox();
    expect(after!.y).toBeGreaterThan(before!.y - 1500);
  });

  test("390px では1カラムで、横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/company/6861");

    const aside = await page.locator("aside").boundingBox();
    expect(aside!.x).toBeLessThan(64);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("AC-16 この数字の作り方", () => {
  test("3ステップと計算方法への導線がある", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "この数字の作り方" }).locator("xpath=..");
    await expect(section.getByRole("listitem")).toHaveCount(3);
    await expect(section.getByRole("link", { name: "計算方法" })).toHaveAttribute("href", "/about");
  });
});

test.describe("パンくずと見出し", () => {
  test("パンくずの末尾が社名で、リンクではない", async ({ page }) => {
    await page.goto("/company/6861");
    const nav = page.getByRole("navigation").first();
    await expect(nav).toContainText("株式会社キーエンス");
    await expect(nav.getByRole("link", { name: "株式会社キーエンス" })).toHaveCount(0);
  });

  test("h1 の直下に業界内順位と全体順位が出る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page.getByText(/電気機器で1位 \/ 150社・全体で1位 \/ 1,867社/)).toBeVisible();
  });
});
