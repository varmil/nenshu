import { test, expect } from "./appTest";
import type { Locator, Page } from "@playwright/test";
import {
  companyAnalysisFor,
  companyPageData,
  companyPayPolicyFor,
} from "../features/company/lib/pageData";
import { buildActualsQa } from "../features/company/lib/actualsQa";
import { sourceMeta } from "../features/company/lib/analysis";
import { buildCardFacts, buildCardLead, type CardFact } from "../features/company/lib/cardFacts";
import {
  buildCurveSummary,
  buildHistoryPeak,
  buildHistorySummary,
} from "../features/company/lib/highlights";
import {
  buildHistoryTable,
  formatRate,
  historyBaseYear,
} from "../features/company/lib/historyTable";
import { NEIGHBOR_COUNT } from "../features/company/lib/neighbors";
import { blockChars } from "../features/company/lib/payPolicy";
import { buildProfitSummary } from "../features/company/lib/profitHistory";
import { buildRankingLinks } from "../features/company/lib/rankingLinks";
import {
  estimateRange,
  formatBinLabel,
  formatBinTick,
  formatDeviation,
  statsForBasis,
} from "../features/company/lib/stats";
import {
  buildTenureChart,
  buildTenureSummary,
  buildTenureTable,
  formatYearsDiff,
} from "../features/company/lib/tenureHistory";
import type { CompanyAgeStats, SalaryHistory, TenureHistory } from "../features/company/types";
import { formatDecimal1, formatInt, formatManYen, toManYen } from "../features/ranking/lib/format";
import { DEFAULT_TARGET_AGE } from "../features/ranking/lib/urlState";
import {
  analyses,
  history,
  historyYearsOf,
  payPolicies,
  pickCompany,
  pickMaxCompany,
  profitHistory,
  stats,
} from "../testing/realData";

/**
 * C2（Issue #83）で足した節——水準が近い会社・分布・年齢別の表と ±20%・10年推移
 * （timeseries の T1・T2・T3、在籍年数の T4）・このページの出典（C12 で「この数字の作り方」から作り替えた）
 * ——と、C3 以降の見た目の手直しの E2E。
 *
 * C1 で作った表示基準の切替・URL・履歴・初期 HTML は `company-page.spec.ts` にある。
 * **表示基準を切り替えても変わらない節**（推移・説明文・要約と分析・稼ぐ力）は、
 * そちらの AC-3 がまとめて1本で見ている。
 *
 * **期待値はデータとアプリの組み立て関数から作る。いまのデータの値を書き写さない**
 * （refresh の D0・Issue #870）。データは毎日の更新で動く。「推移の途中が欠けている」
 * 「給与の決定方針が無い」のような状態を前提にするテストは、その状態の会社をデータから選ぶ
 * （`pickCompany`）。会社を名指しするのは、その会社が居ることだけを前提にするときに限る。
 */

/** 値のある年がいくつの連なりに分かれているか。途中の年が欠けると2以上になる。 */
function runs(values: readonly (number | null)[]): number {
  return values.filter((v, i) => v !== null && (i === 0 || values[i - 1] === null)).length;
}

/** 欠けた年のすぐ後ろで値のある年（最初の1つ）。 */
function indexAfterGap(values: readonly (number | null)[]): number {
  return values.findIndex(
    (v, i) =>
      v !== null && i > 0 && values[i - 1] === null && values.slice(0, i).some((x) => x !== null)
  );
}

/**
 * 節がすべてそろう会社——説明文・分析と要約・給与の決定方針・3つの推移（増減の文まで）・
 * 水準が近い会社。どれか1節が欠けた会社で見ると、その節の位置と崩れを見落とす。
 */
function pickFullCompany(): string {
  return pickCompany("節がすべてそろう会社", ([id, name]) => {
    if (companyPayPolicyFor(id, name) === null || companyAnalysisFor(id) === null) return false;
    const data = companyPageData(id);
    return (
      data.summary !== null &&
      data.history !== null &&
      buildHistorySummary(data.history.years, data.history.values) !== null &&
      data.tenureHistory !== null &&
      data.profitHistory !== null &&
      buildProfitSummary(data.profitHistory) !== null &&
      statsForBasis(data.view, null).neighbors.length > 0
    );
  });
}

/** 同じ業種にほかの会社が十分いて、「水準が近い会社」が上限の社数までそろう会社。 */
function pickFullNeighborsCompany(): string {
  return pickCompany(
    `水準が近い会社が${NEIGHBOR_COUNT}社そろう会社`,
    (row) => stats.industryCounts[row[2]] > NEIGHBOR_COUNT
  );
}

/**
 * 推移の窓の右端（refresh の D5）がいちばん新しい会社と、いちばん古い会社。右端は会社ごとに違う
 * （決算期が3月でない会社は、最新の有報が前の年の提出になる）。**どちらでも窓の最後の年が最新の行**
 * になる。在籍年数も右端の年に値がある会社に限る（在籍年数だけが空いた年のある会社では、最新の行
 * どうしが別の書類になる）。`withProfit` なら稼ぐ力の推移もある会社に限る。
 *
 * 全社の右端が同じ年のときは、2社とも同じ右端になる（検査はそのまま成り立つ）。
 */
function pickWindowEdgeCompanies(withProfit = false): string[] {
  const ends = Object.values(history.endById);
  const ok = (id: string) =>
    history.tenureById[id]?.at(-1) != null &&
    (!withProfit || profitHistory.profit[id] !== undefined);
  return [Math.max(...ends), Math.min(...ends)].map((end) =>
    pickCompany(`推移の窓の右端が${end}年の会社`, ([id]) => history.endById[id] === end && ok(id))
  );
}

/*
 * 節の並び（アートボード 4b・6b・6e・8a / 8b）。**全部の見出しを1本で並べて見る。**
 * 以前は C2 の2巡目（推移は実測値の後ろ）・P2（稼ぐ力は推移の直後）・C10（分析は
 * レーダーの直後、要約は稼ぐ力の後ろ、出典は要約の後ろ）が別々のファイルで隣り合う2つずつを
 * 見ていた。全体を並べれば、どれか1つがずれても落ちる。**節がすべてそろう会社で見る**——
 * 無い節の位置は見られない。
 *
 * **本文の先頭は平均年収カードで、レーダーはその直後**（C15・#821・spec AC-33）。検索からの
 * 流入の語は「年収」「年収ランキング」で占められているので、答えの金額を最初の画面に置く。
 * **カードには見出しが無い**ので、h2 の並びだけではカードとレーダーの入れ替えを検出できない。
 * DOM の並びと画面の上下で見る（生の HTML の並びは `company-page.spec.ts` の AC-10）。
 */
