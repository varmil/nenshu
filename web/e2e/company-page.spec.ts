import type { Page } from "@playwright/test";
import { test, expect } from "./appTest";
import { collectPageRequests } from "./network";
import { industryOf, pickCompany, rowOf, summaries } from "../testing/realData";
import {
  companyAnalysisFor,
  companyFilingDocId,
  companyPageData,
  companyPayPolicyFor,
} from "../features/company/lib/pageData";
import { rankingPageData } from "../features/ranking/lib/pageData";
import { buildActualsQa } from "../features/company/lib/actualsQa";
import { companyBreadcrumb } from "../features/company/lib/breadcrumb";
import { buildCardFacts, buildCardLead } from "../features/company/lib/cardFacts";
import { buildCurveSummary } from "../features/company/lib/highlights";
import { formatDeviation, statsForBasis } from "../features/company/lib/stats";
import { buildTenureChart } from "../features/company/lib/tenureHistory";
import { formatInt, formatManYen, toManYen } from "../features/ranking/lib/format";
import { DEFAULT_TARGET_AGE } from "../features/ranking/lib/urlState";
import { edinetDocumentUrl } from "../lib/data/sources";

/**
 * 企業詳細ページ（C1）の骨格——表示基準の切替・年齢スイッチ・URL と履歴・ID・初期 HTML・
 * ランキングとの行き来。
 *
 * **金額・順位・偏差値の計算の正しさは `features/company/lib/view.test.ts` と
 * `cardFacts.test.ts` が見ている。** ここは操作が画面に届くことを見る。**期待値はいまの
 * データの値を書き写さず、画面と同じデータ組み立て（`companyPageData`）と整形関数から作る**
 * （refresh の D0・#870。毎日の更新で金額も順位も社数も動く）。
 *
 * **`/company/6861?age=35` を直接開く形はもう使えない**（R1・ADR-0012）。企業詳細は
 * 全社を事前生成しており、表示基準は URL に出さずクライアントの状態としてだけ持つ。
 * 「年齢そろえ」の初期値は35歳（`DEFAULT_TARGET_AGE`）。
 */

/**
 * **居ることだけを前提にする会社**（企業 ID は変わらない・ADR-0017）。社名・金額・順位・業種は
 * データから引く。状態（説明文がある・社名が長い 等）を前提にするテストは `pickCompany` で選ぶ。
 */
const KEYENCE = "6861";
const keyence = companyPageData(KEYENCE);

/** HTML のテキストとして書かれた形。社名の `&` 等（「Q&A」も）は escape されて届く。 */
const htmlText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * 表示基準と独立な節をすべて持つ会社（AC-3・AC-10 が各節の中身を見る）。説明文の無い会社・
 * 推移の欠けた会社があるので名指ししない。
 */
const FULL = pickCompany(
  "説明文・要約と分析・3つの推移・在籍年数の業種の中央値がそろった会社",
  ([id]) => {
    const data = companyPageData(id);
    return (
      data.summary !== null &&
      companyAnalysisFor(id) !== null &&
      data.history !== null &&
      data.tenureHistory !== null &&
      buildTenureChart(data.tenureHistory).medianLabel !== null &&
      data.profitHistory !== null &&
      data.profitHistory.income.some((value) => value !== null)
    );
  }
);
const full = companyPageData(FULL);

/**
 * 大カードの順位の段（業界内順位・全体順位）。**何番目かでは引かず、中身で引く**
 * ——C14（#818）で段の並びを変えた。**カードの中に限る**——P1（#167）のレーダーの
 * 指標リストも `dl`。
 */
const card = (page: Page) => page.locator('[data-slot="card"] dl').filter({ hasText: "全体順位" });

/**
 * 平均年収カードそのもの。**金額はカードの中で探す**——同じ金額が年齢別の表にも出ているので、
 * ページ全体で探すとカードが切り替わらなくても表の側で通ってしまう。
 */
const salaryCard = (page: Page) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByText("全体順位", { exact: true }) });

