import { test, expect } from "./appTest";
import { lapsedPageData } from "../features/company/lib/pageData";
import { lapsedNotice } from "../features/company/lib/lapsed";
import { formatManYen } from "../features/ranking/lib/format";
import { companies, lapsed } from "../testing/realData";

/**
 * 母集団から外れた会社のページ（refresh の D9・#879・spec 1.16・AC-7）。
 *
 * **いまのデータには外れた会社がいない**（最初に外れうるのは 2027-08-26）ので、いなければ skip する。
 * 揺らしたデータ（`tools/perturb/check.sh --e2e`）では1社の最後の提出日を25か月前にするので、そこで走る。
 * 横スクロールは `company-refresh.spec.ts` の AC-15 のループが見ている。
 */
const id = lapsed.rows[0]?.[0];

test.describe("AC-7 母集団から外れた会社のページ", () => {
  test.skip(id === undefined, "いまのデータに母集団から外れた会社はいない（揺らしたデータで走る）");

  test("ページは残り、最後の有報の決算期と提出が途切れていることが読め、順位・偏差値は出ない", async ({
    page,
  }) => {
    const { company } = lapsedPageData(id!);
    const notice = lapsedNotice(company);
    const response = await page.goto(`/company/${id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(company.name);

    const box = page.getByTestId("company-lapsed-notice");
    await expect(box).toContainText(notice.heading);
    await expect(box).toContainText(company.fiscalPeriod);
    await expect(box).toContainText(company.filed);
    // 決算期は断りと Q&A の説明の2か所だけ（S3。カードの1文には書かない）
    const count = (await page.locator("body").innerText()).split(company.fiscalPeriod).length - 1;
    expect(count).toBe(2);

    // 最後の有報の金額と、その有報の Q&A は残る
    await expect(
      page.getByText(formatManYen(company.avgSalary), { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByTestId("company-qa")).toBeVisible();

    // 母集団に依存する節と、表示基準の操作は無い
    // 出典の節も、無い節（順位・分布・レーダー・年齢別の推定年収）を挙げない
    const body = page.locator("body");
    for (const absent of [
      "業界内順位",
      "全体順位",
      "水準が近い会社",
      "公開資料による全体像",
      "見せ方",
      "年齢別の推定年収",
      "偏差値・分布",
    ]) {
      await expect(body.getByText(absent, { exact: false }), absent).toHaveCount(0);
    }
    await expect(page.getByRole("navigation", { name: "ランキング", exact: true })).toHaveCount(0);
    // 分析は出さない（書いた時点の見立てを「今後」として読ませない）
    await expect(body.getByText(`${company.name}の現状と今後`)).toHaveCount(0);
  });

  test("ランキングにはいない（検索しても出ない）が、sitemap には載る", async ({ page }) => {
    const { company } = lapsedPageData(id!);
    expect(companies.rows.some((row) => row[0] === id)).toBe(false);

    await page.goto(`/?q=${encodeURIComponent(company.name)}`);
    await expect(page.locator(`a[href="/company/${id}"]`)).toHaveCount(0);

    const sitemap = await (await page.request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`/company/${id}</loc>`);
  });
});