test.describe("節の並び", () => {
  const salaryCard = (page: Page) =>
    page.locator('[data-slot="card"]').filter({ hasText: "平均年収（有価証券報告書・単体）" });
  const radar = (page: Page) =>
    page.getByRole("heading", { name: "公開資料による全体像", level: 2 }).locator("xpath=..");

  test("本文は平均年収カード → レーダー → 分析の順で始まり、見出しが決めた順に並ぶ", async ({
    page,
  }) => {
    const id = pickFullCompany();
    const { view, fiscalPeriod } = companyPageData(id);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/company/${id}`);

    expect(await page.locator("h2").allTextContents()).toEqual([
      "公開資料による全体像",
      `${view.name}の現状と今後`,
      // 年齢別は働きやすさの前（2026-09-28）。働きやすさは区分の数で高さが変わるので、
      // 前に置くと年齢別の位置が会社ごとにずれる。
      "年齢別の推定年収",
      "残業・有給・男女の賃金の差異",
      "平均年収推移（過去10年間）",
      "在籍年数推移（過去10年間）",
      "稼ぐ力の推移（過去10年間）",
      `${view.name}の有価証券報告書の要約`,
      // 給与の決定方針は要約の直後・Q&A の直前（C19・#852）。
      companyPayPolicyFor(id, view.name)!.heading,
      // 実測値の4項目の Q&A は要約（と給与の決定方針）の後ろ・出典の直前（C16・spec AC-34）。
      // C15 までは「有価証券報告書の実測値」として年齢別と推移の間にあった。
      buildActualsQa(view, fiscalPeriod).heading,
      "このページの出典",
      // サイドバーは DOM では本文の後ろ。
      `${view.tse33}で水準が近い会社`,
      // ランキングへ戻る導線は本文＋サイドバーの下、フッタの直前（C20・spec AC-37）。
      "ランキングで比べる",
    ]);

    // カードは本文の列の最初の子で、レーダーの節はそのすぐ次の兄弟。分析はスロット
    // （`astro-slot`）に包まれて届くので、兄弟ではなく上の見出しの並びで見ている。
    expect(await salaryCard(page).evaluate((el) => el.previousElementSibling === null)).toBe(true);
    const card = await salaryCard(page).elementHandle();
    expect(await radar(page).evaluate((el, c) => el.previousElementSibling === c, card)).toBe(true);

    // 入れ替えた目的そのもの。レーダーが先頭だった頃、金額は上から 954px にあった。
    const amount = (await salaryCard(page)
      .getByText(formatManYen(statsForBasis(view, null).salary), { exact: true })
      .boundingBox())!;
    expect(amount.y + amount.height).toBeLessThanOrEqual(800);
  });

  // 横スクロールは下の AC-15 のループ（375px）が見ている。spec AC-33 がキーエンスで書いてある。
  test("390px でもカードがレーダーより上にあり、金額が最初の画面に入る", async ({ page }) => {
    const { view } = companyPageData("6861");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/6861");

    const cardBox = (await salaryCard(page).boundingBox())!;
    const radarBox = (await radar(page).boundingBox())!;
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(radarBox.y);

    // レーダーが先頭だった頃は上から 1,139px。
    const amount = (await salaryCard(page)
      .getByText(formatManYen(statsForBasis(view, null).salary), { exact: true })
      .boundingBox())!;
    expect(amount.y + amount.height).toBeLessThanOrEqual(844);
  });

  /*
   * **図のある4節は、どれも チャート → 表 → 説明文**（運営者の指示・#846）。年齢別の推定年収
   * だけが C3 から #846 まで 表 → 説明文 → チャート で、年齢別と推移が別々のテストで逆の順を
   * 固定していた。4節を1本で並べて見れば、どれか1つがずれても落ちる。
   * 説明文は節の末尾の段落で、見出し直下の出典の1行と取り違えないよう、データから組んだ文で引く。
   */
  test("図のある4節は、どれも チャート → 表 → 説明文 の順に並ぶ", async ({ page }) => {
    const id = pickFullCompany();
    const { view, history: trend, tenureHistory, profitHistory } = companyPageData(id);
    const byAge = view.byBasis.filter((s) => s.targetAge !== null);
    await page.goto(`/company/${id}`);
    const sections: [string, string][] = [
      ["年齢別の推定年収", buildCurveSummary(byAge, view.name)[0]],
      ["平均年収推移（過去10年間）", buildHistorySummary(trend!.years, trend!.values)!],
      ["在籍年数推移（過去10年間）", buildTenureSummary(tenureHistory!, view.name, view.tse33)!],
      ["稼ぐ力の推移（過去10年間）", buildProfitSummary(profitHistory!)!],
    ];
    const top = async (locator: Locator) => (await locator.boundingBox())!.y;
    for (const [heading, summaryText] of sections) {
      const section = page
        .getByRole("heading", { name: heading, exact: true, level: 2 })
        .locator("xpath=..");
      const chart = await top(section.locator("figure"));
      const table = await top(section.getByRole("table"));
      const summary = await top(section.locator("p", { hasText: summaryText }));
      expect(chart, heading).toBeLessThan(table);
      expect(table, heading).toBeLessThan(summary);
    }
  });
});

test.describe("AC-12 水準が近い会社", () => {
  // 自分を含まないこと・10社に満たない業種は `lib/neighbors.test.ts`。
  test("同業種の10社が企業詳細へのリンクとして並び、業界順位・平均年齢と業種一覧への導線が付く", async ({
    page,
  }) => {
    const id = pickFullNeighborsCompany();
    const { view } = companyPageData(id);
    const [first] = statsForBasis(view, null).neighbors;
    await page.goto(`/company/${id}`);
    const neighbors = page.locator("section", { hasText: `${view.tse33}で水準が近い会社` });

    await expect(neighbors.getByRole("listitem")).toHaveCount(NEIGHBOR_COUNT);
    await expect(neighbors.locator("ul").getByRole("link").first()).toHaveAttribute(
      "href",
      `/company/${first.id}`
    );
    await expect(
      neighbors.locator("ul").getByRole("link", { name: view.name, exact: true })
    ).toHaveCount(0);
    await expect(neighbors.getByRole("listitem").first()).toContainText(
      `業界${formatInt(first.industryRank)}位・平均${formatDecimal1(first.avgAge)}歳`
    );
    await expect(
      neighbors.getByRole("link", {
        name: `${view.tse33}${formatInt(view.industryCount)}社をすべて見る`,
      })
    ).toHaveAttribute("href", /^\/\?ind=/);
  });
});

/*
 * 最下部の「ランキングで比べる」（C20・spec 1.24）。行き先の文字列がパンくずと同じであることと
 * 順位の文言は `lib/rankingLinks.test.ts`。ここでは置き場所（本文＋サイドバーの下・フッタの直前）と、
 * データから決まる順位が届くこと、押すとランキングの業種フィルタに着くことを見る。
 * 横スクロールは AC-15 のループ。
 */
test.describe("AC-37 ランキングへ戻る導線", () => {
  const rankingNav = (page: Page) =>
    page.getByRole("navigation", { name: "ランキング", exact: true });

  test("業種と全体の2本が順位を添えてフッタの直前に並び、業種のほうはランキングの業種フィルタに着く", async ({
    page,
  }) => {
    const { view } = companyPageData("6861");
    const expected = buildRankingLinks(view, statsForBasis(view, null));
    await page.goto("/company/6861");
    const nav = rankingNav(page);
    const links = nav.getByRole("link");

    await expect(links).toHaveCount(expected.length);
    for (const [i, link] of expected.entries()) {
      await expect(links.nth(i)).toContainText(link.label);
      await expect(links.nth(i)).toContainText(link.note);
      await expect(links.nth(i)).toHaveAttribute("href", link.path);
    }

    // 本文＋サイドバーの grid の次の兄弟で、そのすぐ次がフッタ。
    expect(
      await nav.evaluate(
        (el) =>
          el.nextElementSibling?.tagName === "FOOTER" &&
          el.previousElementSibling?.contains(document.querySelector("aside")) === true
      )
    ).toBe(true);

    await links.nth(0).click();
    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText(view.tse33);
  });

  test("PC では2列、390px では縦に積む", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/company/6861");
    let [first, second] = await Promise.all(
      [0, 1].map((i) => rankingNav(page).getByRole("link").nth(i).boundingBox())
    );
    expect(Math.round(first!.y)).toBe(Math.round(second!.y));
    expect(first!.x + first!.width).toBeLessThanOrEqual(second!.x + 1);

    await page.setViewportSize({ width: 390, height: 844 });
    [first, second] = await Promise.all(
      [0, 1].map((i) => rankingNav(page).getByRole("link").nth(i).boundingBox())
    );
    expect(first!.y + first!.height).toBeLessThanOrEqual(second!.y + 1);
  });
});

/*
 * 分布の図（spec 1.13・C3 のモック・C14）。**表示基準で階級が変わること**は
 * 「AC-32 平均年収カード」の切替のテストが見ている。
 */
test.describe("AC-13 分布の中での位置", () => {
  const figure = (page: Page) => page.locator('[data-slot="card"]').first().locator("figure");

  test("位置バーは順位で両端を書き、9階級のヒストグラムは社数を目で読める形で出す", async ({
    page,
  }) => {
    const { view } = companyPageData("6861");
    const current = statsForBasis(view, null);
    const { distribution } = current;
    const last = distribution.counts.length - 1;
    await page.goto("/company/6861");

    // 位置バー。**金額ではなく順位から出す**ので、両端も順位で書く。
    await expect(figure(page)).toContainText(`全体${formatInt(view.totalCount)}社の中の位置`);
    await expect(figure(page)).toContainText(`偏差値 ${formatDeviation(current.deviation)}`);
    await expect(figure(page)).toContainText(`${formatInt(view.totalCount)}位`);
    await expect(figure(page)).toContainText("1位");
    await expect(figure(page)).toContainText(`中位 ${formatManYen(current.populationMedian)}`);

    // 読み上げ用の一覧がヒストグラムの正。9階級ぶんあり、その会社の階級に印が付く。
    const bins = page
      .getByText(`全${formatInt(view.totalCount)}社の分布`)
      .locator("xpath=../ul[1]/li");
    await expect(bins).toHaveCount(9);
    await expect(bins.filter({ hasText: `${view.name}はここ` })).toHaveCount(1);
    await expect(bins.nth(current.bin)).toContainText(`${view.name}はここ`);
    // sr-only の一覧とは別に、棒の上にも社数が出ている。
    const barCounts = figure(page).locator('[aria-hidden="true"] > div > span:first-child');
    await expect(barCounts).toHaveText(distribution.counts.map((n) => formatInt(n)));
    await expect(barCounts.nth(current.bin)).toBeVisible();

    /*
     * 両端の階級は外側を吸収する。**それは横軸の目盛（先頭の「〜」と末尾の「+」）が言っている**ので、
     * 図の説明に同じ断りを重ねない（C14・spec AC-32）。
     */
    const lowTick = formatBinTick(distribution, 0);
    const highTick = formatBinTick(distribution, last);
    await expect(figure(page).getByText(lowTick, { exact: true })).toBeVisible();
    await expect(figure(page).getByText(highTick, { exact: true })).toBeVisible();
    await expect(figure(page).locator("figcaption")).not.toContainText("両端の階級");

    // 棒の上の社数と目盛は読み上げない。9階級は sr-only の一覧だけが読む（同じ中身を2回読ませない）。
    const tree = await figure(page).ariaSnapshot();
    expect(tree).toContain(`${view.name}はここ`);
    expect(tree).not.toContain(lowTick);
    expect(tree).not.toContain(highTick);
  });

  // ラベルが折り返すと軸の高さが階級ごとに変わり、棒の下端が揃わなくなる（公開後に報告あり）。
  test("ヒストグラムの棒の幅が揃い、目盛が1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    const { widths, lines } = await figure(page).evaluate((el) => ({
      widths: [...el.querySelectorAll('[aria-hidden="true"] > div')].map(
        (n) => Math.round(n.getBoundingClientRect().width * 10) / 10
      ),
      lines: [...el.querySelectorAll('[aria-hidden="true"] > div > span:last-child')].map(
        (n) => n.getClientRects().length
      ),
    }));
    expect(widths).toHaveLength(9);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    for (const count of lines) expect(count).toBe(1);
  });
});

/** 年齢別の節（見出しの親）。推移の表（T2）も同じページに居るので、表はこの中で引く。 */
const curveSection = (page: Page) =>
  page.getByRole("heading", { name: "年齢別の推定年収" }).locator("xpath=..");

/** 年齢別の8点（`CompanyDetail` と同じく、表示基準の並びから実測値を除いたもの）。 */
const byAgeOf = (id: string): CompanyAgeStats[] =>
  companyPageData(id).view.byBasis.filter((s) => s.targetAge !== null);

test.describe("AC-14 年齢別の表と推定範囲", () => {
  /*
   * **信頼区間ではない旨は1か所だけ**——チャート・表・説明文は1つの `section` に縦に続くので、
   * 表の caption にも同じ文を置くと一度の視界に断りが2つ並ぶ（Issue #95 で表の caption を
   * 外した）。**帯だけを見ると信頼区間に見える**ので、図の側からは外さない。
   * `/about` 側の断りは `company-page.spec.ts` の「/about への導線」が見ている。
   */
  test("8行の表で推定範囲は ±20%、信頼区間ではない旨はチャートにだけ書き、縦軸は丸い目盛", async ({
    page,
  }) => {
    const [youngest] = byAgeOf("6861");
    await page.goto("/company/6861");
    const rows = curveSection(page).getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(8);

    // 範囲は円のまま ±20% してから万円に丸める。画面の万円の値から掛け直すと、丸めの端数で
    // 1万円ずれる会社がある。
    const cells = rows.first().locator("td");
    await expect(cells.nth(1)).toHaveText(formatManYen(youngest.salary));
    await expect(cells.nth(2)).toHaveText(
      `${formatManYen(youngest.salary * 0.8)}〜${formatManYen(youngest.salary * 1.2)}`
    );

    await expect(page.getByText("統計的な信頼区間ではありません")).toHaveCount(1);
    await expect(
      page.locator("figcaption", { hasText: "統計的な信頼区間ではありません" })
    ).toBeVisible();
    await expect(page.getByRole("table").locator("caption")).toHaveCount(0);

    /*
     * 目盛の値そのものは `lib/stats.test.ts` の `niceTicks`。ここは丸い目盛が描かれている
     * ことだけを見る——2本以上あり、等間隔で、どれも刻みの倍数になっている。
     */
    const svg = page.locator("svg").filter({ hasText: "（万円）" });
    const ticks = (await svg.locator('text[dominant-baseline="central"]').allTextContents()).map(
      (text) => Number(text.replace(/,/g, ""))
    );
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    const step = ticks[1] - ticks[0];
    expect(step).toBeGreaterThan(0);
    for (const [i, value] of ticks.entries()) {
      expect(value).toBe(ticks[0] + step * i);
      expect(value % step).toBe(0);
    }
  });

  /*
   * C4（Issue #146）。文言の組み立ては `lib/highlights.test.ts` が全社で固定している
   * （到達年齢が表の万円の値で判定されていることも含む）。ここは**描かれた DOM から読み直して**
   * 文と表が食い違わないことと、3文が1つの段落に続くこと（運営者の指示。1文ずつ `<p>` に
   * 分けると、同じ8点の話が3つの話題に見える）を見る。3文そろう会社で見る。
   *
   * 段落は「年齢別に見ると」で引く——**節の最初の `p` ではない**（C12・#805 で見出しの直下に
   * 年齢補正の1行が入った）。
   */
  test("C4 AC-14: 説明文は到達年齢から始まる3文の1段落で、到達年齢の行は表でもその金額以上", async ({
    page,
  }) => {
    const id = pickCompany(
      "年齢別の説明文が到達年齢・最高水準・伸びの3文になる会社",
      ([id, name]) => buildCurveSummary(byAgeOf(id), name).length === 3
    );
    const { view } = companyPageData(id);
    const sentences = buildCurveSummary(byAgeOf(id), view.name);
    await page.goto(`/company/${id}`);
    const paragraph = curveSection(page).locator("p", { hasText: "年齢別に見ると" });
    await expect(paragraph).toHaveCount(1);
    await expect(paragraph).toHaveText(sentences.join(""));

    const text = (await paragraph.textContent())!;
    const pairs = [...text.matchAll(/(\d+)歳で([\d,]+)万円/g)];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, age, manYen] of pairs) {
      const row = curveSection(page)
        .getByRole("row")
        .filter({ hasText: `${age}歳` })
        .first();
      const shown = Number((await row.locator("td").nth(1).textContent())!.replace(/[^0-9]/g, ""));
      expect(shown, `${age}歳`).toBeGreaterThanOrEqual(Number(manYen.replace(/,/g, "")));
    }
  });

  /*
   * 年齢別の表の列幅（2026-08-20 の指摘）。年齢の列に `w-36`（144px）を敷いていたため、
   * 狭い器では「25歳」の3文字に必要な倍近くを取り、右の2列——とくに両端が4桁の金額になる
   * 推定範囲——が痩せていた。**器の幅で切る**（`@container`）ので、ビューポート幅ではなく
   * サイドバーを含めた実際の器で確かめる——**768px でもサイドバーがあると器は 396px しかない**。
   * 360px はモバイルの最狭。推定範囲の文字が最も長くなる（両端とも4桁の）会社で見る。
   */
  test("器が狭いとき（360px・768px）年齢の列は内容ぶんに絞り、推定範囲が1行に収まる", async ({
    page,
  }) => {
    const id = pickCompany("推定範囲の両端が4桁（万円）になる年齢がある会社", ([id]) =>
      byAgeOf(id).some((s) => toManYen(estimateRange(s.salary).low) >= 1000)
    );
    for (const width of [360, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/company/${id}`);

      const { age, range, container, overflow } = await page
        .getByRole("table")
        .filter({ hasText: "推定範囲" })
        .first()
        .evaluate((table) => {
          const th = [...table.querySelectorAll("th")];
          return {
            age: th[0].getBoundingClientRect().width,
            range: th[2].getBoundingClientRect().width,
            container: (table.parentElement as HTMLElement).clientWidth,
            // `whitespace-nowrap` なので、溢れれば scrollWidth が伸びる。
            overflow: Math.max(
              ...[...table.querySelectorAll("td")].map((n) => n.scrollWidth - n.clientWidth)
            ),
          };
        });
      // @md 未満であることの確認（前提が崩れたら気づく）。
      expect(container, `${width}px`).toBeLessThan(448);
      expect(age, `${width}px`).toBeLessThanOrEqual(72);
      expect(range, `${width}px`).toBeGreaterThan(age * 2);
      expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
    }
  });

  // 端数で1pxはみ出すと、表だけが縦スクロールする小窓になる（CLAUDE.md・公開後に報告あり）。
  test("年齢別の表の器が縦スクロールを持たない", async ({ page }) => {
    await page.goto("/company/6861");
    const overflowY = await page
      .locator('[data-slot="table-container"]')
      .first()
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(["visible", "hidden", "clip"]).toContain(overflowY);
  });

  /*
   * 文字の大きさは**器の幅**で決まる（公開後の2巡目）。SVG は viewBox ごと拡大縮小するので、
   * user unit で書いた文字も同じ倍率で伸びる——22 のままだと PC で実効20px、PC に合わせて
   * 13 と書くと 375px 幅で実効6px。倍率を掛けて測る。
   */
  test("折れ線の文字はPCで本文と同じ水準に収まり、モバイルでも読める大きさが残る", async ({
    page,
  }) => {
    const measure = async () =>
      page.getByRole("img", { name: /年齢別の推定年収/ }).evaluate((el) => {
        const svg = el as unknown as SVGSVGElement;
        const box = svg.getBoundingClientRect();
        const scale = box.width / svg.viewBox.baseVal.width;
        const sizes = [...svg.querySelectorAll("text")].map(
          (t) => parseFloat(getComputedStyle(t).fontSize) * scale
        );
        return { min: Math.min(...sizes), max: Math.max(...sizes), height: box.height };
      });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    const pc = await measure();
    expect(pc.max).toBeLessThanOrEqual(14.5);
    expect(pc.min).toBeGreaterThanOrEqual(9);
    // 縦を厚くした（270 → 340 ユニット）。
    expect(pc.height).toBeGreaterThan(295);

    await page.setViewportSize({ width: 390, height: 844 });
    const sp = await measure();
    expect(sp.max).toBeLessThanOrEqual(12.5);
    expect(sp.min).toBeGreaterThanOrEqual(8.5);
  });
});

