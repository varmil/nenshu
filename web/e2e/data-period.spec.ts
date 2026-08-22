import { test, expect } from "@playwright/test";

/**
 * S3（Issue #134、親 #104）。**「有価証券報告書ベース」までは書いてあるのに、
 * それが「いつ」の有報かがサイトのどこにも無かった。** 決算期が title・
 * description・画面の3方向に出ていることを固定する
 * （`docs/site-chrome/spec.md` 5.・AC-17〜AC-20）。
 *
 * **単体テスト（`lib/data/period.test.ts`・`lib/seo/ranking.test.ts`）では足りない。**
 * あちらが固定するのは文字列の組み立てで、それが実際に返るHTMLに入るか——
 * とくに**モバイルで隠れる2文目に回っていないか**、**1画面に2回出ていないか**——は
 * 描画を通らないと分からない。
 */

const PERIOD = "2026年3月期";
const BANK = "%E9%8A%80%E8%A1%8C%E6%A5%AD";

async function html(request: import("@playwright/test").APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  return response.text();
}

test.describe("データの時点（S3）", () => {
  test("AC-17: `/` の title に決算期が入る", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(new RegExp(PERIOD));
  });

  test("AC-18: 全ページの description に決算期が入る", async ({ request }) => {
    for (const path of ["/", "/?age=35", `/?ind=${BANK}`, "/about", "/company/6861"]) {
      const description =
        (await html(request, path)).match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      expect(description, path).toContain(PERIOD);
    }
  });

  // **サーバーが返すHTMLに入っていること**を見る（AC-19）。クライアントの描画待ちに
  // すると、クローラにも読み込みの遅い端末にも「いつのデータか」が届かない。
  test("AC-19: `/`・`/about`・`/company/[id]` の初期HTMLに決算期が出る", async ({ request }) => {
    for (const path of ["/", "/?age=35", "/about", "/company/6861"]) {
      expect(await html(request, path), path).toContain(PERIOD);
    }
  });

  test("AC-19: ランキングの決算期は1文目にある（モバイルで消えない）", async ({ page }) => {
    // 2文目は `hidden md:inline` で狭い画面では消える。決算期がそちらに回ると、
    // モバイルの読者にだけ「いつの数字か」が届かない。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByText(new RegExp(`^${PERIOD}の有価証券報告書`))).toBeVisible();

    // 年齢そろえでも同じ位置に残る。
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText(new RegExp(`^${PERIOD}の平均年間給与を`))).toBeVisible();
  });

  test("AC-19: 企業詳細は実測値の節の見出しに決算期が付く", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(
      page.getByRole("heading", { name: `有価証券報告書の実測値（${PERIOD}）` })
    ).toBeVisible();
  });

  // 1画面に1回（spec 5.1）。見出しと脚注のように同じ語を重ねない——Issue #128 で
  // 「推定」について決めたのと同じ扱いにする。
  test("決算期は1ページに1回だけ出る", async ({ page }) => {
    for (const path of ["/", "/?age=35", "/company/6861", "/about"]) {
      await page.goto(path);
      const text = (await page.locator("body").innerText()).split(PERIOD).length - 1;
      expect(text, path).toBe(1);
    }
  });

  // AC-20。決算期は `companies.meta.fiscalPeriod` から引いており、どこにも
  // 直書きしていない。**アプリのコードに現れないこと**は grep では担保できない
  // （テストとdocsには出てくる）ので、ここでは「データと同じ値が出ている」ことで
  // 代える——`meta` を差し替えれば全ページが一斉に変わることは
  // `lib/seo/ranking.test.ts` が固定している。
  test("AC-20: 画面の決算期が companies.json の meta と一致する", async ({ request }) => {
    const meta = (await (await request.get("/data/companies.json")).json()).meta;
    const [year, month] = meta.fiscalPeriod.split("-");
    const label = `${Number(year)}年${Number(month)}月期`;
    expect(label).toBe(PERIOD);
    expect(await html(request, "/")).toContain(label);
  });
});
