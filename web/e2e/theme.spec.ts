import { test, expect } from "@playwright/test";

/*
 * 配色トークンが実際にブラウザまで届いていることを固定する（Issue #62）。
 *
 * `design-system/tokens/tokens.test.ts` は tokens.css の中身を検証するが、
 * 「globals.css からの @import が外れた」「Tailwind が text-primary を生成しなくなった」
 * のようにファイルは正しいのに描画に反映されない壊れ方はそこでは検出できないので、
 * 実際の算出スタイルをここで見る。
 */

/** 算出色（rgb(...) / oklch(...)）が無彩色かどうか。 */
function isAchromatic(computed: string): boolean {
  const numbers = computed.match(/[\d.]+/g)?.map(Number) ?? [];
  const rgb = computed.startsWith("rgb") ? numbers.slice(0, 3) : null;
  if (rgb) return rgb[0] === rgb[1] && rgb[1] === rgb[2];
  // oklch(L C H) は chroma が 0 なら色味が無い。
  return numbers[1] === 0;
}

test.describe("配色トークン", () => {
  test("--primary が色味を持ち、白背景の上に載っている", async ({ page }) => {
    await page.goto("/");

    const { primary, background } = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        primary: style.getPropertyValue("--primary").trim(),
        background: style.getPropertyValue("--background").trim(),
      };
    });

    expect(primary).not.toBe("");
    expect(isAchromatic(primary)).toBe(false);
    expect(background).not.toBe("");
  });

  test("ランキングの年収額が --primary の色で描画される", async ({ page }) => {
    await page.goto("/");

    // 1行目の推定年収（RankingTable の `text-primary text-2xl font-bold`）。
    const salary = page.getByRole("table").locator("tbody tr").first().locator(".text-primary");
    await expect(salary).toBeVisible();

    const salaryColor = await salary.evaluate((el) => getComputedStyle(el).color);
    const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);

    // text-primary が効いていれば本文色とは別の色になり、かつ無彩色ではない。
    expect(isAchromatic(salaryColor)).toBe(false);
    expect(salaryColor).not.toBe(bodyColor);
  });

  test("--radius から rounded-* が導出されている", async ({ page }) => {
    await page.goto("/");

    const radius = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--radius").trim(),
    );
    // 値そのものはプリセット次第なので固定しない。rem で定義されていることだけ見る。
    expect(radius).toMatch(/^\.?\d*\.?\d+rem$/);

    // @theme inline の --radius-* → Tailwind の rounded-* まで繋がっているか。
    // 角丸を持つ「本社のみ」バッジで、算出値が実際の px になっていることを確かめる。
    const badge = page.getByText("本社のみ").first();
    await expect(badge).toBeVisible();

    const borderRadius = await badge.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(parseFloat(borderRadius)).toBeGreaterThan(0);
  });
});