/*
 * 推移の節の当たり判定は**表の行**に寄せてある（T2・Issue #138）。T1 の頃はグラフが
 * 持っていた `ul.sr-only` を見ていたが、同じ10件を読み上げる経路を2つ置かないために
 * 落とした——AC-10 は表が担う。
 */
const historySection = (page: Page) =>
  page.getByRole("heading", { name: "平均年収推移（過去10年間）" }).locator("xpath=..");

/** 推移の表の各行を「年 / 金額 / 平均年齢 / 基準年比」の4セルで読む（T3・#827 で前年比を置き換えた）。 */
async function historyRows(page: Page): Promise<string[][]> {
  return historySection(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")
      )
    );
}

/**
 * 推移の表に出るはずの各行。行は `buildHistoryTable` で組み、セルは `SalaryHistoryTable` と
 * 同じ整形関数に通す。
 */
function expectedHistoryRows(trend: SalaryHistory): string[][] {
  return buildHistoryTable(trend).rows.map((row) => [
    `${row.year}年`,
    row.value === null ? "データなし" : formatManYen(row.value),
    row.age === null ? "" : `${formatDecimal1(row.age)}歳`,
    row.cumulative === null ? "" : formatRate(row.cumulative),
  ]);
}

/*
 * T1（10年推移）と T2（推移の表・`docs/timeseries/spec.md` 2.5）。**累積の基準はその会社で
 * 最初に値のある年**——欠損の扱いがこの表の正しさのほぼ全部になる。規則そのものは
 * `lib/historyTable.test.ts` が固定しており、ここは実ページでそう描かれることを見る。
 * 表示基準と独立であること（T1 AC-8）は `company-page.spec.ts` の AC-3（平均年齢も入る）。
 *
 * **3列目は平均年齢**（T3・#827）。T2 では前年比だった。年収の伸びが平均年齢の上昇と
 * 一緒に起きたかを読めるように、同じ有報の平均年齢を隣に置く。
 */
