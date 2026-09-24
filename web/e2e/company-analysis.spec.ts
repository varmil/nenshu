import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { collectPageRequests } from "./network";

/**
 * 有報の要約と AI 分析（C10・Issue #242・親 #214、`docs/company/spec.md` 1.19・AC-28〜AC-30、
 * アートボード 8a / 8b / 8c）。
 *
 * 参照した資料が**無い**会社にキーエンス（6861）、**ある**会社に三井物産（8031）を使う
 * （アートボード 8b・8c と同じ）。**要約・分析の無い会社は実データに存在しない**（全2,961社が
 * 両方を持つ）ので、AC-28 の「出さない」は `lib/analysis.test.ts` の純関数で固定している。
 */

const analysis = (page: Page) => page.getByTestId("company-analysis");
const digest = (page: Page) => page.getByTestId("company-digest");

const KEYENCE_HEADLINE = "成長の重心はすでに海外にあり、国内より海外で人と投資が増えていく会社である。";
const KEYENCE_DIGEST_START = "当期には、製造現場向けの3Dプリンタ";

test.describe("有報の要約と AI 分析", () => {
  test("AC-29: 2つが別の節として、決めた位置に出る", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンスの現状と今後", level: 2 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "株式会社キーエンスの有価証券報告書の要約", level: 2 })
    ).toBeVisible();

    /*
     * **並びを固定する**（アートボード 8a / 8b）。分析は平均年収カードの直後（＝残業・有給の
     * 節の前）、要約は稼ぐ力の推移の後ろ・この数字の作り方の前。位置を見ないと、ページの
     * どこに出ていても通ってしまう。
     */
    const headings = await page.locator("h2").allTextContents();
    const at = (text: string) => headings.findIndex((h) => h.startsWith(text));
    expect(at("公開資料による全体像")).toBeLessThan(at("株式会社キーエンスの現状と今後"));
    expect(at("株式会社キーエンスの現状と今後")).toBe(at("残業・有給・男女の賃金の差異") - 1);
    expect(at("稼ぐ力の推移")).toBe(at("株式会社キーエンスの有価証券報告書の要約") - 1);
    expect(at("株式会社キーエンスの有価証券報告書の要約")).toBe(at("この数字の作り方") - 1);

    // 分析は平均年収カードより後ろ（カードには見出しが無いので金額で位置を取る）。
    const cardY = (await page.getByText("平均年収（有価証券報告書・単体）").boundingBox())!.y;
    const analysisY = (await analysis(page).boundingBox())!.y;
    expect(analysisY).toBeGreaterThan(cardY);
  });

  test("AC-29: AI の評価だという断りは分析の節にだけあり、1画面に1回", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(analysis(page)).toContainText("AIが書いた評価です");
    await expect(analysis(page).getByText("ひとことで言うと")).toBeVisible();
    await expect(analysis(page)).toContainText(KEYENCE_HEADLINE);

    await expect(digest(page)).not.toContainText("AI");
    await expect(digest(page)).toContainText(KEYENCE_DIGEST_START);
    await expect(page.getByText("AIが書いた評価", { exact: false })).toHaveCount(1);

    // 要約の節の説明は、上の説明文（C7）の出典「〜をもとに要約」と別の言い方にしてある。
    await expect(digest(page)).not.toContainText("をもとに要約");
  });

  test("AC-29: 分析の節は muted の面で囲い、要約の節は地のまま", async ({ page }) => {
    await page.goto("/company/6861");
    const bg = (locator: ReturnType<typeof analysis>) =>
      locator.evaluate((el) => getComputedStyle(el).backgroundColor);
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    expect(await bg(analysis(page))).not.toBe(body);
    expect(await bg(analysis(page))).not.toBe("rgba(0, 0, 0, 0)");
    expect(await bg(digest(page))).toBe("rgba(0, 0, 0, 0)");
  });

  test("AC-29: 作り方への導線が /about の節に飛ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    const link = analysis(page).getByRole("link", { name: "要約と分析の作り方" });
    await expect(link).toHaveAttribute("href", "/about#company-analysis");

    await page.goto("/about#company-analysis");
    await expect(page.getByRole("heading", { name: "要約と分析の作り方" })).toBeVisible();
    await expect(page.locator("#company-analysis")).toContainText("具体的な数値");
  });

  test("AC-29: 参照した資料が分析の近くに並び、元の文書へ辿れる", async ({ page }) => {
    await page.goto("/company/8031");

    const sources = analysis(page).getByRole("heading", { name: "参照した資料", level: 3 });
    await expect(sources).toBeVisible();
    const link = analysis(page).getByRole("link", { name: /Rhodes Ridge鉄鉱石事業/ });
    await expect(link).toHaveAttribute("href", "https://www.mitsui.com/jp/ja/release/2025/1250896_14873.html");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "nofollow noopener");
    await expect(analysis(page)).toContainText("www.mitsui.com・2026年9月8日に参照");
  });

  test("AC-29: 参照した資料が無い会社では見出しごと出ない", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(analysis(page)).toBeVisible();
    await expect(page.getByText("参照した資料")).toHaveCount(0);
  });

  test("一言が本文の書き出しに繰り返されない（伊藤忠）", async ({ page }) => {
    await page.goto("/company/8001");
    // 一言の書き出し。本文では「川下」、一言では『川下』と括弧だけ違っていた。
    await expect(analysis(page).getByText(/川下.で稼ぐ路線を貫き/)).toHaveCount(1);
  });

  test("AC-29: JS 実行前の HTML に要約と分析が入っていて、props には入っていない", async ({ request }) => {
    const html = await (await request.get("/company/6861")).text();

    /*
     * **1回ずつしか出ない**——2節は島の props を通さず、名前付きスロットで静的な HTML として
     * 差し込んでいる（`features/company/lib/analysis.ts`）。props に入れると HTML の属性にも
     * 同じ文章が入り、2回になる。
     */
    const count = (text: string) => html.split(text).length - 1;
    expect(count(KEYENCE_HEADLINE)).toBe(1);
    expect(count(KEYENCE_DIGEST_START)).toBe(1);
  });

  test("AC-30: 表示基準と年齢を切り替えても変わらず、ページ遷移も起きない", async ({ page }) => {
    await page.goto("/company/6861");
    const beforeAnalysis = await analysis(page).textContent();
    const beforeDigest = await digest(page).textContent();

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    await page.getByRole("button", { name: "60歳" }).click();
    await expect(page.getByRole("button", { name: "60歳" })).toHaveAttribute("aria-pressed", "true");

    expect(requests).toHaveLength(0);
    expect(await analysis(page).textContent()).toBe(beforeAnalysis);
    expect(await digest(page).textContent()).toBe(beforeDigest);
    expect(page.url()).toContain("/company/6861");
  });

  test("AC-30: HTML に入っているのはその会社の1社ぶんだけで、/ には入らない", async ({ request }) => {
    const company = await (await request.get("/company/6861")).text();
    // 三井物産の一言が混じっていない。
    expect(company).not.toContain("資源への大型投資を積み増しながら");
    expect(company.split("の現状と今後").length - 1).toBe(1);

    const top = await (await request.get("/")).text();
    expect(top).not.toContain(KEYENCE_HEADLINE);
    expect(top).not.toContain("の現状と今後");
  });

  test("390px で横スクロールが出ない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/8031");
    await expect(analysis(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
