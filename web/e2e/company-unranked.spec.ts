import { test, expect } from "./appTest";
import { unrankedPageData } from "../features/company/lib/pageData";
import { unrankedNotice } from "../features/company/lib/unranked";
import { periodLabel } from "../lib/data/period";
import { formatInt, formatManYen } from "../features/ranking/lib/format";
import { companies, payPolicies, unrankedIdsOf } from "../testing/realData";

/**
 * ランキングの外の会社のページ（refresh の D9・#879・D11・#903・spec 1.16・AC-7）。理由ごとに1社で見る。
 *
 * - 提出が途切れた会社（最後の有報から24か月）は**いまのデータにいない**（最初に外れうるのは
 *   2027-08-26）ので skip になる。揺らしたデータ（`tools/perturb/check.sh --e2e`）の6つ目で走る
 * - 単体従業員の線を割った会社は、いれば走る。揺らしたデータでは7つ目が1社足す
 *
 * 横スクロールは `company-refresh.spec.ts` の AC-15 のループが理由ごとに1社ずつ見ている。
 */

/**
 * 母集団に依存する節と、表示基準の操作。どちらの理由でも出ない。出典の節もこれらを挙げない。
 * サイドバーは「水準が近い会社」ではなく業種の上位10社で、見出しが違う（下のレイアウトのテスト）。
 */
const ABSENT = [
  "業界内順位",
  "全体順位",
  "水準が近い会社",
  "公開資料による全体像",
  "見せ方",
  "年齢別の推定年収",
  "偏差値・分布",
];

for (const reason of ["lapsed", "belowLine"] as const) {
  const id = unrankedIdsOf(reason)[0];

  test.describe(`AC-7 ランキングの外の会社のページ（${reason}）`, () => {
    test.skip(id === undefined, `いまのデータに ${reason} の会社はいない（揺らしたデータで走る）`);

    test("ページは残り、ランキングにいない理由が読め、順位・偏差値は出ない", async ({ page }) => {
      const { company, minEmployees } = unrankedPageData(id!);
      const notice = unrankedNotice(company, minEmployees);
      const response = await page.goto(`/company/${id}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(company.name);

      const box = page.getByTestId("company-unranked-notice");
      await expect(box).toHaveAttribute("data-reason", reason);
      await expect(box).toContainText(notice.heading);
      await expect(box).toContainText(company.fiscalPeriod);
      if (reason === "lapsed") {
        await expect(box).toContainText(company.filed);
      } else {
        // 単体の人数と線。連結の人数があれば、数字がグループの平均ではないことをそれで言う
        await expect(box).toContainText(`従業員が${formatInt(company.employees)}人`);
        await expect(box).toContainText(`${formatInt(minEmployees)}人以上`);
        if (company.employeesConsolidated !== null) {
          await expect(box).toContainText(`連結${formatInt(company.employeesConsolidated)}人`);
        }
      }
      // 決算期は断りと Q&A の説明の2か所だけ（S3。カードの1文には書かない）。給与の決定方針の節が
      // ある会社は、その説明の先頭にも書く（原文の期。数字より前の有報のままなら別の期）
      const policy = payPolicies.byId[id!];
      const policyHere =
        policy !== undefined && periodLabel(policy.filing.period) === company.fiscalPeriod;
      const count = (await page.locator("body").innerText()).split(company.fiscalPeriod).length - 1;
      expect(count).toBe(policyHere ? 3 : 2);

      // 有報の金額と、その有報の Q&A は残る
      await expect(
        page.getByText(formatManYen(company.avgSalary), { exact: true }).first()
      ).toBeVisible();
      await expect(page.getByTestId("company-qa")).toBeVisible();

      const body = page.locator("body");
      for (const absent of ABSENT) {
        await expect(body.getByText(absent, { exact: false }), absent).toHaveCount(0);
      }
      await expect(page.getByRole("navigation", { name: "ランキング", exact: true })).toHaveCount(
        0
      );
      // 分析は出さない（提出が途切れた会社では書いた時点の見立て。線を割った会社では書き直さない）
      await expect(body.getByText(`${company.name}の現状と今後`)).toHaveCount(0);
    });

    test("PC は通常の企業詳細と同じ2カラムで、断りは年収カードの直下、サイドバーは業種の上位10社", async ({
      page,
    }) => {
      const { company, industryTop } = unrankedPageData(id!);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/company/${id}`);

      // 断りは年収カードの直下（運営者の指示・2026-09-30）
      const amount = page.getByText(formatManYen(company.avgSalary), { exact: true }).first();
      const box = page.getByTestId("company-unranked-notice");
      const amountBox = (await amount.boundingBox())!;
      const noticeBox = (await box.boundingBox())!;
      expect(noticeBox.y).toBeGreaterThan(amountBox.y);
      await expect(page.getByTestId("company-qa")).toBeVisible();
      const qaBox = (await page.getByTestId("company-qa").boundingBox())!;
      expect(noticeBox.y).toBeLessThan(qaBox.y);

      // サイドバーは本文の右。中身は業種の実測値の1位からの10社（この会社は母集団にいない）
      const aside = page.locator("aside");
      const asideBox = (await aside.boundingBox())!;
      expect(asideBox.x).toBeGreaterThan(noticeBox.x + noticeBox.width);
      if (industryTop.length > 0) {
        await expect(aside.locator("h2")).toHaveText(`${company.tse33}で平均年収が高い会社`);
        const links = aside.locator("li a");
        await expect(links).toHaveCount(industryTop.length);
        await expect(links.first()).toHaveAttribute("href", `/company/${industryTop[0].id}`);
        await expect(aside.locator("li").first()).toContainText("業界1位");
      }
    });

    test("ランキングにはいない（検索しても出ない）が、sitemap には載る", async ({ page }) => {
      const { company } = unrankedPageData(id!);
      expect(companies.rows.some((row) => row[0] === id)).toBe(false);

      await page.goto(`/?q=${encodeURIComponent(company.name)}`);
      await expect(page.locator(`a[href="/company/${id}"]`)).toHaveCount(0);

      const sitemap = await (await page.request.get("/sitemap.xml")).text();
      expect(sitemap).toContain(`/company/${id}</loc>`);
    });
  });
}