test.describe("T1・T2・T3 平均年収推移", () => {
  // 最高値の文は、最高値が最新の年ではない会社にだけ出る（`buildHistoryPeak`）ので、その会社で見る。
  test("10年ぶんの図と表（年度・金額・平均年齢・基準年比）に、出典と増減・最高値の文が付く", async ({
    page,
  }) => {
    const id = pickCompany("平均年収の最高値が最新の年ではない会社", ([id]) => {
      const values = history.byId[id];
      return values !== undefined && buildHistoryPeak(historyYearsOf(id), values) !== null;
    });
    const trend = companyPageData(id).history!;
    const baseYear = historyBaseYear(trend);
    await page.goto(`/company/${id}`);
    const section = historySection(page);

    // 年ごとに1行。基準年（＝最初に値のある年）の行は累積が空。
    expect(await historyRows(page)).toEqual(expectedHistoryRows(trend));

    // 列は4つで、累積の見出しは基準年を名乗る。**「昇給率」とは呼ばない**（会社の平均が
    // 動いた幅であって個人の昇給ではない）。断りは累積の列に付き、同じ基準年を名乗る。
    expect(await section.getByRole("columnheader").allTextContents()).toEqual([
      "年度",
      "平均年収",
      "平均年齢",
      `${baseYear}年比`,
    ]);
    await expect(section).toContainText(
      `${baseYear}年比は会社の平均が動いた幅で、個人の昇給率ではありません。`
    );

    // 読み上げは表が担う（AC-10）。同じ10件を読み上げる経路を2つ置かない。
    await expect(section.locator("ul.sr-only")).toHaveCount(0);
    await expect(section.getByRole("table")).toHaveCount(1);
    // 棒と年のラベルはグラフ側に残る（4桁の西暦）。
    const [firstYear, lastYear] = [trend.years[0], trend.years[trend.years.length - 1]];
    await expect(section.getByText(String(firstYear), { exact: true })).toBeVisible();
    await expect(section.getByText(String(lastYear), { exact: true })).toBeVisible();
    // ただし図は読み上げない。棒の上の金額と年は表と同じ中身なので、2回読ませない。
    expect(await section.locator("figure").ariaSnapshot()).not.toMatch(
      new RegExp(`${firstYear}|${lastYear}`)
    );

    // 説明は出典だけ（AC-9）。表示基準と独立であることは値で担保するので、断りを重ねない。
    await expect(section).toContainText("平均年間給与と平均年齢の実測値（提出会社単体）");
    await expect(section).toContainText("横軸は報告書の提出年です。");
    await expect(section.getByText("年齢そろえ")).toHaveCount(0);

    // 増減の1文に、最高値の年を足す（C4・AC-17）。最新年が最高値なら出さないことは
    // `lib/highlights.test.ts` の `buildHistoryPeak`。
    await expect(section).toContainText(buildHistorySummary(trend.years, trend.values)!);
    await expect(section).toContainText(buildHistoryPeak(trend.years, trend.values)!);
  });

  /*
   * 欠け方は2通り。**途中が欠ける会社**——棒は描かれず年のラベルだけが残り、欠けた年は
   * 平均年齢も空。累積は基準年からの比なので、欠損をまたいだ年にも出る。
   * **先頭が欠ける会社**——固定の先頭の年を基準にすると累積の列が丸ごと空になるので、
   * 最初に値のある年が基準になり、節の説明も同じ年を名乗る。
   */
  test("T1 AC-7・T2 AC-13: 欠損のある年は「なし」で平均年齢も累積も空、基準年は最初に値のある年", async ({
    page,
  }) => {
    const gapped = pickCompany(
      "平均年収の推移の途中が欠けている会社",
      ([id]) => runs(history.byId[id] ?? []) >= 2
    );
    const trend = companyPageData(gapped).history!;
    const missing = trend.years.filter((_, i) => trend.values[i] === null);
    await page.goto(`/company/${gapped}`);
    const section = historySection(page);
    await expect(section.getByText("なし", { exact: true })).toHaveCount(missing.length);
    for (const year of missing) {
      await expect(section.getByText(String(year), { exact: true })).toBeVisible();
    }

    const rows = await historyRows(page);
    expect(rows).toEqual(expectedHistoryRows(trend));
    for (const [i, value] of trend.values.entries()) {
      if (value === null) expect(rows[i]).toEqual([`${trend.years[i]}年`, "データなし", "", ""]);
    }
    const afterGap = indexAfterGap(trend.values);
    expect(rows[afterGap][1]).toMatch(/^[\d,]+万円$/);
    expect(rows[afterGap][3]).toMatch(/^[＋−±][\d.]+%$/);

    const late = pickCompany("平均年収の推移の先頭の年が欠けている会社", ([id]) => {
      const values = history.byId[id];
      return values?.[0] === null && values.filter((v) => v !== null).length >= 2;
    });
    const lateTrend = companyPageData(late).history!;
    const base = lateTrend.values.findIndex((v) => v !== null);
    const next = lateTrend.values.findIndex((v, i) => i > base && v !== null);
    await page.goto(`/company/${late}`);
    const baseLabel = `${lateTrend.years[base]}年比`;
    await expect(historySection(page).getByRole("columnheader", { name: baseLabel })).toBeVisible();
    await expect(historySection(page)).toContainText(`${baseLabel}は会社の平均が動いた幅で`);
    const lateRows = await historyRows(page);
    expect(lateRows).toEqual(expectedHistoryRows(lateTrend));
    expect(lateRows[0]).toEqual([`${lateTrend.years[0]}年`, "データなし", "", ""]);
    expect(lateRows[base][3]).toBe("");
    expect(lateRows[next][3]).toMatch(/^[＋−±][\d.]+%$/);
  });

  /*
   * T3 AC-16。最新年の行とページ上部のカードは同じ有報の同じ数字。**書式が片方だけ違うと、
   * 同じ値を別の値として読ませる**（丸めはどちらも `formatDecimal1`）。窓の右端の年が違う2社で見る
   * （refresh の D5。D5 の前は「右端の年の枠が空いて前の年が最新になる会社」で見ていた）。
   */
  test("T3 AC-16: 最新年の行の平均年齢がカードの平均年齢と同じ文字列", async ({ page }) => {
    for (const id of pickWindowEdgeCompanies()) {
      await page.goto(`/company/${id}`);
      const card = page.locator('[data-slot="card"]').first().locator("dl").first();
      const labels = await card.locator("dt").allTextContents();
      const values = await card.locator("dd").allTextContents();
      const cardAge = values[labels.indexOf("平均年齢")];
      expect(cardAge, id).toMatch(/^\d{2}\.\d歳$/);

      const latest = (await historyRows(page)).filter((row) => row[1] !== "データなし").at(-1)!;
      expect(latest[2], id).toBe(cardAge);
    }
  });

  test("推移の棒はPCで高さを持ち、年のラベルが棒と揃う", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");
    // 稼ぐ力の推移（P2）が同じ `YearlyBarChart` を使うので、節で絞ってから figure を取る。
    const figure = historySection(page).locator("figure");

    const bars = figure.locator('[aria-hidden="true"]').first();
    expect((await bars.boundingBox())!.height).toBeGreaterThanOrEqual(120);

    // 棒と年ラベルは別の行なので、割り付けが違うと1本ずつずれる。
    const [barX, yearX] = await figure.evaluate((el) => {
      const rows = el.querySelectorAll('[aria-hidden="true"]');
      const centers = (row: Element) =>
        [...row.children].map((n) => {
          const r = n.getBoundingClientRect();
          return Math.round(r.x + r.width / 2);
        });
      return [centers(rows[0]), centers(rows[1])];
    });
    expect(yearX).toEqual(barX);
  });
});

