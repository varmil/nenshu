import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";

/**
 * 有報の要約と AI 分析（C10・Issue #242・親 #214、`docs/company/spec.md` 1.19・AC-28〜AC-30、
 * アートボード 8a / 8b / 8c）。
 *
 * 参照した資料が**無い**会社にキーエンス（6861）、**ある**会社に三井物産（8031）を使う
 * （アートボード 8b・8c と同じ）。**要約・分析の無い会社は実データに存在しない**（全2,961社が
 * 両方を持つ）ので、AC-28 の「出さない」は `lib/analysis.test.ts` の純関数で固定している。
 * 一言が本文の書き出しに繰り返されないこと（取り込み時の `dropRepeatedHeadline`）も同じく
 * `lib/analysis.test.ts` が全社で見ている。
 *
 * 他所にあるもの: 節の位置（分析はカードの直後、要約は稼ぐ力の推移の後ろ）は
 * `company-refresh.spec.ts` の「節の並び」、表示基準で変わらないこと（AC-30）は
 * `company-page.spec.ts` の AC-3、`/` の HTML に入らないこと（AC-30）は同じく AC-10、
 * `/about` の作り方の節は同じく「/about に…」、モバイルの横スクロールは
 * `company-refresh.spec.ts` の AC-15。
 */

const analysis = (page: Page) => page.getByTestId("company-analysis");
const digest = (page: Page) => page.getByTestId("company-digest");

const KEYENCE_HEADLINE = "成長の重心はすでに海外にあり、国内より海外で人と投資が増えていく会社である。";
const KEYENCE_DIGEST_START = "当期には、製造現場向けの3Dプリンタ";

test.describe("有報の要約と AI 分析", () => {
  /*
   * **読者が2つを見分けられること**（AC-29）。分析だけに「AIが書いた評価」の断りと
   * **書いた年月**を1回置き、`bg-muted` の面で囲う。要約には面も断りも付けない
   * （付けると2つの区別が消える）。**年月は `analyses.json` から引く**——文言を書き写すと、
   * データを作り直した年にテストだけが古い年月で落ちる。
   */
  test("AC-29: 2つが別の節で、AI の評価だという断りと書いた年月は分析にだけ1回あり、分析だけが面を持つ", async ({
    page,
    request,
  }) => {
    const analyses = await (await request.get("/data/analyses.json")).json();
    const [y, m] = (analyses.byId["6861"].generatedAt as string).split("-").map(Number);

    await page.goto("/company/6861");

    await expect(
      analysis(page).getByRole("heading", { name: "株式会社キーエンスの現状と今後", level: 2 })
    ).toBeVisible();
    await expect(
      digest(page).getByRole("heading", { name: "株式会社キーエンスの有価証券報告書の要約", level: 2 })
    ).toBeVisible();

    await expect(analysis(page)).toContainText(`AIが書いた評価です（${y}年${m}月時点）`);
    await expect(analysis(page).getByText("ひとことで言うと")).toBeVisible();
    await expect(analysis(page)).toContainText(KEYENCE_HEADLINE);
    await expect(page.getByText("AIが書いた評価", { exact: false })).toHaveCount(1);

    await expect(digest(page)).toContainText(KEYENCE_DIGEST_START);
    await expect(digest(page)).not.toContainText("AI");
    await expect(digest(page)).not.toContainText("時点");
    // 要約の節の説明は、上の説明文（C7）の出典「〜をもとに要約」と別の言い方にしてある。
    await expect(digest(page)).not.toContainText("をもとに要約");

    const bg = (locator: ReturnType<typeof analysis>) =>
      locator.evaluate((el) => getComputedStyle(el).backgroundColor);
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg(analysis(page))).not.toBe(body);
    expect(await bg(analysis(page))).not.toBe("rgba(0, 0, 0, 0)");
    expect(await bg(digest(page))).toBe("rgba(0, 0, 0, 0)");

    await expect(analysis(page).getByRole("link", { name: "要約と分析の作り方" })).toHaveAttribute(
      "href",
      "/about#company-analysis"
    );
  });

  /*
   * 有報の外の文書を材料にしたら、参照した URL を分析の近くに並べる（AC-29・ADR-0015 決定4）。
   * 読者が開いて確かめられることが、材料を有報の外へ広げてよい前提になる。資料が無い会社では
   * 見出しごと出さない。
   */
  test("AC-29: 参照した資料が分析の近くに並んで元の文書へ辿れ、資料の無い会社では見出しごと出ない", async ({
    page,
  }) => {
    await page.goto("/company/8031");

    await expect(analysis(page).getByRole("heading", { name: "参照した資料", level: 3 })).toBeVisible();
    const link = analysis(page).getByRole("link", { name: /Rhodes Ridge鉄鉱石事業/ });
    await expect(link).toHaveAttribute("href", "https://www.mitsui.com/jp/ja/release/2025/1250896_14873.html");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "nofollow noopener");
    await expect(analysis(page)).toContainText("www.mitsui.com・2026年9月8日に参照");

    await page.goto("/company/6861");
    await expect(analysis(page)).toBeVisible();
    await expect(page.getByText("参照した資料")).toHaveCount(0);
  });

  test("AC-29・AC-30: JS 実行前の HTML に要約と分析が1回ずつだけ入り（props には入っていない）、他社のぶんは入らない", async ({
    request,
  }) => {
    const html = await (await request.get("/company/6861")).text();

    /*
     * **1回ずつしか出ない**——2節は島の props を通さず、名前付きスロットで静的な HTML として
     * 差し込んでいる（`features/company/lib/analysis.ts`）。props に入れると HTML の属性にも
     * 同じ文章が入り、2回になる。
     */
    const count = (text: string) => html.split(text).length - 1;
    expect(count(KEYENCE_HEADLINE)).toBe(1);
    expect(count(KEYENCE_DIGEST_START)).toBe(1);
    expect(count("の現状と今後")).toBe(1);
    // 三井物産の一言が混じっていない。
    expect(html).not.toContain("資源への大型投資を積み増しながら");
  });
});