/**
 * 表示基準と独立な節の中身（spec AC-23・AC-30・AC-14・AC-34・timeseries AC-8・AC-22・performance AC-11）。
 * 名前つきで返すので、どれが動いたかが差分に出る。
 */
async function independentSections(page: Page): Promise<Record<string, string | null>> {
  const byHeading = (name: string) =>
    page.getByRole("heading", { name }).locator("xpath=..").textContent();
  return {
    説明文: await page.getByText(full.summary!.text, { exact: true }).textContent(),
    分析: await page.getByTestId("company-analysis").textContent(),
    要約: await page.getByTestId("company-digest").textContent(),
    年齢別の説明文: await page
      .getByRole("heading", { name: "年齢別の推定年収" })
      .locator("xpath=..")
      .locator("p", { hasText: "年齢別に見ると" })
      .textContent(),
    "年収に関するQ&A": await page.getByTestId("company-qa").textContent(),
    平均年収推移: await byHeading("平均年収推移（過去10年間）"),
    在籍年数推移: await byHeading("在籍年数推移（過去10年間）"),
    稼ぐ力の推移: await byHeading("稼ぐ力の推移（過去10年間）"),
  };
}

test.describe("企業詳細ページ", () => {
  /*
   * 既定は実測値（ADR-0007）。**実測値では「推定」の語も推定の断りも出さない**——出すと
   * 有報そのままの数字に推定の体裁を被せることになる（spec AC-9）。**年齢そろえでも
   * 「推定」は1画面に1回**——見出しそのものが「35歳時点の推定年収」なので、隣に「推定」
   * バッジを重ねない（Issue #128）。
   */
  test("AC-1・AC-9: 既定は有報の実測値で「推定」を出さず、年齢そろえでは推定であることと計算方法への導線を出す", async ({
    page,
  }) => {
    await page.goto(`/company/${KEYENCE}`);

    await expect(
      page.getByRole("heading", { name: keyence.view.name, level: 1, exact: true })
    ).toBeVisible();
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
    await expect(
      salaryCard(page).getByText(formatManYen(keyence.view.avgSalary), { exact: true })
    ).toBeVisible();
    // 金額の直下は有報の値を言い直す1文。全体平均との差は置かない（C15・#821）。
    await expect(page.getByText(buildCardLead(keyence.view), { exact: true })).toBeVisible();
    await expect(page.getByText(/全体平均 [\d,]+万円 に対して/)).toHaveCount(0);

    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(page.getByText("35歳時点の推定年収")).toHaveCount(0);
    await expect(page.getByText("推定年収は年齢補正後の推定値です", { exact: false })).toHaveCount(
      0
    );
    await expect(
      page.getByText("実測値モードでは補正を行っていません", { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "計算方法と限界" })).toHaveAttribute(
      "href",
      "/about"
    );

    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByText("推定", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("推定年収は年齢補正後の推定値です", { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "計算方法と限界" })).toHaveAttribute(
      "href",
      "/about"
    );
  });

  /*
   * 実測値のとき年齢スイッチは**消さずに無効化する**（ADR-0007）。消すと切り替えて何が
   * 増えるのか分からない。帯は破線で残り、何のための操作かをヒントで言う。
   */
  test("AC-11: 実測値では年齢の帯が残り、スイッチは無効で、押しても状態が変わらない", async ({
    page,
  }) => {
    await page.goto(`/company/${KEYENCE}`);

    // **`exact` が要る。** W1（#150）の節の説明文が本文で「見せ方」を参照している。
    await expect(page.getByText("見せ方", { exact: true })).toBeVisible();
    // 平均年齢はカードの中にも出ているので、帯のヒントには繰り返さない（Issue #128）。
    await expect(page.getByText("有価証券報告書の数値そのまま", { exact: true })).toBeVisible();
    await expect(page.getByText("「年齢そろえ」のときだけ使います")).toBeVisible();

    const age25 = page.getByRole("button", { name: "25歳" });
    await expect(age25).toBeDisabled();
    await age25.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/company/${KEYENCE}$`));
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
  });

  /*
   * **表示基準と年齢の切替を1本で見る。** 変わるのは推定年収まわり（金額・順位・偏差値）
   * だけで、**基準と独立な節は1文字も動かず、ネットワークも URL も動かない**。
   *
   * 以前は「変わらない」を節ごとに別のテストで確かめていた（説明文 C7 AC-23・要約と分析
   * C10 AC-30・推移 T1 AC-8・稼ぐ力 P2 AC-11・年齢別の説明文 C4 AC-14・近傍 AC-12 の
   * ネットワーク）。どれも同じ操作の後で同じページを見ていたので、ここに寄せた。年収に関する
   * Q&A（C16 AC-34）も同じ並びに足した。
   * 残業・有給・男女の賃金の差異は `company-worklife.spec.ts`、レーダーは `company-radar.spec.ts`。
   */
  test("AC-3: 年齢そろえと年齢スイッチで推定年収だけが変わり、独立な節もネットワークも URL も動かない", async ({
    page,
  }) => {
    const at25 = statsForBasis(full.view, 25);
    const at60 = statsForBasis(full.view, 60);
    await page.goto(`/company/${FULL}`);
    const before = await independentSections(page);
    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    await expect(page.getByRole("button", { name: "25歳" })).toBeEnabled();

    await page.getByRole("button", { name: "25歳" }).click();
    await expect(page.getByText("25歳時点の推定年収")).toBeVisible();
    await expect(
      salaryCard(page).getByText(formatManYen(at25.salary), { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(`偏差値 ${formatDeviation(at25.deviation)}`, { exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "60歳" }).click();
    await expect(page.getByRole("button", { name: "60歳" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(
      salaryCard(page).getByText(formatManYen(at60.salary), { exact: true })
    ).toBeVisible();

    expect(requests).toHaveLength(0);
    await expect(page).toHaveURL(new RegExp(`/company/${FULL}$`));
    expect(await independentSections(page)).toEqual(before);
  });

  /*
   * **上位◯%も、100を超えうる理由の注記も、このページには置かない**（運営者の判断。
   * 2026-08-20 の `d041d01`）。水準は同じ視界にある順位と位置バーで読ませる——
   * **偏差値だけが単独で置かれた画面を作らない**線（glossary）はこれで保たれている。
   * **偏差値は位置バーの見出しの隣に出す**（#831 でカードの順位の段から外した）。
   * 注記そのものはランキングの表・カードの脚注と `/about` に残っており、そちらは
   * `e2e/ranking-refresh.spec.ts` と `e2e/about.spec.ts` が持つ。
   */
  test("AC-2: 偏差値は数字だけを出し、順位と位置バーが同じ視界にある", async ({ page }) => {
    const current = statsForBasis(keyence.view, DEFAULT_TARGET_AGE);
    const rankAll = buildCardFacts(keyence.view, current).standing.find(
      (fact) => fact.label === "全体順位"
    )!;
    await page.goto(`/company/${KEYENCE}`);
    await page.getByRole("button", { name: "年齢そろえ" }).click();

    await expect(
      page.getByText(`偏差値 ${formatDeviation(current.deviation)}`, { exact: true })
    ).toBeVisible();
    // 「上位◯%」は順位を出す2か所（h1 の下の行・カード）で見る。**ページ全体では見ない**
    // ——会社の分析の本文には「上位◯%」を含むものがあり、どの会社がそうかは更新で変わる。
    const heading = page.getByRole("heading", { level: 1 });
    for (const area of [page.locator("header", { has: heading }), salaryCard(page)]) {
      await expect(area).toHaveCount(1);
      await expect(area.getByText(/上位[\d.]+%/)).toHaveCount(0);
    }
    // 注記の言い回しはランキング側で変わりうるので、「100を超える」の一語で見る。
    await expect(page.getByText(/100を超え/)).toHaveCount(0);

    await expect(
      card(page).getByText(`${rankAll.value} ${rankAll.total}`, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(`全体${formatInt(keyence.view.totalCount)}社の中の位置`, { exact: true })
    ).toBeVisible();
  });

  /*
   * 配ってしまった `?age=N` のリンク（R1 より前に共有されたもの）。**読まないが、
   * URL からは落とす**——落とさないと「URLは60歳・画面は実測値」が残り続ける
   * （親 Issue #130 が報告したのはこの形）。`replaceState` なので履歴は増えない。
   */
  test("古い `?age=N` のリンクは実測値で開き、URLから age が落ちる", async ({ page }) => {
    await page.goto(`/company/${KEYENCE}?age=60`);

    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/company/${KEYENCE}$`));
    await expect(page.getByRole("button", { name: "60歳" })).toBeDisabled();
  });

  // 表示基準はクライアントの状態だけで持ち、URL にも履歴にも出さない（ADR-0012）。
  test("表示基準を切り替えても履歴は増えない", async ({ page }) => {
    await page.goto("/about");
    await page.goto(`/company/${KEYENCE}`);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "45歳" }).click();
    await expect(page.getByText("45歳時点の推定年収")).toBeVisible();

    // 2回操作したが履歴は積まれていないので、1度戻れば `/about` に着く。
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });

  /*
   * 実測値には年齢の概念が無いので、折れ線は出しつつどの点も強調しない。**0起点ではない
   * 代わりに各点の金額を数値で併記する**ので、8点ぶんの金額が図の中で読める。
   * **図に添える注記は ±20% の帯の意味だけ**（spec AC-4・2026-08-20 改訂）。その断り
   * （信頼区間ではない）は `company-refresh.spec.ts` の AC-14 が見る。「個人の軌跡ではない」は
   * `/about` に移した。
   */
  test("AC-4: 25〜60歳のチャートが8点ぶんの金額を持ち、選んだ年齢だけを強調する", async ({
    page,
  }) => {
    await page.goto(`/company/${KEYENCE}`);
    const chart = page.getByRole("img", { name: /年齢別の推定年収/ });
    await expect(chart.locator("circle")).toHaveCount(8);
    await expect(chart.locator("circle[r='6']")).toHaveCount(0);
    await expect(page.getByText(/歳を取っていく軌跡/)).toHaveCount(0);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(chart.locator("circle[r='6']")).toHaveCount(1);
    // 8点それぞれの金額（万円の数字だけ）が図の中の文字として出ている。
    const labels = await chart.locator("text").allTextContents();
    for (const stats of keyence.view.byBasis.filter((s) => s.targetAge !== null)) {
      expect(labels, `${stats.targetAge}歳`).toContain(formatInt(toManYen(stats.salary)));
    }
  });

  /*
   * ID は証券コード（上場）かEDINETコード（非上場）（ADR-0006）。一覧に無い ID は
   * ビルド時に生成されないので 404（`docs/runtime/cpu-budget/design.md`）。
   */
  test("AC-5・AC-7: EDINETコードのIDで開け、存在しないIDと旧形式の書類IDは404", async ({
    request,
  }) => {
    const unlisted = pickCompany("EDINETコードを ID にする会社", ([id]) => /^E\d{5}$/.test(id));
    const response = await request.get(`/company/${unlisted}`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(htmlText(rowOf(unlisted)[1]));

    expect((await request.get("/company/s100yfah")).status()).toBe(404);
    expect((await request.get("/company/does-not-exist")).status()).toBe(404);
  });

  /*
   * 単体が連結の10%未満の会社（`hasBadge`）だけ、平均年収の回答に断りが入る。文言と、断りの無い
   * 会社の文は `lib/actualsQa.test.ts`。ここではページが `hasBadge` を Q&A まで渡していることを見る。
   * 2026-09-28 までは社名の隣の「本社のみ」バッジとフッタの注記がこの役だった。
   */
  test("AC-6: 単体が連結の10%未満の会社は、Q&A の平均年収の回答に断りがある", async ({ page }) => {
    const id = pickCompany("単体が連結の10%未満の会社（hasBadge）", (row) => row[8] === 1);
    const { view, fiscalPeriod } = companyPageData(id);
    // 期待する文が断りの入った形であること（ここが偽だと、断りの無い文どうしを比べて通る）。
    expect(view.hasBadge).toBe(true);
    const { answer } = buildActualsQa(view, fiscalPeriod).items[0];
    await page.goto(`/company/${id}`);

    const salaryAnswer = page.getByTestId("company-qa-list").locator("p").first();
    await expect(salaryAnswer).toHaveText(`${answer.before}${answer.value}${answer.after}`);
    // 太字は金額だけ（C16）。断りまで太くしない。
    await expect(salaryAnswer.locator("strong")).toHaveText(answer.value);
  });

  /*
   * **事前生成した HTML に各節の中身が入っている**（R1・ADR-0012）。表示基準は URL に
   * 出さないので、どのURLで開いても HTML は同じ実測値のもの。クライアントの描画待ちに
   * すると、クローラにも読み込みの遅い端末にも届かない（spec 2. SEO）。
   *
   * **1社ぶんの生 HTML を1回取って、節ごとに見る**（以前は C1・C4・C7・C12・C13・P2 の
   * 各ファイルが同じ HTML をそれぞれ取っていた）。要約と分析が props に入っていない
   * （1回ずつしか出ない）ことは `company-analysis.spec.ts` が見る。
   */
  test("AC-10: JS実行前のHTMLに各節の中身が入り、送るのはその会社の1社ぶんだけ（/ には入らない）", async ({
    request,
  }) => {
    const { view, fiscalPeriod, summary } = full;
    const qa = buildActualsQa(view, fiscalPeriod);
    const byAge = view.byBasis.filter((s) => s.targetAge !== null);
    const response = await request.get(`/company/${FULL}`);
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html, "年齢別の折れ線（C1）").toContain("<polyline");
    for (const [label, text] of [
      ["社名", view.name],
      ["実測値の金額（C1）", formatManYen(view.avgSalary)],
      ["年齢別の説明文（C4）", buildCurveSummary(byAge, view.name).join("")],
      // 年収に関するQ&A（C16 AC-34）。回答は値だけが `strong` なので、値を挟んだ前後で見る。
      ["Q&A の見出し（C16）", qa.heading],
      ...qa.items.flatMap(({ question, answer }) => [
        ["Q&A の質問（C16）", question],
        ["Q&A の回答の書き出し（C16）", answer.before],
        ["Q&A の回答の値（C16）", answer.value],
        ["Q&A の回答の結び（C16）", answer.after],
      ]),
      ["説明文（C7 AC-21）", summary!.text],
      ["このページの出典（C12 AC-16）", "このページの出典"],
      ["有報への直リンク（C13 AC-31）", edinetDocumentUrl(companyFilingDocId(FULL))],
      ["有報への直リンクの文言（C13 AC-31）", "この会社の有価証券報告書"],
      ["在籍年数の推移（T4）", "在籍年数推移（過去10年間）"],
      ["在籍年数の業種の中央値（T4）", "業種の中央値"],
      ["稼ぐ力の推移（P2）", "稼ぐ力の推移（過去10年間）"],
      ["稼ぐ力の経常利益（P2）", "億円"],
    ]) {
      expect(html, label).toContain(htmlText(text));
    }

    // 本文の先頭は平均年収カードで、レーダーはその後ろ（C15・spec AC-33）。カードには見出しが
    // 無いので、DOM の上下は `company-refresh.spec.ts` の「節の並び」が見る。
    const cardAt = html.indexOf("平均年収（有価証券報告書・単体）");
    expect(cardAt, "平均年収カード").toBeGreaterThan(-1);
    expect(html.indexOf("公開資料による全体像"), "カード → レーダーの順").toBeGreaterThan(cardAt);

    /*
     * spec が外したと明記している節（AC-11・AC-16）。**生の HTML で見る**——ハイドレーション後の
     * DOM だけだと、サーバーが描いてクライアントが消す形でも通ってしまう。
     */
    expect(html, "この会社の要点（AC-11）").not.toContain("この会社の要点");
    expect(html, "この数字の作り方（AC-16）").not.toContain("この数字の作り方");

    /*
     * **クライアントに渡すのは当該1社ぶんだけ**（AC-23）。`summaries.json` は全社ぶんあり、
     * 丸ごと props に載せるとページの予算を超える。他社の説明文が混じっておらず、出典の1行
     * （説明文と対）が1回だけ。
     */
    const other = pickCompany(
      "説明文のある別の会社",
      ([id]) => id !== FULL && summaries.byId[id] !== undefined
    );
    expect(html, "他社の説明文").not.toContain(htmlText(summaries.byId[other]));
    expect(html.split("をもとに要約").length - 1, "説明文の出典の1行").toBe(1);

    // 企業詳細だけが読むデータは、トップページの HTML に入らない（AC-30・AC-31）。
    const paragraphs = (id: string) =>
      (companyPayPolicyFor(id, rowOf(id)[1])?.open ?? []).flatMap((block) =>
        block.kind === "para" ? [block.text] : []
      );
    const policy = pickCompany(
      "給与の決定方針に段落のある会社",
      ([id]) => paragraphs(id).length > 0
    );
    const top = await (await request.get("/")).text();
    for (const [label, text] of [
      ["書類 ID（C13）", companyFilingDocId(FULL)],
      ["EDINET の閲覧ページ（C13）", "WZEK0040"],
      ["分析の見出し（C10）", "の現状と今後"],
      ["説明文（C7）", htmlText(summary!.text)],
      // 給与の決定方針の原文（C19・AC-36）。
      ["給与の決定方針（C19）", htmlText(paragraphs(policy)[0])],
      ["給与の決定方針の見出し（C19）", "の給与の決定方針"],
    ] as const) {
      expect(top, label).not.toContain(text);
    }
  });

  test("AC-8: ランキングの会社名から企業詳細ページへ遷移できる", async ({ page }) => {
    // `/` の1ページ目の先頭の会社（誰が来るかは更新で変わる）。
    const [first] = rankingPageData(new URLSearchParams()).bootstrap.page.companies;
    await page.goto("/");
    await page.getByRole("link", { name: first.name, exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/company/${first.id}$`));
    await expect(
      page.getByRole("heading", { name: first.name, level: 1, exact: true })
    ).toBeVisible();
  });

  /*
   * パンくずの末尾は現在地なのでリンクにしない（アートボード 4b）。業種はランキングの
   * 業種フィルタへ戻る道（spec 4. で比較表の代わりに決めた導線）。C3 でサイドバーに
   * 「（業種）N社をすべて見る」が増えたため、パンくずのほうを `exact` で指す。
   */
  test("パンくずの末尾は社名でリンクではなく、業種からランキングの業種フィルタへ戻れる", async ({
    page,
  }) => {
    const { name, tse33 } = keyence.view;
    await page.goto(`/company/${KEYENCE}`);
    const nav = page.getByRole("navigation").first();
    await expect(nav).toContainText(name);
    await expect(nav.getByRole("link", { name })).toHaveCount(0);

    await nav.getByRole("link", { name: tse33, exact: true }).click();
    await expect(page).toHaveURL(/[?&]ind=/);
    await expect(page.getByRole("combobox", { name: "業種" })).toContainText(tse33);
  });

  /*
   * パンくずは常に1行で、収まらないぶんは器の中で横に送る。折り返していた頃は 2760 の
   * 社名が 390px で2行目に落ちていた。文書が横にはみ出さないことは
   * `company-refresh.spec.ts` の AC-15 のループが見る（9413 のパンくずも器からはみ出す）。
   *
   * **会社はパンくずの字数で選ぶ。** 375px の器（343px）に 14px の字で、段の名前を合わせて
   * 26字あれば区切りと隙間を足さなくても溢れ、社名が20字までなら社名だけは器に収まる
   * （末尾まで送ったときに社名が切れない）。幅の狭い半角を含む社名は外す。
   */
  test("パンくずは社名が長くても1行に収まり、はみ出すぶんは器の中で横に送れる", async ({
    page,
  }) => {
    const id = pickCompany("パンくずが375pxで1行に収まらず、社名は器に収まる会社", ([id, name]) => {
      const crumbs = companyBreadcrumb({ id, name, tse33: industryOf(id) });
      const chars = crumbs.reduce((sum, crumb) => sum + crumb.name.length, 0);
      return chars >= 26 && name.length <= 20 && !/[\x20-\x7e]/.test(name);
    });
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(`/company/${id}`);
    const nav = page.locator('nav:has([aria-current="page"])');

    // 折り返すと、末尾の社名だけが下の行に落ちる。
    const tops = await nav.evaluate((element) =>
      [...element.children].map((child) => Math.round(child.getBoundingClientRect().top))
    );
    expect(new Set(tops).size).toBe(1);

    // 器からはみ出している（この会社で検査が空振りしていない）。縦には送らない。
    const size = await nav.evaluate((element) => ({
      overflowX: element.scrollWidth - element.clientWidth,
      overflowY: element.scrollHeight - element.clientHeight,
    }));
    expect(size.overflowX).toBeGreaterThan(0);
    expect(size.overflowY).toBeLessThanOrEqual(0);

    // 末尾まで送ると社名が切れずに全部見える（省略記号で切らない）。
    await nav.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveText(rowOf(id)[1]);
    const [navBox, currentBox] = [(await nav.boundingBox())!, (await current.boundingBox())!];
    expect(currentBox.x).toBeGreaterThanOrEqual(navBox.x);
    expect(currentBox.x + currentBox.width).toBeLessThanOrEqual(navBox.x + navBox.width);
    expect(await current.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  });

  /*
   * 企業詳細の断りが指す `/about` の行き先（`/about` の他の中身は `about.spec.ts`）。
   * ±20% の帯が信頼区間ではないことは**図と `/about` の2か所に書く**（CLAUDE.md）。
   * 説明文（C7）と要約・分析（C10）の作り方の節には、企業詳細からアンカーで飛ぶ。
   */
  test("/about に、企業詳細の断りと作り方への導線の行き先がある", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText(/信頼区間ではありません/)).toBeVisible();

    const summary = page.locator("#company-summary");
    await expect(summary.getByRole("heading", { name: "会社の説明文の作り方" })).toBeVisible();
    await expect(summary).toContainText("有価証券報告書");

    const analysis = page.locator("#company-analysis");
    await expect(analysis.getByRole("heading", { name: "要約と分析の作り方" })).toBeVisible();
    await expect(analysis).toContainText("具体的な数値");

    // 給与の決定方針の節の「抜き出し方」から飛んでくる（C19・AC-36）。範囲の判定に生成AIを
    // 使い、文は変えていないこと・改正前の様式の会社には無いこと。
    const payPolicy = page.locator("#pay-policy");
    await expect(
      payPolicy.getByRole("heading", { name: "給与の決定方針の抜き出し方" })
    ).toBeVisible();
    await expect(payPolicy).toContainText("人材戦略に関する基本方針等");
    await expect(payPolicy).toContainText("生成AI");
    await expect(payPolicy).toContainText("2026年3月31日");
  });
});

/**
 * 企業ページを離れて戻ってくる（Issue #108）。**表示基準は URL に出さないので
 * 戻ると実測値に戻る**（R1・ADR-0012）。ランキング側の絞り込み・ページ番号は
 * これまでどおり URL が正で、復元される（`e2e/ranking-url-sync.spec.ts`）。
 */
test.describe("ランキングとの行き来", () => {
  test("年齢そろえにしてランキングへ行き、戻ると実測値で開く", async ({ page }) => {
    await page.goto(`/company/${KEYENCE}`);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();

    await page.getByRole("link", { name: "ランキング" }).first().click();
    await expect(page).toHaveURL(/\/$/);

    await page.goBack();

    await expect(page).toHaveURL(new RegExp(`/company/${KEYENCE}$`));
    await expect(page.getByText("平均年収（有価証券報告書・単体）")).toBeVisible();
  });
});
