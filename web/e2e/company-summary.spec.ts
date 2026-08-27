import { test, expect } from "./appTest";
import { collectPageRequests } from "./network";

/**
 * 会社の説明文（C7・Issue #161・親 #158、`docs/company/spec.md` AC-21〜AC-23）。
 *
 * **説明文のある会社と無い会社の両方を見る。** 片方だけだと「空の器を出さない」ことが
 * 通らない——出ていないものは、出す側のテストでは捕まらない。
 *
 * 無い側に **東京海上ホールディングス（8766）** を使う。C7 の目視レビューで型⑪
 * （有報の記載作法をそのまま書く）に落ち、**原文の事業の中身が1文ぶんしかないので
 * 空が正しい**と判定した会社で、`docs/company/company-summary/design.md` に記録がある。
 */

/** 説明文の本文（出典の1行は別の段落なので含まない）。 */
const summaryText = (page: import("@playwright/test").Page) =>
  page.getByText("電子応用機器の開発、製造及び販売を主な事業とする。", { exact: false });

test.describe("会社の説明文", () => {
  test("AC-21: 説明文のある会社では h1 と順位行の直後に出る", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByRole("heading", { name: "株式会社キーエンス", level: 1 })).toBeVisible();
    await expect(summaryText(page)).toBeVisible();

    /*
     * **並び順を固定する**（AC-21「h1 と順位行の直後」）。位置を見ないと、
     * 節がページのどこか別の場所に出ていても通ってしまう。
     */
    const order = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const rank = [...document.querySelectorAll("p")].find((p) =>
        p.textContent?.includes("社中")
      );
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
   */
  test("AC-21: 説明文の無い会社では節ごと出ない", async ({ page }) => {
    await page.goto("/company/8766");

    await expect(
      page.getByRole("heading", { name: "東京海上ホールディングス株式会社", level: 1 })
    ).toBeVisible();
    await expect(page.getByText("をもとに要約", { exact: false })).toHaveCount(0);
    await expect(page.getByText("準備中", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "要約の作り方" })).toHaveCount(0);
  });

  test("AC-21: JS実行前のHTMLに説明文が入っている", async ({ request }) => {
    const response = await request.get("/company/6861");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("電子応用機器の開発、製造及び販売を主な事業とする。");
  });

  test("AC-22: 要約であることと出典が説明文の近くに出て、/about へ導線がある", async ({
    page,
  }) => {
    await page.goto("/company/6861");

    await expect(
      page.getByText("有価証券報告書「事業の内容」をもとに要約", { exact: false })
    ).toBeVisible();
    /*
     * **この1行に決算期を書かない**（S3・Issue #134）。同じ画面の
     * 「有価証券報告書の実測値（2026年3月期）」の見出しと重なり、決算期が
     * 1画面に2回出る。`e2e/data-period.spec.ts` がその重複を数えている。
     */
    await expect(page.getByText("事業の内容」（2026年3月期）", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "要約の作り方" })).toHaveAttribute(
      "href",
      "/about#company-summary"
    );
  });

  /**
   * **同じ断りを1画面に2回置かない**（AC-22。Issue #128 で「推定」について決めたのと
   * 同じ扱い）。下の「有価証券報告書の実測値」の節にこの文を重ねていない。
   */
  test("AC-22: 要約の断りは1画面に1回だけ", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(page.getByText("をもとに要約", { exact: false })).toHaveCount(1);
  });

  /**
   * **表示基準にも年齢にも依らない**（AC-23）。説明文は事業の記述で、金額の話ではない
   * ——10年推移（T1）・働きやすさ（W1）と同じ扱いにしてある。
   */
  test("AC-23: 表示基準と年齢を切り替えても説明文は変わらず、ページ遷移も起きない", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const before = await summaryText(page).textContent();

    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    await page.getByRole("button", { name: "60歳" }).click();
    await expect(page.getByRole("button", { name: "60歳" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    expect(requests).toHaveLength(0);
    expect(await summaryText(page).textContent()).toBe(before);
    expect(page.url()).toContain("/company/6861");
  });

  /**
   * **クライアントに渡すのは当該1社ぶんだけ**（AC-23）。`summaries.json` は 2,783社ぶん
   * （gzip 261.8KB）あり、丸ごと props に載せるとページの予算を超える。
   */
  test("AC-23: HTMLに入っている説明文はその会社の1本だけ", async ({ request }) => {
    const html = await (await request.get("/company/6861")).text();

    // 他社の説明文の書き出し（トヨタ・三菱商事）が混じっていないこと。
    expect(html).not.toContain("自動車の生産及び販売");
    // 出典の1行は説明文と対なので、1本なら1回しか出ない。
    expect(html.split("をもとに要約").length - 1).toBe(1);
  });

  test("モバイル幅でも横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/company/6861");

    await expect(summaryText(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("AC-22: /about に作り方の節があり、アンカーで飛べる", async ({ page }) => {
    await page.goto("/about#company-summary");

    const section = page.locator("#company-summary");
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "会社の説明文の作り方" })).toBeVisible();
    await expect(section.getByText("有価証券報告書", { exact: false }).first()).toBeVisible();
  });
});
