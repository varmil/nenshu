import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { companyAnalysisFor, companyPageData } from "../features/company/lib/pageData";
import { buildHeadingRank } from "../features/company/lib/cardFacts";
import { statsForBasis } from "../features/company/lib/stats";
import { buildSummaryView } from "../features/company/lib/summary";
import { pickCompany, rowOf, summaries } from "../testing/realData";

/**
 * 会社の説明文（C7・Issue #161・親 #158、`docs/company/spec.md` AC-21〜AC-23）。
 *
 * **説明文のある会社と無い会社の両方を見る。** 片方だけだと「空の器を出さない」ことが
 * 通らない——出ていないものは、出す側のテストでは捕まらない。
 *
 * **どちらの会社もデータから選ぶ**（refresh の D0・Issue #870）。説明文の有無はその会社の次の
 * 有報と作り直しで変わるので、名指しすると前提が黙って崩れる。無い側は原文に事業の中身が
 * 無い会社で、spec（AC-20）が名指ししている ENEOS ホールディングスがその例。
 *
 * 他所にあるもの: JS 実行前の HTML に入っていること・1社ぶんだけであること（AC-21・AC-23）は
 * `company-page.spec.ts` の AC-10、表示基準で変わらないこと（AC-23）は同じく AC-3、
 * モバイルの横スクロールは `company-refresh.spec.ts` の AC-15、`/about` の作り方の節は
 * `company-page.spec.ts` の「/about に…」、出典の1行に決算期が入らないことは
 * `data-period.spec.ts`（企業詳細の決算期は各節の説明の先頭だけ）。
 */

/** 説明文のある会社。 */
const pickWithSummary = () =>
  pickCompany("説明文のある会社", ([id]) => buildSummaryView(summaries.byId[id]) !== null);

test.describe("会社の説明文", () => {
  test("AC-21: 説明文のある会社では h1 と順位行の直後に出る", async ({ page }) => {
    const { view, summary } = companyPageData(pickWithSummary());
    const rank = buildHeadingRank(view, statsForBasis(view, null));
    await page.goto(`/company/${view.id}`);

    await expect(
      page.getByRole("heading", { name: view.name, level: 1, exact: true })
    ).toBeVisible();
    // 順位行は業種と業界内順位だけ。全体順位・母数・上位◯%は添えない（運営者の指示）。
    await expect(page.getByText(rank, { exact: true })).toBeVisible();
    await expect(page.getByText(summary!.text, { exact: true })).toBeVisible();

    /*
     * **並び順を固定する**（AC-21「h1 と順位行の直後」）。位置を見ないと、
     * 節がページのどこか別の場所に出ていても通ってしまう。
     */
    const order = await page.evaluate(
      ([rankText, summaryText]) => {
        const h1 = document.querySelector("h1");
        const paragraphs = [...document.querySelectorAll("p")];
        const rank = paragraphs.find((p) => p.textContent === rankText);
        const summary = paragraphs.find((p) => p.textContent === summaryText);
        if (!h1 || !rank || !summary) return null;
        // Node.DOCUMENT_POSITION_FOLLOWING = 4
        return {
          rankAfterH1: Boolean(h1.compareDocumentPosition(rank) & 4),
          summaryAfterRank: Boolean(rank.compareDocumentPosition(summary) & 4),
        };
      },
      [rank, summary!.text]
    );
    expect(order).toEqual({ rankAfterH1: true, summaryAfterRank: true });
  });

  /**
   * **空の器・プレースホルダ・「準備中」を出さない**（AC-21）。ロゴを持たない会社で
   * 頭文字を出すのとは扱いが違う——文には代わりに置けるものが無い。
   * 「このページの出典」の「AIの要約」にも説明文を挙げない（AC-16。要約と分析のある会社を
   * 選ぶので、その行は要約だけになる）。
   */
  test("AC-21・AC-16: 説明文の無い会社では節ごと出ず、出典にも挙げない", async ({ page }) => {
    const id = pickCompany(
      "説明文が無く、要約と分析はある会社",
      ([id]) => buildSummaryView(summaries.byId[id]) === null && companyAnalysisFor(id) !== null
    );
    await page.goto(`/company/${id}`);

    await expect(
      page.getByRole("heading", { name: rowOf(id)[1], level: 1, exact: true })
    ).toBeVisible();
    await expect(page.getByText("をもとに要約", { exact: false })).toHaveCount(0);
    await expect(page.getByText("準備中", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "要約の作り方" })).toHaveCount(0);

    const digestRow = page
      .getByTestId("company-sources")
      .locator("dl > div", { has: page.locator("dt", { hasText: "AIの要約" }) });
    await expect(digestRow).not.toContainText("説明文");
    await expect(digestRow).toContainText("有価証券報告書の要約");
  });

  /**
   * **同じ断りを1画面に2回置かない**（AC-22。Issue #128 で「推定」について決めたのと
   * 同じ扱い）。下の「年収に関するQ&A」（C16 までは「有価証券報告書の実測値」）の節にこの文を
   * 重ねていない。
   */
  test("AC-22: 要約であることと出典が説明文の近くに1回だけ出て、/about へ導線がある", async ({
    page,
  }) => {
    await page.goto(`/company/${pickWithSummary()}`);

    await expect(
      page.getByText("有価証券報告書「事業の内容」をもとに要約", { exact: false })
    ).toBeVisible();
    await expect(page.getByText("をもとに要約", { exact: false })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "要約の作り方" })).toHaveAttribute(
      "href",
      "/about#company-summary"
    );
  });

  /**
   * **説明文の左端が画面幅で変わる**（アートボード 4b・2b。運営者の指摘 2026-08-27）。
   * PC は社名にそろえてロゴの右から、モバイルはロゴの下を全幅で使う。**同じ文を2つ
   * 書いて `hidden` で切り替えていないこと**の担保でもある——1つの要素が動く。
   */
  test("説明文の左端は PC では社名、モバイルではロゴにそろい、PC では行長が止まる", async ({
    page,
  }) => {
    const { view, summary } = companyPageData(pickWithSummary());
    const left = (p: Page, anchor: "h1" | "logo") =>
      p.evaluate(
        ([target, summaryText]) => {
          const summary = [...document.querySelectorAll("p")]
            .find((el) => el.textContent === summaryText)
            ?.getBoundingClientRect();
          const h1 = document.querySelector("h1");
          const ref =
            target === "h1"
              ? h1?.getBoundingClientRect()
              : h1?.closest(".grid")?.firstElementChild?.getBoundingClientRect();
          return summary && ref
            ? {
                left: Math.round(summary.left),
                refLeft: Math.round(ref.left),
                width: Math.round(summary.width),
              }
            : null;
        },
        [anchor, summary!.text]
      );

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/company/${view.id}`);
    const pc = await left(page, "h1");
    expect(pc?.left).toBe(pc?.refLeft);
    // `max-w-2xl`（672px）。本文カラムは 1,024px あり、いっぱいに流すと行が長すぎる。
    expect(pc?.width).toBe(672);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/company/${view.id}`);
    const mobile = await left(page, "logo");
    expect(mobile?.left).toBe(mobile?.refLeft);
  });
});
