import { test, expect } from "./appTest";
import { companyAnalysisFor } from "../features/company/lib/pageData";
import { decodeWorklife } from "../lib/data/worklife";
import { companyFiscalPeriodLabel, fiscalPeriodLabel } from "../lib/data/period";
import {
  analyses,
  companies,
  payPolicies,
  pickCompany,
  rowOf,
  summaries,
  worklife,
} from "../testing/realData";

/**
 * S3（Issue #134、親 #104）と E1（`docs/expansion/spec.md` 1.4、Issue #172）。
 * **「有価証券報告書ベース」までは書いてあるのに、それが「いつ」の有報かが
 * サイトのどこにも無かった**のが S3 の出発点で、E1 は**その時点を代表1つから
 * 幅に変えた**（母集団を広げると最頻は 63.5% まで下がり、1,081社の決算期が
 * 違うまま代表を名乗ることになるため。2026-08 時点）。
 *
 * **単体テスト（`lib/data/period.test.ts`・`lib/seo/ranking.test.ts`）では足りない。**
 * あちらが固定するのは文字列の組み立てで、それが実際に返るHTMLに入るか——
 * とくに**モバイルで隠れる2文目に回っていないか**、**1画面に2回出ていないか**——は
 * 描画を通らないと分からない。
 *
 * **期待値は `companies.json` から `lib/data/period.ts` を通して作る**（refresh の D0・
 * Issue #870）。決算期の幅は毎日の更新で動くので、書き写すと1社の有報で落ちる。
 */

/** 母集団の時点（幅）。 */
const RANGE = fiscalPeriodLabel(companies.meta);
const BANK = "%E9%8A%80%E8%A1%8C%E6%A5%AD";

const periodOf = (id: string) => companyFiscalPeriodLabel(companies, rowOf(id));

/**
 * 企業詳細の決算期を数えるのに使える会社。**要約の節があり**（決算期はその説明にも出る）、
 * **会社の文章データ（要約と分析・説明文・給与の決定方針・働きやすさの注釈）が自分の
 * 決算期の文字列を含まない**こと——含むと、アプリが置いていない場所でも数えてしまう。
 */
function countable(id: string, index: number): boolean {
  if (companyAnalysisFor(id) === null) return false;
  const texts = JSON.stringify([
    analyses.byId[id],
    summaries.byId[id] ?? null,
    payPolicies.byId[id] ?? null,
    decodeWorklife(worklife, index),
  ]);
  return !texts.includes(periodOf(id));
}

/**
 * 決算期の違う2社。**会社ごとに違う値が出ることの実物**で、同じ文字列がハードコード
 * されていないことも見える。
 */
const COMPANY = pickCompany("要約の節があり、決算期を数えられる会社", (row, i) =>
  countable(row[0], i)
);
const OTHER_PERIOD_COMPANY = pickCompany(
  `決算期を数えられる、${periodOf(COMPANY)}でない会社`,
  (row, i) => countable(row[0], i) && periodOf(row[0]) !== periodOf(COMPANY)
);

async function html(request: import("@playwright/test").APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  return response.text();
}

test.describe("データの時点（S3・E1）", () => {
  /*
   * AC-17（`/` の title）・AC-18（description）・AC-19（本文）を、同じ HTML から見る。**本文は `<body>` 以降に
   * 絞る**——head の title・description・`og:` にも同じ幅が入っているので、HTML 全体で
   * 探すと本文に無くても通る（以前の AC-19 はそうなっていた）。
   *
   * **サーバーが返す HTML に入っていること**を見る。クライアントの描画待ちにすると、
   * クローラにも読み込みの遅い端末にも「いつのデータか」が届かない。
   *
   * AC-20（画面の決算期が companies.json のデータと一致する）もここで見る。期待値そのものが
   * `companies.json` の `meta` と会社の行から作ってある。
   */
  test("AC-17〜AC-20: `/` の title、ランキングと /about の description と初期HTMLの本文に、データの決算期の幅が入る", async ({
    request,
  }) => {
    for (const path of ["/", "/?age=35", `/?ind=${BANK}`, "/about"]) {
      const page = await html(request, path);
      const description = page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
      expect(description, `${path} description`).toContain(RANGE);
      expect(page.slice(page.indexOf("<body")), `${path} 本文`).toContain(RANGE);
      // title に入れるのは `/` だけ。ファセットの title は年齢・業種名のほうが情報量が高い。
      if (path === "/")
        expect(page.match(/<title>([^<]*)<\/title>/)?.[1], "/ の title").toContain(RANGE);
    }
    // 企業詳細は1社ぶんなので幅ではなくその会社の決算期（E1）。
    const description =
      (await html(request, `/company/${COMPANY}`)).match(
        /<meta name="description" content="([^"]*)"/
      )?.[1] ?? "";
    expect(description).toContain(periodOf(COMPANY));
    expect(description).not.toContain(RANGE);
  });

  test("AC-19: ランキングの決算期は1文目にある（モバイルで消えない）", async ({ page }) => {
    // 長い文は2文目を `hidden md:inline` にして狭い画面で消すことがある。決算期が
    // そちらに回ると、モバイルの読者にだけ「いつの数字か」が届かない。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByText(new RegExp(`^${RANGE}の有価証券報告書`))).toBeVisible();

    // 年齢そろえでも同じ位置に残る。
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(
      page.getByText(new RegExp(`^${RANGE}の有価証券報告書の平均年間給与を`))
    ).toBeVisible();
  });

  // 1画面に1回（spec 5.1）。見出しと脚注のように同じ語を重ねない——Issue #128 で
  // 「推定」について決めたのと同じ扱いにする。
  //
  // **`/about` だけは幅と最頻の2つが出る**が、これは同じ語の重複ではなく
  // 「範囲」と「その内訳」という別の情報になる（幅だけだと端の会社が全体を
  // 代表しているように読める）。数えるのは幅のほう。
  test("決算期は1ページに1回だけ出る", async ({ page }) => {
    for (const path of ["/", "/?age=35", "/about"]) {
      await page.goto(path);
      const count = (await page.locator("body").innerText()).split(RANGE).length - 1;
      expect(count, path).toBe(1);
    }
  });

  // **企業詳細だけは2回**（2026-09-24 に spec 5.1 を改めた）。「年収に関するQ&A」の説明の
  // 1行（C16 までは「有価証券報告書の実測値」の見出し）と、**要約の節の説明**。どちらも自分の
  // 節の中身がどの年度の有報かを示す。**それ以外の場所には増やさない**——説明文（C7）の出典の
  // 1行に入れて重なったのを、この spec が一度捕まえている。
  //
  // **企業詳細は幅ではなくその会社の決算期**（E1・AC-7）。母集団の幅を出すと、決算期の
  // 違う会社のページにまで幅の端が付いて、その会社の数字がいつのものかぼやける。
  test("企業詳細の決算期は Q&A の説明と要約の説明の2か所だけ", async ({ page }) => {
    for (const id of [COMPANY, OTHER_PERIOD_COMPANY]) {
      const path = `/company/${id}`;
      const label = periodOf(id);
      await page.goto(path);
      const count = (await page.locator("body").innerText()).split(label).length - 1;
      expect(count, path).toBe(2);
      await expect(page.getByTestId("company-qa"), path).toContainText(
        `${label}の有価証券報告書の値です。`
      );
      await expect(page.getByTestId("company-digest"), path).toContainText(
        `${label}の有価証券報告書`
      );
    }
  });
});
