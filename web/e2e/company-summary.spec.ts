import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";

/**
 * 会社の説明文（C7・Issue #161・親 #158、`docs/company/spec.md` AC-21〜AC-23）。
 *
 * **説明文のある会社と無い会社の両方を見る。** 片方だけだと「空の器を出さない」ことが
 * 通らない——出ていないものは、出す側のテストでは捕まらない。
 *
 * 無い側に **ENEOSホールディングス（5020）** を使う。原文は417字あるが中身は当期の
 * 異動の説明だけで、事業の内訳は画像の事業系統図にある——**空が正しいと spec が
 * 名指ししている会社**（AC-20）。C16（#840）までは東京海上ホールディングス（8766）を
 * 使っていたが、あちらは原文の事業の中身が1文あり、1文を認めた時点で説明文が付いた。
 *
 * 他所にあるもの: JS 実行前の HTML に入っていること・1社ぶんだけであること（AC-21・AC-23）は
 * `company-page.spec.ts` の AC-10、表示基準で変わらないこと（AC-23）は同じく AC-3、
 * モバイルの横スクロールは `company-refresh.spec.ts` の AC-15、`/about` の作り方の節は
 * `company-page.spec.ts` の「/about に…」、出典の1行に決算期が入らないことは
 * `data-period.spec.ts`（企業詳細の決算期は2か所だけ）。
 */

const SUMMARY_START = "電子応用機器の開発、製造及び販売を主な事業とする。";

test.describe("会社の説明文", () => {
  test("AC-21: 説明文のある会社では h1 と順位行の直後に出る", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
    // 順位行はモックの言い回し。上位◯%は添えない（運営者の指示）。
    await expect(page.getByText("電気機器 ・業界193社中1位 ・全体2,961社中3位")).toBeVisible();
    await expect(page.getByText(SUMMARY_START)).toBeVisible();

    /*
     * **並び順を固定する**（AC-21「h1 と順位行の直後」）。位置を見ないと、
     * 節がページのどこか別の場所に出ていても通ってしまう。
     */
    const order = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const rank = [...document.querySelectorAll("p")].find((p) => p.textContent?.includes("社中"));
      const summary = [...document.querySelectorAll("p")].find((p) =>
        p.textContent?.startsWith("電子応用機器")
      );
      if (!h1 || !rank || !summary) return null;
      // Node.DOCUMENT_POSITION_FOLLOWING = 4
      return {
        rankAfterH1: Boolean(h1.compareDocumentPosition(rank) & 4),
        summaryAfterRank: Boolean(rank.compareDocumentPosition(summary) & 4),
      };
    });
    expect(order).toEqual({ rankAfterH1: true, summaryAfterRank: true });
  });

  /**
   * **空の器・プレースホルダ・「準備中」を出さない**（AC-21）。ロゴを持たない会社で
   * 頭文字を出すのとは扱いが違う——文には代わりに置けるものが無い。
   * 「このページの出典」の「AIの要約」にも説明文を挙げない（AC-16。要約と分析は
   * 全社にあるので、その行は要約だけになる）。
   */
  test("AC-21・AC-16: 説明文の無い会社では節ごと出ず、出典にも挙げない", async ({ page }) => {
    await page.goto("/company/5020");

    await expect(
      page.getByRole("heading", { name: "ＥＮＥＯＳホールディングス株式会社", level: 1 })
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
   * 同じ扱い）。下の「有価証券報告書の実測値」の節にこの文を重ねていない。
   */
  test("AC-22: 要約であることと出典が説明文の近くに1回だけ出て、/about へ導線がある", async ({
    page,
  }) => {
    await page.goto("/company/6861");

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
    const left = (p: Page, anchor: "h1" | "logo") =>
      p.evaluate((target) => {
        const summary = [...document.querySelectorAll("p")]
          .find((el) => el.textContent?.includes("電子応用機器"))
          ?.getBoundingClientRect();
        const h1 = document.querySelector("h1");
        const ref =
          target === "h1"
            ? h1?.getBoundingClientRect()
            : h1?.closest(".grid")?.firstElementChild?.getBoundingClientRect();
        return summary && ref
          ? { left: Math.round(summary.left), refLeft: Math.round(ref.left), width: Math.round(summary.width) }
          : null;
      }, anchor);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");
    const pc = await left(page, "h1");
    expect(pc?.left).toBe(pc?.refLeft);
    // `max-w-2xl`（672px）。本文カラムは 1,024px あり、いっぱいに流すと行が長すぎる。
    expect(pc?.width).toBe(672);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/6861");
    const mobile = await left(page, "logo");
    expect(mobile?.left).toBe(mobile?.refLeft);
  });
});
