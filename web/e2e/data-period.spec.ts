import { test, expect } from "./appTest";
import { companyAnalysisFor } from "../features/company/lib/pageData";
import { decodeWorklife } from "../lib/data/worklife";
import { companyFiscalPeriodLabel, fiscalPeriodLabel, periodLabel } from "../lib/data/period";
import { edinetDocumentUrl } from "../lib/data/sources";
import {
  analyses,
  companies,
  filings,
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
  if (companyAnalysisFor(id) === null || !textAlignedWithNumbers(id)) return false;
  const texts = JSON.stringify([
    analyses.byId[id],
    summaries.byId[id] ?? null,
    payPolicies.byId[id] ?? null,
    decodeWorklife(worklife, index),
  ]);
  return !texts.includes(periodOf(id));
}

/**
 * 文章（説明文・要約と分析・給与の決定方針）がすべて数字と同じ有報から作られている会社か
 * （refresh の D3）。ずれた会社では、要約と給与の決定方針が数字と違う期を名乗る。
 */
function textAlignedWithNumbers(id: string): boolean {
  const numbers = filings.byId[id];
  return [summaries.filingById[id], analyses.byId[id]?.filing, payPolicies.byId[id]?.filing].every(
    (filing) => filing === undefined || filing.docId === numbers
  );
}

/**
 * refresh の D3（spec 1.5・AC-3）。**数字だけが新しい有報に替わり、文章が前の有報のままの会社。**
 * 数字の差分更新（D4）が数字を先に替えるので、文章が追いつくまで実データにいる。
 *
 * 説明文と要約・分析は D4 の1回目から実データにいる（114社）。**給与の決定方針のずれは、
 * いまのデータにいない**——節があるのは改正後（2026年3月期以後）の有報だけで、その会社の
 * 次の有報で数字が先に替わるまで現れない。揺らしたデータ（`tools/perturb/check.sh --e2e`。
 * 4つ目の揺らし方がこの会社を作る）で走る。
 */
function behind(id: string, filing: { period: string } | undefined): boolean {
  return filing !== undefined && filing.period !== companies.periods[rowOf(id)[9]];
}
const TEXT_BEHIND = companies.rows.find(
  ([id]) => behind(id, summaries.filingById[id]) && behind(id, analyses.byId[id]?.filing)
)?.[0];
const PAY_BEHIND = companies.rows.find(([id]) => behind(id, payPolicies.byId[id]?.filing))?.[0];

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

  /*
   * refresh の D3（spec 1.5・AC-3）。**文章の節は、数字の側の期と書類を借りずに、自分を作った
   * 有報の期を名乗り、その書類を指す。** Q&A は数字の期のまま。給与の決定方針の期は、数字の期と
   * ずれたときだけ引用の枠の先頭に出る（site-chrome spec 5.1 の例外）。
   */
  /** 「このページの出典」の行ごとの見出しと、その行が指す EDINET の書類。 */
  async function sourceRows(page: import("@playwright/test").Page) {
    return page
      .getByTestId("company-sources")
      .locator("dl > div")
      .evaluateAll((divs) =>
        divs.map((div) => [
          div.querySelector("dt")?.textContent,
          [...div.querySelectorAll("a")]
            .map((a) => a.getAttribute("href") ?? "")
            .filter((href) => href.includes("WZEK0040")),
        ])
      );
  }

  test("要約・分析が数字より前の有報のままの会社では、要約の節と出典がその有報を名乗り、指す", async ({
    page,
  }) => {
    test.skip(TEXT_BEHIND === undefined, "要約・分析が数字とずれた会社がいまのデータにいない");
    const id = TEXT_BEHIND!;
    const analysis = analyses.byId[id].filing;
    const summary = summaries.filingById[id];
    await page.goto(`/company/${id}`);

    await expect(page.getByTestId("company-qa")).toContainText(
      `${periodOf(id)}の有価証券報告書の値です。`
    );
    const digest = page.getByTestId("company-digest");
    await expect(digest).toContainText(`${periodLabel(analysis.period)}の有価証券報告書`);
    await expect(digest).not.toContainText(periodOf(id));

    // 「このページの出典」は行ごとに、その行の中身を作った書類を指す
    expect(await sourceRows(page)).toEqual(
      expect.arrayContaining([
        ["実測値", [edinetDocumentUrl(filings.byId[id])]],
        ["AIの要約", [edinetDocumentUrl(summary.docId)]],
        ["AIの評価", [edinetDocumentUrl(analysis.docId)]],
      ])
    );
  });

  test("給与の決定方針が数字より前の有報のままの会社では、引用の枠がその有報の期を名乗り、指す", async ({
    page,
  }) => {
    test.skip(
      PAY_BEHIND === undefined,
      "給与の決定方針が数字とずれた会社がいまのデータにいない（tools/perturb/check.sh --e2e で作る）"
    );
    const id = PAY_BEHIND!;
    const policy = payPolicies.byId[id].filing;
    await page.goto(`/company/${id}`);

    const pay = page.getByTestId("company-pay-policy");
    await expect(pay.locator("[data-pay-source]")).toContainText(
      `${periodLabel(policy.period)}の有価証券報告書の「`
    );
    await expect(pay.locator("blockquote")).toHaveAttribute(
      "cite",
      edinetDocumentUrl(policy.docId)
    );
    await expect(page.getByTestId("company-pay-policy-filing")).toHaveAttribute(
      "href",
      edinetDocumentUrl(policy.docId)
    );
    expect(await sourceRows(page)).toEqual(
      expect.arrayContaining([["原文", [edinetDocumentUrl(policy.docId)]]])
    );
  });
});