const tenureSection = (page: Page) =>
  page.getByRole("heading", { name: "在籍年数推移（過去10年間）" }).locator("xpath=..");

/** 在籍年数の表の各行を「年 / 在籍年数 / 基準年との差」の3セルで読む。 */
async function tenureRows(page: Page): Promise<string[][]> {
  return tenureSection(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")
      )
    );
}

/**
 * 在籍年数の表に出るはずの各行。行は `buildTenureTable` で組み、セルは `TenureHistoryTable` と
 * 同じ整形関数に通す。
 */
function expectedTenureRows(tenure: TenureHistory): string[][] {
  return buildTenureTable(tenure).rows.map((row) => [
    `${row.year}年`,
    row.value === null ? "データなし" : `${formatDecimal1(row.value)}年`,
    row.diff === null ? "" : formatYearsDiff(row.diff),
  ]);
}

/*
 * T4（#835・`docs/timeseries/spec.md` 2.7）。在籍年数の折れ線と業種の中央値の点線、表、説明文。
 * 差・説明文の分岐・線の切れ目・ラベルの逃がし方は `lib/tenureHistory.test.ts` が固定しており、
 * ここは実ページでそう描かれることを見る。表示基準と独立であること（AC-22）は
 * `company-page.spec.ts` の AC-3、390px の横スクロールは下の AC-15 のループ、
 * チャート → 表 → 説明文 の並び（AC-19）は上の「節の並び」。
 */
