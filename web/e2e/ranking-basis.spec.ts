import { test, expect } from "./appTest";
import { rankingPageData } from "../features/ranking/lib/pageData";
import { formatManYen } from "../features/ranking/lib/format";

/**
 * 表示基準（実測値 / 年齢そろえ）の切替。ADR-0007。
 *
 * 既定は実測値で、URL に `age` が無い状態がそれを表す。`docs/ranking/spec.md`
 * AC-1・AC-2・AC-9・AC-11。
 *
 * **1行目の会社と金額は `rankingPageData`（`/` が画面を組むのと同じ関数）から取る。**
 * いまのデータの値を書き写すと、毎日の更新で1社動いただけで落ちる（refresh の D0・
 * Issue #870）。
 *
 * `/?ind=銀行業`（`age` なし）が実測値で開くこと（AC-7）と、JS 実行前の HTML が
 * 実測値で並んでいることは `ranking-url-sync.spec.ts` に、切替でネットワークが
 * 起きないことは同じファイルの流れにまとめてある。
 */

/** そのURLの1行目の会社。 */
const firstOf = (query: string) =>
  rankingPageData(new URLSearchParams(query)).bootstrap.page.companies[0];

test.describe("表示基準の切替", () => {
  /*
   * AC-1 と AC-9 の実測値側。**実測値では「推定」の語を1つも出さない**（バッジも
   * 断り書きも）——有報そのままの数字に推定の体裁を被せない。
   */
  test("AC-1・AC-9: クエリ無しの / は有報の実測値そのままで並び、「推定」の語が出ない", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "平均年収ランキング", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "実測値" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // 列見出しは「平均年収（有報）」で、「推定」の語を含まない。
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "平均年収（有報）" })).toBeVisible();

    // 金額は有報の平均年間給与そのもの（`avgSalary`）。
    const top = firstOf("");
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toContainText(top.name);
    await expect(firstRow).toContainText(formatManYen(top.avgSalary));

    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("推定年収（35歳）")).toHaveCount(0);
    // 出典（有価証券報告書・単体）は h1 直下のリード文が持つ。表の脚注には置かない
    // （同じ断りが画面に3回あった。`lib/footnote.ts`）。
    await expect(page.getByText(/有価証券報告書の平均年間給与（単体）で比べた/)).toBeVisible();
  });

  /*
   * 実測値では平均年齢の高い会社が上位に来る。これが「年齢そろえ」を用意する理由。
   *
   * **1位は基準ごとに違いうる**（2026-09 時点では実測値と25歳で別の会社）。並びが
   * 変わることは1ページぶんの金額の列で見て、25歳の1行目はその基準の推定年収で見る。
   */
  test("AC-2: 年齢そろえに切り替えると35歳の推定に変わり、年齢スイッチで25歳を選べる", async ({
    page,
  }) => {
    await page.goto("/");
    const table = page.getByRole("table");
    const rawOrder = await table.locator("tbody tr td:nth-child(2)").allInnerTexts();

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(page.getByRole("button", { name: "年齢そろえ" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("heading", { name: "35歳年収ランキング", level: 1 })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /推定年収（35歳）/ })).toBeVisible();

    const ageOrder = await table.locator("tbody tr td:nth-child(2)").allInnerTexts();
    expect(ageOrder).not.toEqual(rawOrder);

    // AC-11 の裏側: 年齢そろえにすると年齢スイッチが有効になる。
    const age25 = page.getByRole("button", { name: "25歳" });
    await expect(age25).toBeEnabled();
    await age25.click();

    await expect(page).toHaveURL(/[?&]age=25/);
    const top25 = firstOf("age=25");
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toContainText(top25.name);
    await expect(firstRow).toContainText(formatManYen(top25.estimatedSalary!));
  });

  // 消すと「年齢そろえ」で何が使えるようになるかが分からなくなるので、
  // 無効にしたうえで表示は残す（ADR-0007）。使えないことはヒントでも示す。
  test("AC-11: 実測値では年齢スイッチが無効だが表示は残る", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("「年齢そろえ」のときだけ使います")).toBeVisible();
    const age45 = page.getByRole("button", { name: "45歳" });
    await expect(age45).toBeVisible();
    await expect(age45).toBeDisabled();

    await age45.click({ force: true });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "平均年収ランキング", level: 1 })).toBeVisible();
  });

  /*
   * モバイルでは表（`hidden md:block`）ではなく行の一覧が出る。U13 でカードの枠を
   * 外したので、行は `md:hidden` の一覧の中の div になった。
   *
   * **行には表示基準の語を置かない**（Issue #128）。以前は年齢そろえのときだけ
   * 「推定」の一語を添えていたが、30行ぶん同じ語が繰り返されていた。推定である
   * ことは帯のヒントが持つ（AC-9）ので、それが出ていることと対で見る。一覧の脚注は
   * 以前「推定年収は年齢補正後の推定値です。」で始まっていたが、帯と同じ断りなので
   * 外した（`lib/footnote.ts`）。
   * 横スクロールは `ranking-refresh.spec.ts` がこの状態（`/?age=35`）も含めて見ている。
   */
  test("モバイル幅でも切替でき、行には「推定」の語を置かず、帯が推定を示す", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");

    const rows = page.locator("div.md\\:hidden > div");
    await expect(rows.first()).toContainText(formatManYen(firstOf("").avgSalary));
    await expect(rows.getByText("推定", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page).toHaveURL(/[?&]age=35/);
    await expect(rows.first()).not.toContainText("推定");
    await expect(rows.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("業種の賃金カーブで補正した推定値です。")).toBeVisible();
  });
});
