import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { companyAnalysisFor } from "../features/company/lib/pageData";
import { analysisNote } from "../features/company/lib/analysis";
import { pickCompany, rowOf } from "../testing/realData";

/**
 * 有報の要約と AI 分析（C10・Issue #242・親 #214、`docs/company/spec.md` 1.19・AC-28〜AC-30、
 * アートボード 8a / 8b / 8c）。
 *
 * 参照した資料が**無い**会社と**ある**会社を、どちらもデータから選ぶ（アートボード 8b・8c の
 * 2通り。refresh の D0・Issue #870）。文言はデータから組み、書き写さない——分析は作り直すたびに
 * 変わる。**要約・分析の無い会社を実データで選べるとは限らない**（2026-09 時点では全社が両方を
 * 持つ）ので、AC-28 の「出さない」は `lib/analysis.test.ts` の純関数で固定している。
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

/** HTML に書くと文字参照に置き換わる文字。生の HTML で文を数えるので、これを含む文は選ばない。 */
const ESCAPED_IN_HTML = /[&<>"']/;

/**
 * 参照した資料の無い会社。要約の節に AI の断り・時点・説明文の出典の言い方が無いことを見るので、
 * 要約の本文そのものにその語がある会社は選ばない（本文の語を断りと取り違える）。
 */
const pickWithoutSources = () =>
  pickCompany("参照した資料の無い会社", ([id]) => {
    const view = companyAnalysisFor(id);
    return (
      view !== null &&
      view.sources.length === 0 &&
      !ESCAPED_IN_HTML.test(view.headline + view.digest) &&
      !/AI|時点|をもとに要約/.test(view.digest)
    );
  });

const pickWithSources = () =>
  pickCompany("参照した資料のある会社", ([id]) => {
    const view = companyAnalysisFor(id);
    return view !== null && view.sources.length > 0 && !ESCAPED_IN_HTML.test(view.headline);
  });

test.describe("有報の要約と AI 分析", () => {
  /*
   * **読者が2つを見分けられること**（AC-29）。分析だけに「AIが書いた評価」の断りを1回置き、
   * `bg-muted` の面で囲う。要約には面も断りも付けない（付けると2つの区別が消える）。断りの先頭は
   * **原文の決算期**（2026-10-10 から。書いた年月は出さない）。**決算期はデータ（`analyses.json` の
   * `filing`）から引く**——文言を書き写すと、その会社の次の有報でテストだけが古い期で落ちる。
   */
  test("AC-29: 2つが別の節で、AI の評価だという断りは分析にだけ1回あり、分析だけが面を持つ", async ({
    page,
  }) => {
    const id = pickWithoutSources();
    const view = companyAnalysisFor(id)!;
    const name = rowOf(id)[1];
    await page.goto(`/company/${id}`);

    await expect(
      analysis(page).getByRole("heading", { name: `${name}の現状と今後`, level: 2 })
    ).toBeVisible();
    await expect(
      digest(page).getByRole("heading", {
        name: `${name}の有価証券報告書の要約`,
        level: 2,
      })
    ).toBeVisible();

    await expect(analysis(page)).toContainText(analysisNote(view.fiscalPeriod));
    await expect(analysis(page)).not.toContainText("時点");
    await expect(analysis(page).getByText("ひとことで言うと")).toBeVisible();
    await expect(analysis(page)).toContainText(view.headline);
    await expect(page.getByText("AIが書いた評価", { exact: false })).toHaveCount(1);

    await expect(digest(page)).toContainText(view.digest);
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
    const id = pickWithSources();
    const [first] = companyAnalysisFor(id)!.sources;
    await page.goto(`/company/${id}`);

    await expect(
      analysis(page).getByRole("heading", { name: "参照した資料", level: 3 })
    ).toBeVisible();
    const link = analysis(page).getByRole("link", { name: first.title, exact: true }).first();
    await expect(link).toHaveAttribute("href", first.url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "nofollow noopener");
    // ドメインと参照した日（`sourceMeta`）。
    await expect(analysis(page)).toContainText(first.meta);

    await page.goto(`/company/${pickWithoutSources()}`);
    await expect(analysis(page)).toBeVisible();
    await expect(page.getByText("参照した資料")).toHaveCount(0);
  });

  test("AC-29・AC-30: JS 実行前の HTML に要約と分析が1回ずつだけ入り（props には入っていない）、他社のぶんは入らない", async ({
    request,
  }) => {
    const id = pickWithoutSources();
    const view = companyAnalysisFor(id)!;
    const html = await (await request.get(`/company/${id}`)).text();

    /*
     * **1回ずつしか出ない**——2節は島の props を通さず、名前付きスロットで静的な HTML として
     * 差し込んでいる（`features/company/lib/analysis.ts`）。props に入れると HTML の属性にも
     * 同じ文章が入り、2回になる。
     */
    const count = (text: string) => html.split(text).length - 1;
    expect(count(view.headline)).toBe(1);
    expect(count(view.digest)).toBe(1);
    expect(count("の現状と今後")).toBe(1);
    // 別の会社の一言が混じっていない。
    expect(html).not.toContain(companyAnalysisFor(pickWithSources())!.headline);
  });
});