test.describe("T4 在籍年数推移", () => {
  // 欠けた年の無い会社で見る。欠けた年は下の AC-20。
  test("AC-19: 折れ線と業種の中央値の点線、10行の表、説明文が出る", async ({ page }) => {
    const id = pickCompany(
      "在籍年数が全部の年にあり、業種の中央値もある会社",
      ([id, , industry]) =>
        history.tenureById[id]?.every((v) => v !== null) === true &&
        history.tenureIndustryMedian[industry].some((v) => v !== null)
    );
    const { view, tenureHistory } = companyPageData(id);
    const tenure = tenureHistory!;
    await page.goto(`/company/${id}`);
    const section = tenureSection(page);

    await expect(section).toContainText(
      `各年の有価証券報告書に載った平均勤続年数の実測値（提出会社単体）。点線は${view.tse33}の中央値です。`
    );
    await expect(section).toContainText("縦軸は0から始まりません。");

    const rows = await tenureRows(page);
    expect(rows).toEqual(expectedTenureRows(tenure));
    expect(await section.getByRole("columnheader").allTextContents()).toEqual([
      "年度",
      "在籍年数",
      `${buildTenureTable(tenure).baseYear}年との差`,
    ]);

    // 図: 中央値の点線があり、各点に表と同じ値が書かれている。最新年の点の値は太字。
    const chart = section.getByRole("img");
    const medians = tenure.years.flatMap((year, i) => {
      const median = tenure.industryMedian[i];
      return median === null ? [] : [`${year}年 ${formatDecimal1(median)}年`];
    });
    await expect(chart).toHaveAttribute(
      "aria-label",
      `在籍年数の推移（実線）と${view.tse33}の中央値（点線）。中央値は${medians.join("、")}`
    );
    await expect(section.getByTestId("tenure-median-line")).toHaveAttribute("d", /^M/);
    const medianLabel = buildTenureChart(tenure).medianLabel!;
    await expect(
      chart.locator("text", { hasText: `業種の中央値 ${formatDecimal1(medianLabel.value)}` })
    ).toHaveCount(1);
    const pointLabels = await chart.locator("text[font-weight]").allTextContents();
    expect(pointLabels).toEqual(rows.map((row) => row[1].replace("年", "")));
    const latest = rows[rows.length - 1];
    await expect(chart.locator('text[font-weight="700"]')).toHaveText(latest[1].replace("年", ""));

    // 説明文: 1文目は社名・値で閉じ（値は表の最新年の行と同じ）、2文目は中央値との差と最初の年からの動き。
    const summary = buildTenureSummary(tenure, view.name, view.tse33)!;
    await expect(section.locator("p", { hasText: summary })).toHaveCount(1);
    await expect(section).toContainText(
      `${view.name}の平均勤続年数は、単体（提出会社）で${latest[1]}です。`
    );

    // 表の主は在籍年数。見出しの長い差の列のほうが広く取られていた（PC で 228px 対 327px）。
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const [, tenureWidth, diff] = await section
        .getByRole("columnheader")
        .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
      expect(tenureWidth, `${width}px`).toBeGreaterThanOrEqual(diff);
    }
  });

  /*
   * 途中が欠ける会社と先頭が欠ける会社。欠けた年は線をつながず、表は「データなし」で差も空、
   * 差の基準は最初に値のある年になる。途中が欠ける会社は、業種の中央値のほうは欠けない会社を選ぶ
   * ——点線だけがつながることを見るため。
   */
  test("AC-20: 欠損のある年は線をつながず、表は「データなし」で差も空、基準は最初に値のある年", async ({
    page,
  }) => {
    const gapped = pickCompany(
      "在籍年数の推移の途中が欠け、業種の中央値はつながる会社",
      ([id, , industry]) =>
        runs(history.tenureById[id] ?? []) >= 2 &&
        runs(history.tenureIndustryMedian[industry]) === 1
    );
    const tenure = companyPageData(gapped).tenureHistory!;
    await page.goto(`/company/${gapped}`);
    const rows = await tenureRows(page);
    expect(rows).toEqual(expectedTenureRows(tenure));
    for (const [i, value] of tenure.values.entries()) {
      if (value === null) expect(rows[i]).toEqual([`${tenure.years[i]}年`, "データなし", ""]);
    }
    expect(rows[indexAfterGap(tenure.values)][2]).toMatch(/^[＋−±]\d+\.\d年$/);
    // 会社の線は欠けた年の前後で切れる。点線（中央値）は同業に値があるのでつながる。
    const line = tenureSection(page).getByTestId("tenure-line");
    expect(((await line.getAttribute("d")) ?? "").match(/M/g)).toHaveLength(runs(tenure.values));
    const median = tenureSection(page).getByTestId("tenure-median-line");
    expect(((await median.getAttribute("d")) ?? "").match(/M/g)).toHaveLength(1);

    const late = pickCompany("在籍年数の推移の先頭の年が欠けている会社", ([id]) => {
      const values = history.tenureById[id];
      return values?.[0] === null && values.some((v) => v !== null);
    });
    const lateTenure = companyPageData(late).tenureHistory!;
    const base = lateTenure.values.findIndex((v) => v !== null);
    await page.goto(`/company/${late}`);
    await expect(
      tenureSection(page).getByRole("columnheader", { name: `${lateTenure.years[base]}年との差` })
    ).toBeVisible();
    const lateRows = await tenureRows(page);
    expect(lateRows).toEqual(expectedTenureRows(lateTenure));
    expect(lateRows[0]).toEqual([`${lateTenure.years[0]}年`, "データなし", ""]);
    expect(lateRows[base][2]).toBe("");
  });

  /*
   * 最新年の行と「年収に関するQ&A」（C16）の平均勤続年数の回答は同じ有報の同じ数字（T3 AC-16 の
   * 平均年齢と同じ）。窓の右端の年が違う2社で見る。
   */
  test("AC-21: 最新年の行の在籍年数が、Q&A の平均勤続年数の回答と同じ文字列", async ({ page }) => {
    for (const id of pickWindowEdgeCompanies()) {
      await page.goto(`/company/${id}`);
      const tenure = await page
        .getByTestId("company-qa-list")
        .locator("div", { has: page.getByRole("heading", { name: /平均勤続年数は何年ですか/ }) })
        .locator("strong")
        .textContent();
      expect(tenure, id).toMatch(/^\d{1,2}\.\d年$/);
      const latest = (await tenureRows(page)).filter((row) => row[1] !== "データなし").at(-1)!;
      expect(latest[1], id).toBe(tenure);
    }
  });
});

/*
 * refresh の D5（#875・AC-9）。**推移の窓は会社ごとの直近10年**で、右端はその会社の推移で値のある
 * 最新の年。平均年収・在籍年数・稼ぐ力の3つの推移は同じ窓を使う——縦に並んだ3つの図の横軸が
 * そろわないと見比べられない（P2）。窓の年は `history.json` の右端から引き、書き写さない。
 */
test.describe("D5 AC-9 推移の窓", () => {
  test("3つの推移の表は、その会社の右端から数えた同じ10年を並べ、右端の年に値がある", async ({
    page,
  }) => {
    const profitSection = page
      .getByRole("heading", { name: "稼ぐ力の推移（過去10年間）" })
      .locator("xpath=..");
    for (const id of pickWindowEdgeCompanies(true)) {
      const years = historyYearsOf(id).map((year) => `${year}年`);
      await page.goto(`/company/${id}`);
      const salaryRows = await historyRows(page);
      expect(
        salaryRows.map((row) => row[0]),
        id
      ).toEqual(years);
      expect(salaryRows.at(-1)![1], id).not.toBe("データなし");
      expect(
        (await tenureRows(page)).map((row) => row[0]),
        id
      ).toEqual(years);
      expect(await profitSection.locator("tbody tr td:first-child").allTextContents(), id).toEqual(
        years
      );
    }
  });
});

test.describe("AC-15 レイアウト", () => {
  /*
   * サイドバーは `md:sticky md:top-4` で画面に貼り付く。**画面より高いと、はみ出した
   * 下端は本文を最後まで下ろすまで見えない**（C11・#799 の前は 6861 で 964px あった）。
   * 水準が近い会社が上限の社数までそろう会社で見る（サイドバーがいちばん高くなる）。
   *
   * **サイドバーは「水準が近い会社」の1枚だけ**——高さを押し上げていた「この会社の要点」
   * （AC-11）は C11 で外した。生の HTML に無いことは `company-page.spec.ts` の AC-10 が見る。
   */
  test("PC は2カラムで、サイドバーは画面の高さに収まり、スクロールしても最後の1社まで見える", async ({
    page,
  }) => {
    const id = pickFullNeighborsCompany();
    const { view } = companyPageData(id);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/company/${id}`);

    const aside = page.locator("aside");
    expect(await aside.locator("h2").allTextContents()).toEqual([`${view.tse33}で水準が近い会社`]);
    await expect(aside.getByRole("listitem")).toHaveCount(NEIGHBOR_COUNT);
    const before = (await aside.boundingBox())!;
    expect(before.x).toBeGreaterThan(640);
    expect(before.height).toBeLessThanOrEqual(800 - 16);

    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(200);
    const after = (await aside.boundingBox())!;
    expect(after.y).toBeGreaterThan(before.y - 1500);
    await expect(aside.getByRole("listitem").last()).toBeInViewport();
  });

  /*
   * モバイル幅で文書が横にはみ出さないこと。**節ごとに書いていた同じ検査を1本にまとめた**
   * （C1・C2 の AC-15・近傍10社・推移の表・C4 の説明文・C7 の説明文・C10・C13・P2）。
   * 幅は最も狭い 375px に寄せ、各節が最も長くなる会社をデータから選んで並べる。
   *
   * - 6861: **外さないこと**——`company-radar.spec.ts` はキーエンスの横スクロール検査をここに任せて消した
   * - 節がすべてそろう会社（レーダー・近傍・推移と稼ぐ力の表・説明文・分析・給与の決定方針・有報への帯）
   * - 社名がいちばん長い会社: h1・年齢別の説明文・Q&A が長くなり、パンくずも器の中で横に送られる
   * - 参照した資料がいちばん長く並ぶ会社（C10）
   * - 給与の決定方針がいちばん長い会社（畳む）と、表の列がいちばん多い会社（C19・AC-36）
   */
  test("375px では1カラムで、どの会社でも横スクロールが発生しない", async ({ page }) => {
    const ids = [
      "6861",
      pickFullCompany(),
      pickMaxCompany("社名がいちばん長い会社", (row) => row[1].length),
      pickMaxCompany("参照した資料がいちばん長く並ぶ会社", ([id]) =>
        (analyses.byId[id]?.sources ?? []).reduce(
          (sum, source) => sum + source.title.length + sourceMeta(source).length,
          0
        )
      ),
      pickMaxCompany("給与の決定方針がいちばん長い会社", ([id]) =>
        (payPolicies.byId[id]?.blocks ?? []).reduce((sum, block) => sum + blockChars(block), 0)
      ),
      pickMaxCompany("給与の決定方針の表の列がいちばん多い会社", ([id]) =>
        Math.max(
          0,
          ...(payPolicies.byId[id]?.blocks ?? []).flatMap((block) =>
            block.kind === "table" ? block.rows.map((cells) => cells.length) : []
          )
        )
      ),
    ];
    await page.setViewportSize({ width: 375, height: 844 });
    for (const id of new Set(ids)) {
      const data = companyPageData(id);
      await page.goto(`/company/${id}`);
      await expect(page.getByRole("heading", { level: 1 }), id).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, id).toBeLessThanOrEqual(0);
      expect((await page.locator("aside").boundingBox())!.x, id).toBeLessThan(64);

      // 推移の表は器の中で横に送る作りではない（T2 AC-14・T4 AC-22）。器ごと収まっていること。
      for (const [label, section, present] of [
        ["推移の表", historySection(page), data.history !== null],
        ["在籍年数の表", tenureSection(page), data.tenureHistory !== null],
      ] as const) {
        if (!present) continue;
        const table = await section
          .locator("table")
          .evaluate((el) => el.scrollWidth - el.parentElement!.clientWidth);
        expect(table, `${id} ${label}`).toBeLessThanOrEqual(0);
      }
    }
  });
});

/*
 * C12（Issue #805）で「この数字の作り方」（年齢補正の3ステップ）から作り替えた。ページに
 * 出ているデータを加工の度合いで区分に分け、区分ごとに該当するものと出典を並べる。
 * 行の組み立ては `lib/sources.test.ts`、節の有無による出し分け（説明文の無い会社）は
 * `company-summary.spec.ts`、有報のリンク先の書類は `company-filing.spec.ts`。
 *
 * **給与の決定方針のある会社（C19・#852）は先頭に区分「原文」が足されて7区分になる**
 * （`company-pay-policy.spec.ts`）。ここは給与の決定方針が無く、ほかの節はそろう会社（6区分で、
 * どの行も該当するものがいちばん長い形になる）で見る——「原文」の行が出ないことも、この会社の
 * 6区分の並びが見ている。7区分の会社は PC で 290px になり、下の「3ステップより低い」の PC の線
 * （260px）を超える——区分を1つ足したぶんで、区分ごとの行は変えていない
 * （`docs/company/pay-policy-display/design.md`）。
 */
test.describe("AC-16 このページの出典", () => {
  const sources = (page: Page) => page.getByTestId("company-sources");
  const row = (page: Page, label: string) =>
    sources(page).locator("dl > div", { has: page.locator("dt", { hasText: label }) });

  const pickSixSourceCompany = () =>
    pickCompany("給与の決定方針が無く、ほかの節はそろう会社", ([id, name]) => {
      if (companyPayPolicyFor(id, name) !== null || companyAnalysisFor(id) === null) return false;
      const data = companyPageData(id);
      return data.summary !== null && data.history !== null && data.tenureHistory !== null;
    });

  test("給与の決定方針の無い会社で、6区分が該当するものと出典を添えて並び、一次情報へのリンクがある", async ({
    page,
  }) => {
    await page.goto(`/company/${pickSixSourceCompany()}`);

    await expect(
      sources(page).getByRole("heading", { name: "このページの出典", level: 2 })
    ).toBeVisible();
    await expect(sources(page).locator("dt")).toHaveText([
      "実測値",
      "計算値",
      "推定値",
      "自己申告値",
      "AIの要約",
      "AIの評価",
    ]);
    await expect(sources(page).getByRole("link", { name: "賃金構造基本統計調査" })).toHaveAttribute(
      "href",
      "https://www.mhlw.go.jp/toukei/list/chinginkouzou.html"
    );
    await expect(
      sources(page).getByRole("link", { name: "女性の活躍推進企業データベース" })
    ).toHaveAttribute("href", "https://positive-ryouritsu.mhlw.go.jp/positivedb/");

    // 説明文・推移・要約と分析をすべて持つ会社なので、節の有無がページから渡っていれば全部が挙がる。
    await expect(row(page, "実測値")).toContainText("平均年収・平均年齢・在籍年数とその推移");
    await expect(row(page, "計算値")).toContainText("稼ぐ力・業種の中央値");
    await expect(row(page, "AIの要約")).toContainText("社名の下の説明文");
    await expect(row(page, "AIの要約")).toContainText("有価証券報告書の要約");
    await expect(row(page, "AIの評価")).toContainText("現状と今後");
  });

  test("年齢補正の手順は年齢別の節の1行にあり、フッタに出典の行は無い", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(curveSection(page)).toContainText("賃金構造基本統計調査");
    await expect(curveSection(page).getByRole("link", { name: "計算方法" })).toHaveAttribute(
      "href",
      "/about"
    );
    await expect(page.getByText(/^出典: /)).toHaveCount(0);
  });

  test("PC でもモバイルでも、作り替える前の3ステップより低い", async ({ page }) => {
    const id = pickSixSourceCompany();
    // 3ステップは PC（1280×800）で 260px、モバイル（390×844）で 580px あった（変更前の実測）。
    for (const [viewport, before] of [
      [{ width: 1280, height: 800 }, 260],
      [{ width: 390, height: 844 }, 580],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(`/company/${id}`);
      const box = await sources(page).boundingBox();
      expect(box!.height, `${viewport.width}px`).toBeLessThan(before);
    }
  });
});

/** カードの1項目の `dd` の文字（値と、順位なら母数）。 */
const factText = (fact: CardFact) => (fact.total ? `${fact.value} ${fact.total}` : fact.value);

/*
 * C14（#818・親 #817）。金額の直後は「どういう会社の金額か」（平均年齢・従業員数）、
 * その下に業界内順位と全体順位（業界が左）。在籍年数はカードから外し、太字は金額だけにした。
 * 偏差値も順位の段から外した（#831）——右の位置バーの見出しの隣に同じ値がある。
 * 値の組み立ては `lib/cardFacts.test.ts`。**カードの `dl` は中身で引く**——段の順を
 * 入れ替えたことがある（C14）。
 */
test.describe("AC-32 平均年収カード（C14）", () => {
  const salaryCard = (page: Page) => page.locator('[data-slot="card"]').first();
  const texts = (page: Page, row: number, cell: "dt" | "dd") =>
    salaryCard(page).locator("dl").nth(row).locator(cell).allTextContents();

  test("上部カードは2カラムで、左に金額、右に位置バーと分布が並ぶ", async ({ page }) => {
    const { view } = companyPageData("6861");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    // P1（#167）のレーダーが同じ額を図と指標リストにも出すので、カードの中で引く。
    const amount = (await salaryCard(page)
      .getByText(formatManYen(statsForBasis(view, null).salary), { exact: true })
      .boundingBox())!;
    const figure = (await salaryCard(page).locator("figure").boundingBox())!;
    // 右にいる（左端が金額より右）かつ、縦にはほぼ同じ高さから始まる。
    expect(figure.x).toBeGreaterThan(amount.x + amount.width);
    expect(Math.abs(figure.y - amount.y)).toBeLessThan(220);
  });

  /*
   * spec AC-32。**在籍年数はカードに出さない**（年収に関するQ&A の平均勤続年数とレーダーの
   * 定着の軸にある）。**太字は金額だけ**——順位まで太いと、どれがこのカードの
   * 答えなのかが読めない。
   */
  test("1段目に平均年齢・従業員数、2段目に業界内順位・全体順位が並び、太字は金額だけで、見出しとの間は4px", async ({
    page,
  }) => {
    const { view } = companyPageData("6861");
    const current = statsForBasis(view, null);
    const facts = buildCardFacts(view, current);
    await page.goto("/company/6861");

    expect(await texts(page, 0, "dt")).toEqual(["平均年齢", "従業員数（単体）"]);
    expect(await texts(page, 0, "dd")).toEqual(facts.profile.map(factText));
    expect(await texts(page, 1, "dt")).toEqual(["業界内順位", "全体順位"]);
    expect(await texts(page, 1, "dd")).toEqual(facts.standing.map(factText));
    await expect(salaryCard(page)).not.toContainText("在籍年数");
    // 偏差値はカードの中で1回だけ（#831。順位の段にも置くと2回になる）。位置バーの見出しの
    // 隣にあることは AC-13 が見る。
    await expect(salaryCard(page).getByText(formatDeviation(current.deviation))).toHaveCount(1);

    // 上下の順（モバイルでも同じ。カードが1カラムに積まれても段の順は変わらない）。
    const dls = salaryCard(page).locator("dl");
    const first = (await dls.nth(0).boundingBox())!;
    const second = (await dls.nth(1).boundingBox())!;
    expect(first.y + first.height).toBeLessThanOrEqual(second.y);

    const weights = await salaryCard(page)
      .locator("dl dd")
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).fontWeight)));
    expect(weights).toEqual([400, 400, 400, 400]);

    // 見出しと金額の間は 4px（spec AC-32。運営者の指示で C15 の後に足した）。
    const label = (await salaryCard(page)
      .getByText("平均年収（有価証券報告書・単体）", { exact: true })
      .boundingBox())!;
    const amount = (await salaryCard(page)
      .getByText(formatManYen(current.salary), { exact: true })
      .boundingBox())!;
    expect(amount.y - (label.y + label.height)).toBeCloseTo(4, 0);
  });

  // 2段とも同じ2列の器に入れてある。段ごとに器を変えると（C14 の頃は2段目だけ偏差値の
  // ぶん3項目あった）従業員数が全体順位より右にずれ、2つの段が別々の表に見える。
  test("2つの段の列の左端がそろっている", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    const lefts = async (row: number) =>
      salaryCard(page)
        .locator("dl")
        .nth(row)
        .locator("dt")
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
    const [age, employees] = await lefts(0);
    const [rankIndustry, rankAll] = await lefts(1);
    expect(Math.abs(age - rankIndustry)).toBeLessThanOrEqual(1);
    expect(Math.abs(employees - rankAll)).toBeLessThanOrEqual(1);
  });

  /*
   * **表示基準ごとに変わるもの**（金額・順位・分布）が切替に追随すること。偏差値は
   * 位置バーの見出しにあり、`company-page.spec.ts` の AC-2・AC-3 が見る。
   * 分布の階級は基準ごとに決め直しているので、先頭の階級の文字が変わる。変わらないもの
   * （推移・説明文・要約と分析）は `company-page.spec.ts` の AC-3。
   */
  test("年齢そろえに切り替えると、金額の見出しと2段目と分布の階級が変わり、1段目と金額直下の1文は変わらない", async ({
    page,
  }) => {
    const { view } = companyPageData("6861");
    const raw = statsForBasis(view, null);
    const aligned = statsForBasis(view, DEFAULT_TARGET_AGE);
    await page.goto("/company/6861");
    const firstBin = page
      .getByText(`全${formatInt(view.totalCount)}社の分布`)
      .locator("xpath=../ul[1]/li")
      .first();
    await expect(firstBin).toContainText(formatBinLabel(raw.distribution, 0));
    /*
     * 金額の直下は有報の値を言い直す1文（C15・spec 1.4）。**年齢そろえでも同じ文のまま**
     * ——「推定」は見出しが持つ（Issue #128）。文の組み立ては `lib/cardFacts.test.ts`。
     */
    const lead = salaryCard(page).getByText(buildCardLead(view), { exact: true });
    await expect(lead).toBeVisible();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(salaryCard(page).getByText(`${DEFAULT_TARGET_AGE}歳時点の推定年収`)).toBeVisible();
    await expect(
      salaryCard(page).getByText(formatManYen(aligned.salary), { exact: true })
    ).toBeVisible();
    await expect(lead).toBeVisible();

    expect(await texts(page, 0, "dd")).toEqual(buildCardFacts(view, raw).profile.map(factText));
    expect(await texts(page, 1, "dd")).toEqual(
      buildCardFacts(view, aligned).standing.map(factText)
    );
    await expect(firstBin).toContainText(formatBinLabel(aligned.distribution, 0));
  });

  // 3列だった頃は 93px（1280px）しか無く、折り返すと順位と母数（「◯位 /◯社」）が2行になっていた
  // （報告あり）。#831 で2列にして 143px（1280px）・155px（390px）になったが、器を狭める
  // 変更で戻らないように残す。モバイルはカードが1カラムになるが、本文の幅が狭いぶん
  // 1列あたりはほぼ同じになる。**全体順位の数字がいちばん大きい会社**（順位の文字が最も長い）で見る。
  test("カードの順位と実測値が1行に収まる（1280px・390px）", async ({ page }) => {
    const id = pickMaxCompany("全体順位の数字がいちばん大きい会社", (_, i) => stats.rankAll[i][0]);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/company/${id}`);

      const cardLists = page.locator('[data-slot="card"] dl');
      await expect(cardLists).toHaveCount(2);
      const overflow = await cardLists.evaluateAll((lists) =>
        lists.flatMap((el) =>
          [...el.querySelectorAll("dt, dd")].map((n) => n.scrollWidth - n.clientWidth)
        )
      );
      expect(Math.max(...overflow), `${width}px`).toBeLessThanOrEqual(0);
    }
  });
});

/*
 * C16（Issue #838・親 #836）。実測値の4項目を1問ずつの質問と回答にした（spec 1.22・AC-34）。
 * C4 の地の文（AC-17）と C1 の4セルの表を置き換えた。文言の組み立ては `lib/actualsQa.test.ts`
 * （決算期を説明の1行にだけ置くこと・「推定」を書かないことも、文全体の一致で固定している）。
 * ここはその文言がデータどおりに画面に届くことを見る。
 * 決算期が画面に2回までであることは `data-period.spec.ts`、節の位置は上の「節の並び」、
 * JS 実行前の HTML は `company-page.spec.ts` の AC-10、表示基準で変わらないことは同じファイルの
 * AC-3、FAQPage の JSON-LD を出さないことは `social.spec.ts` の鍵の集合が見ている。
 */
test.describe("AC-34 年収に関するQ&A（C16）", () => {
  test("4問が見出しとして並び、回答は開いたまま社名から始まり、太字は値だけ", async ({ page }) => {
    const { view, fiscalPeriod } = companyPageData("6861");
    const expected = buildActualsQa(view, fiscalPeriod);
    await page.goto("/company/6861");
    const qa = page.getByTestId("company-qa");

    await expect(qa.getByRole("heading", { level: 2 })).toHaveText(expected.heading);
    await expect(qa).toContainText(expected.note);
    await expect(qa.getByRole("heading", { level: 3 })).toHaveText(
      expected.items.map((item) => item.question)
    );
    // 折りたたまない（1c は採らなかった）。4つとも開いたまま見えている。
    const answers = page.getByTestId("company-qa-list").locator("p");
    await expect(answers).toHaveText(
      expected.items.map(({ answer }) => `${answer.before}${answer.value}${answer.after}`)
    );
    for (const answer of await answers.all()) await expect(answer).toBeVisible();
    await expect(answers.locator("strong")).toHaveText(
      expected.items.map((item) => item.answer.value)
    );

    // 実測値だけの節なので「推定」を置かない（AC-9）。作り替える前の節は残っていない。
    await expect(qa).not.toContainText("推定");
    await expect(page.getByRole("heading", { name: /有価証券報告書の実測値/ })).toHaveCount(0);
  });

  /*
   * 390px では回答が2〜3行に折れる。**値（数字と単位）は行をまたがない**——何もしないと
   * 数字と単位（`歳`・`人`）の間で割れていた（2026-09 時点のジャストシステム 4686 で実測）。
   * `strong` はインライン要素なので、行をまたぐと `getClientRects()` が行の数だけ返る。
   * 横スクロールは上の AC-15 のループ（375px）が見ている。
   *
   * **会社は名指しのまま。** 値が行末に掛かるかは社名と値の桁と字の幅で決まり、データからは
   * 選べない。どちらの会社でも、値が1行に収まることは会社の状態によらず成り立つ。
   */
  test("390px でも回答の値が数字と単位の間で折れない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ["4686", "6861"]) {
      await page.goto(`/company/${id}`);
      const values = page.getByTestId("company-qa-list").locator("strong");
      await expect(values, id).toHaveCount(4);
      const lines = await values.evaluateAll((els) => els.map((el) => el.getClientRects().length));
      expect(lines, id).toEqual([1, 1, 1, 1]);
    }
  });
});
