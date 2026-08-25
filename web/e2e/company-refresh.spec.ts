import { test, expect, type Page } from "@playwright/test";
import { collectPageRequests } from "./network";

/**
 * C2（Issue #83）で足したもの——この会社の要点・水準が近い会社・分布・年齢別の表と
 * ±20%・10年推移（timeseries の T1）・この数字の作り方——の E2E。
 *
 * C1 で作った数値と表示基準の切替は `company-page.spec.ts` にある。
 */

test.describe("AC-11 この会社の要点", () => {
  test("箇条書きが出て、位置と業界内順位を含む", async ({ page }) => {
    await page.goto("/company/6861");
    const list = page.getByRole("heading", { name: "この会社の要点" }).locator("xpath=../ul");
    await expect(list.getByRole("listitem").first()).toContainText("2,178万円");
    // 括弧に添えるのは偏差値（アートボード 4b）。上位◯%は出さない。
    await expect(list.getByRole("listitem").first()).toContainText("偏差値122.9");
    await expect(list).toContainText("電気機器");
  });

  test("実測値では「推定」の語を出さない（AC-9）", async ({ page }) => {
    await page.goto("/company/6861");
    const list = page.getByRole("heading", { name: "この会社の要点" }).locator("xpath=../ul");
    await expect(list).not.toContainText("推定");
  });

  test("表示基準を切り替えると位置の記述が追随する", async ({ page }) => {
    await page.goto("/company/6861");
    const list = page.getByRole("heading", { name: "この会社の要点" }).locator("xpath=../ul");
    await expect(list).not.toContainText("25歳");

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("group", { name: "目標年齢" }).getByRole("button", { name: "25歳" }).click();
    await expect(list).toContainText("25歳にそろえた推定年収");
  });
});

test.describe("AC-12 水準が近い会社", () => {
  test("同業種の10社が企業詳細へのリンクとして並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "電気機器で水準が近い会社" }).locator("xpath=../ul");
    await expect(section.getByRole("listitem")).toHaveCount(10);
    await expect(section.getByRole("link").first()).toHaveAttribute("href", /^\/company\//);
  });

  test("自分自身が含まれない", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "電気機器で水準が近い会社" }).locator("xpath=../ul");
    await expect(section).not.toContainText("株式会社キーエンス");
  });

  test("表示基準の切替でページ遷移が発生しない", async ({ page }) => {
    await page.goto("/company/6861");
    const requests = collectPageRequests(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  /*
   * 10社に増やした（Issue #195）ぶん、節が縦に伸びる。行の構造は5社の頃と同じなので
   * 横には広がらないはずだが、器（PCは316pxの右カラム）が変わっていないことを
   * モバイル幅で固定しておく。社名は `truncate` で切れる前提。
   */
  test("10行に増えても390pxで横スクロールを起こさない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/company/6861");
    const section = page.locator("section", { hasText: "電気機器で水準が近い会社" });
    await expect(section.getByRole("listitem")).toHaveCount(10);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 空運業は5社しかない。上限に届かない業種では自分を除いた社数だけ並ぶ。
  test("10社に満たない業種ではその社数だけ並ぶ", async ({ page }) => {
    await page.goto("/company/9202");
    const section = page.getByRole("heading", { name: "空運業で水準が近い会社" }).locator("xpath=../ul");
    await expect(section.getByRole("listitem")).toHaveCount(4);
  });
});

test.describe("AC-13 分布の中での位置", () => {
  test("中位の印と9ビンのヒストグラムが出る", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page.getByText(/中位 [\d,]+万円/)).toBeVisible();
    // 読み上げ用の一覧がヒストグラムの正。9階級ぶんある。
    const bins = page.getByText(/全1,867社の分布/).locator("xpath=../ul[1]/li");
    await expect(bins).toHaveCount(9);
    await expect(bins.filter({ hasText: "株式会社キーエンスはここ" })).toHaveCount(1);
  });

  test("表示基準を切り替えると階級が変わる", async ({ page }) => {
    await page.goto("/company/6861");
    const bins = () => page.getByText(/全1,867社の分布/).locator("xpath=../ul[1]/li");
    const before = await bins().first().textContent();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page.getByRole("button", { name: "25歳" }).click();
    const after = await bins().first().textContent();
    expect(after).not.toBe(before);
  });
});

test.describe("AC-14 年齢別の表と推定範囲", () => {
  test("8行の表があり、推定範囲が ±20% になっている", async ({ page }) => {
    await page.goto("/company/6861");
    // 推移の表（T2）も同じページに居るので、年齢別の節に絞る。
    const rows = page
      .getByRole("heading", { name: "年齢別の推定年収" })
      .locator("xpath=..")
      .getByRole("table")
      .locator("tbody tr");
    await expect(rows).toHaveCount(8);

    const cells = rows.first().locator("td");
    const salary = Number((await cells.nth(1).textContent())!.replace(/[^0-9]/g, ""));
    const range = (await cells.nth(2).textContent())!.replace(/[^0-9〜]/g, "").split("〜");
    expect(Number(range[0])).toBe(Math.round(salary * 0.8));
    expect(Number(range[1])).toBe(Math.round(salary * 1.2));
  });

  /*
   * ここを信頼区間として書いたら、この基準を逆向きに壊す。**ただし1か所だけ**——
   * 表・説明文・チャートは1つの `section` に縦に続くので、表の caption にも同じ文を
   * 置くと一度の視界に断りが2つ並ぶ（Issue #95 で表の caption を外した）。
   */
  test("信頼区間ではない旨が年齢別のチャートにある", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(page.getByText("統計的な信頼区間ではありません")).toHaveCount(1);
    const figcaption = page.locator("figcaption", { hasText: "統計的な信頼区間ではありません" });
    await expect(figcaption).toBeVisible();
    // 表の側には残っていない（同じ断りを2つ描かない）。
    await expect(page.getByRole("table").locator("caption")).toHaveCount(0);
  });

  test("/about にも同じ断りがある", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText(/信頼区間ではありません/)).toBeVisible();
  });
});

/*
 * 推移の節の当たり判定は**表の行**に寄せてある（T2・Issue #138）。T1 の頃はグラフが
 * 持っていた `ul.sr-only` を見ていたが、同じ10件を読み上げる経路を2つ置かないために
 * 落とした——AC-10 は表が担う。
 */
const historySection = (page: Page) =>
  page.getByRole("heading", { name: "平均年収推移（過去10年間）" }).locator("xpath=..");

/** 推移の表の各行を「年 / 金額 / 前年比 / 基準年比」の4セルで読む。 */
async function historyRows(page: Page): Promise<string[][]> {
  return historySection(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""))
    );
}

test.describe("T1 平均年収推移（10年）", () => {
  test("AC-6: 10年ぶんの棒と年ラベル、金額、増減の文が出る", async ({ page }) => {
    await page.goto("/company/6861");
    const section = historySection(page);
    const rows = await historyRows(page);
    expect(rows).toHaveLength(10);
    expect(rows[0][0]).toBe("2017年");
    expect(rows[9][0]).toBe("2026年");
    await expect(section).toContainText(/9年で [＋−][\d,]+万円/);
    // 棒と年のラベルはグラフ側に残っている。
    await expect(section.getByText("2026", { exact: true })).toBeVisible();
  });

  /*
   * AC-8。年齢そろえを選んでも過去の有報に載った数字は変わらない。ここが動いたら
   * 「表示基準ごとに別物」と「基準と独立」を取り違えている。
   */
  test("AC-8: 表示基準を切り替えても推移の値が変わらない", async ({ page }) => {
    await page.goto("/company/6861");
    const before = await historyRows(page);

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    expect(await historyRows(page)).toEqual(before);
  });

  test("AC-9: 実測値・提出会社単体であることが書かれている", async ({ page }) => {
    await page.goto("/company/6861");
    const section = historySection(page);
    await expect(section).toContainText("実測値");
    await expect(section).toContainText("提出会社単体");
  });

  test("AC-7: 欠損のある年は「なし」と出て、年のラベルは残る", async ({ page }) => {
    // 2117 は2023・2024の値を持たない。棒は描かれず、年のラベルだけが残る。
    await page.goto("/company/2117");
    const section = historySection(page);
    await expect(section.getByText("なし", { exact: true })).toHaveCount(2);
    await expect(section.getByText("2023", { exact: true })).toBeVisible();
    await expect(section.getByText("2024", { exact: true })).toBeVisible();
  });
});

/*
 * T2 推移の表（Issue #138・`docs/timeseries/spec.md` 2.5）。グラフと同じ10年ぶんを
 * 数表でも出す。**前年比は直前の年に値があるときだけ**、**累積の基準はその会社で
 * 最初に値のある年**——欠損の扱いがこの表の正しさのほぼ全部になる。
 */
test.describe("T2 推移の表", () => {
  test("AC-12: 10行の表に年度・金額・前年比・基準年比が並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    const rows = await historyRows(page);
    expect(rows).toHaveLength(10);

    // 基準年（＝最初に値のある年）の行は前年比も累積も空。
    expect(rows[0]).toEqual(["2017年", "1,862万円", "", ""]);
    expect(rows[1][2]).toMatch(/^[＋−±][\d.]+%$/);
    expect(rows[1][3]).toMatch(/^[＋−±][\d.]+%$/);
    for (const row of rows) expect(row[1]).toMatch(/^[\d,]+万円$/);

    // 見出しは基準年を名乗る。「昇給率」とは呼ばない（会社の平均が動いた幅であって
    // 個人の昇給ではない）。
    const section = historySection(page);
    await expect(section.getByRole("columnheader", { name: "2017年比" })).toBeVisible();
    await expect(section.getByRole("columnheader", { name: "前年比" })).toBeVisible();
    await expect(section.getByRole("columnheader", { name: /昇給率/ })).toHaveCount(0);
    await expect(section).toContainText("個人の昇給率ではありません");
  });

  test("AC-13: 飛び年をまたぐ前年比は出さない", async ({ page }) => {
    // 2117 は2023・2024が欠損。2025年は「前年比」を持たないが、累積は基準年からなので出る。
    await page.goto("/company/2117");
    const rows = await historyRows(page);
    const byYear = new Map(rows.map((row) => [row[0], row]));

    expect(byYear.get("2023年")![1]).toBe("データなし");
    expect(byYear.get("2023年")![2]).toBe("");
    expect(byYear.get("2023年")![3]).toBe("");
    expect(byYear.get("2025年")![1]).toMatch(/^[\d,]+万円$/);
    expect(byYear.get("2025年")![2]).toBe("");
    expect(byYear.get("2025年")![3]).toMatch(/^[＋−±][\d.]+%$/);
    expect(byYear.get("2026年")![2]).toMatch(/^[＋−±][\d.]+%$/);
  });

  test("AC-13: 2017年が無い会社は最初に値のある年が基準になる", async ({ page }) => {
    // 3447 は2017年の値を持たない。固定の2017年基準だと累積の列が丸ごと空になる。
    await page.goto("/company/3447");
    const section = historySection(page);
    await expect(section.getByRole("columnheader", { name: "2018年比" })).toBeVisible();

    const rows = await historyRows(page);
    expect(rows[0][1]).toBe("データなし");
    expect(rows[1][2]).toBe("");
    expect(rows[1][3]).toBe("");
    expect(rows[2][3]).toMatch(/^[＋−±][\d.]+%$/);
  });

  test("AC-14: 390px で表が横スクロールを起こさない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/company/6861");

    const overflow = await historySection(page)
      .locator("table")
      .evaluate((el) => {
        const container = el.parentElement!;
        return {
          table: el.scrollWidth - container.clientWidth,
          doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    expect(overflow.table).toBeLessThanOrEqual(0);
    expect(overflow.doc).toBeLessThanOrEqual(0);
  });

  /*
   * 並びは **チャート → 表 → 説明文**（運営者の指示）。年齢別の推定年収は逆に表が先なので、
   * 片方を直したつもりでもう片方が付いてくる事故をここで止める。
   */
  test("推移は チャート → 表 → 説明文 の順に並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    const section = historySection(page);

    const chart = (await section.locator("figure").boundingBox())!;
    const table = (await section.getByRole("table").boundingBox())!;
    const summary = (await section.getByText(/9年で [＋−]/).boundingBox())!;
    expect(chart.y).toBeLessThan(table.y);
    expect(table.y).toBeLessThan(summary.y);
  });

  test("AC-10: 表がグラフの読み上げ一覧を置き換えている", async ({ page }) => {
    await page.goto("/company/6861");
    // 同じ10件を読み上げる経路を2つ置かない。
    await expect(historySection(page).locator("ul.sr-only")).toHaveCount(0);
    await expect(historySection(page).getByRole("table")).toHaveCount(1);
  });
});

test.describe("AC-15 レイアウト", () => {
  test("PC は2カラムで、サイドバーがスクロールしても残る", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/company/6861");

    const aside = page.locator("aside");
    const before = await aside.boundingBox();
    expect(before!.x).toBeGreaterThan(640);

    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(200);
    const after = await aside.boundingBox();
    expect(after!.y).toBeGreaterThan(before!.y - 1500);
  });

  test("390px では1カラムで、横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/company/6861");

    const aside = await page.locator("aside").boundingBox();
    expect(aside!.x).toBeLessThan(64);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("AC-16 この数字の作り方", () => {
  test("3ステップと計算方法への導線がある", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.getByRole("heading", { name: "この数字の作り方" }).locator("xpath=..");
    await expect(section.getByRole("listitem")).toHaveCount(3);
    await expect(section.getByRole("link", { name: "計算方法" })).toHaveAttribute("href", "/about");
  });
});

test.describe("パンくずと見出し", () => {
  test("パンくずの末尾が社名で、リンクではない", async ({ page }) => {
    await page.goto("/company/6861");
    const nav = page.getByRole("navigation").first();
    await expect(nav).toContainText("株式会社キーエンス");
    await expect(nav.getByRole("link", { name: "株式会社キーエンス" })).toHaveCount(0);
  });

  test("h1 の直下に業界内順位と全体順位が出る", async ({ page }) => {
    await page.goto("/company/6861");
    // モックの言い回し。上位◯%は添えない（運営者の指示）。
    await expect(page.getByText("電気機器 ・業界150社中1位 ・全体1,867社中1位")).toBeVisible();
  });
});

/*
 * C3（Issue #89）でモックに合わせ直した見た目。**機能ではなく形**を固定する。
 * 変えるときは `docs/company/company-mock-alignment/design.md` の対照表も直すこと。
 */
test.describe("C3 モックとの一致", () => {
  test("上部カードは2カラムで、左に金額、右に位置バーと分布が並ぶ", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    // カードの中の金額。P1（#167）のレーダーが同じ額を図と指標リストにも
    // 出すので、ページ全体から探すとそちらを掴む。
    const card = page.locator('[data-slot="card"]').first();
    const amount = card.getByText("2,178万円", { exact: true }).first();
    const distribution = card.locator("figure").first();
    const amountBox = (await amount.boundingBox())!;
    const figureBox = (await distribution.boundingBox())!;

    // 右にいる（左端が金額より右）かつ、縦にはほぼ同じ高さから始まる。
    expect(figureBox.x).toBeGreaterThan(amountBox.x + amountBox.width);
    expect(Math.abs(figureBox.y - amountBox.y)).toBeLessThan(220);
  });

  test("カードの中に平均年齢・在籍年数・従業員数が並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    // カードの中の2つ目。P1 がページ先頭に置いた指標リストも `dl` なので絞る。
    const stats = page.locator('[data-slot="card"] dl').nth(1);
    await expect(stats).toContainText("35.0歳");
    await expect(stats).toContainText("11.3年");
    await expect(stats).toContainText("3,306人");
  });

  test("位置バーの両端が順位で書かれている", async ({ page }) => {
    await page.goto("/company/6861");
    const figure = page.locator("figure").first();
    await expect(figure).toContainText("1,867位");
    await expect(figure).toContainText("1位");
    await expect(figure).toContainText("中位");
  });

  test("ヒストグラムの各階級に社数が出る", async ({ page }) => {
    await page.goto("/company/6861");
    // 9本ぶんの数字が棒の上に出ている（sr-only の一覧とは別に、目で読める形で）。
    const figure = page.locator("figure").first();
    await expect(figure.getByText("144", { exact: true })).toBeVisible();
  });

  test("年齢別は 表 → 説明文 → チャート の順に並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    await page.getByRole("button", { name: "年齢そろえ" }).click();

    const table = page
      .getByRole("heading", { name: "年齢別の推定年収" })
      .locator("xpath=..")
      .getByRole("table");
    const summary = page.getByText("推定年収を年齢別に見ると");
    const chart = page.getByText("年齢別の推定年収の推移", { exact: true });

    const tableBox = (await table.boundingBox())!;
    const summaryBox = (await summary.boundingBox())!;
    const chartBox = (await chart.boundingBox())!;
    expect(tableBox.y).toBeLessThan(summaryBox.y);
    expect(summaryBox.y).toBeLessThan(chartBox.y);
  });

  // 説明文は数値から機械的に導ける事実だけ（spec 1.11 と同じ線）。
  test("説明文が最高水準の年齢と伸びの最大区間を述べる", async ({ page }) => {
    await page.goto("/company/6861");
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    // C4 で到達年齢の文が1文目に入り、最高水準は2文目になった（#146）。
    await expect(page.getByText("最も高い水準は55歳の2,699万円")).toBeVisible();
    await expect(page.getByText("25歳から30歳の伸びが最も大きく")).toBeVisible();
    /*
     * 末尾（60歳）が下がる会社だが、下がる理由は書かない（Issue #95）。補正の
     * 仕組みの説明であって、この会社の数値から導ける事実ではないため。
     */
    await expect(page.getByText("定年前後")).toHaveCount(0);
  });

  test("チャートの縦軸が丸い目盛になっている", async ({ page }) => {
    await page.goto("/company/6861");
    const svg = page.locator("svg").filter({ hasText: "（万円）" });
    // C2 は 422 / 1,430 / 2,439 / 3,448 というデータ由来の端数を出していた。
    await expect(svg.getByText("1,000", { exact: true })).toBeVisible();
    await expect(svg.getByText("3,000", { exact: true })).toBeVisible();
  });

  test("推移の横軸は4桁の西暦", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.locator("section", { hasText: "平均年収推移（過去10年間）" });
    await expect(section.getByText("2017", { exact: true })).toBeVisible();
    await expect(section.getByText("2026", { exact: true })).toBeVisible();
  });

  test("水準が近い会社に業界順位と平均年齢、業種一覧への導線が付く", async ({ page }) => {
    await page.goto("/company/6861");
    const neighbors = page.locator("section", { hasText: "電気機器で水準が近い会社" });
    await expect(neighbors.getByText("業界2位・平均43.1歳")).toBeVisible();
    await expect(
      neighbors.getByRole("link", { name: "電気機器150社をすべて見る" })
    ).toHaveAttribute("href", /^\/\?ind=/);
  });

  test("見せ方の帯にラベルと説明文が付いている", async ({ page }) => {
    await page.goto("/company/6861");
    // **`exact` が要る。** W1（#150）が足した節の説明文が「上の『見せ方』とは
    // 関係なく」と本文で帯を参照しており、部分一致だと2要素に当たる。
    await expect(page.getByText("見せ方", { exact: true })).toBeVisible();
    // 平均年齢はカードの中にも出ているので、帯のヒントには繰り返さない（Issue #128）。
    await expect(page.getByText("有価証券報告書の数値そのまま", { exact: true })).toBeVisible();
    // 実測値でも年齢スイッチは残る（AC-11）。
    await expect(page.getByText("「年齢そろえ」のときだけ使います")).toBeVisible();
  });
});

/*
 * 公開後の指摘（2026-08-20）で直したもの。
 * `docs/company/company-mock-alignment/design.md` の「公開後に直したもの」に対応する。
 */
test.describe("公開後の手直し", () => {
  test("年齢別の表の器が縦スクロールを持たない", async ({ page }) => {
    await page.goto("/company/6861");
    const overflowY = await page
      .locator('[data-slot="table-container"]')
      .first()
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(["visible", "hidden", "clip"]).toContain(overflowY);
  });

  // 110px ほどの列に収める必要がある。折り返すと「38位 /1,867社」が2行になる（報告あり）。
  test("カードの順位と実測値が1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/8725");

    const cardLists = page.locator('[data-slot="card"] dl');
    for (const dl of [cardLists.nth(0), cardLists.nth(1)]) {
      const overflow = await dl.evaluate((el) =>
        [...el.querySelectorAll("dt, dd")].map((n) => n.scrollWidth - n.clientWidth)
      );
      for (const value of overflow) expect(value).toBeLessThanOrEqual(0);
    }
  });

  test("位置バーに見出しと偏差値が出る", async ({ page }) => {
    await page.goto("/company/6861");
    const figure = page.locator("figure").first();
    await expect(figure).toContainText("全体1,867社の中の位置");
    await expect(figure).toContainText("偏差値 122.9");
  });

  // ラベルが折り返すと軸の高さが階級ごとに変わり、棒の下端が揃わなくなる（報告あり）。
  test("ヒストグラムの棒の幅が揃い、目盛が1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    const widths = await page
      .locator("figure")
      .first()
      .evaluate((el) =>
        [...el.querySelectorAll('[role="presentation"] > div')].map(
          (n) => Math.round(n.getBoundingClientRect().width * 10) / 10
        )
      );
    expect(widths).toHaveLength(9);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);

    const lines = await page
      .locator("figure")
      .first()
      .evaluate((el) =>
        [...el.querySelectorAll('[role="presentation"] > div > span:last-child')].map(
          (n) => n.getClientRects().length
        )
      );
    for (const count of lines) expect(count).toBe(1);
  });

  test("水準が近い会社に「本社のみ」バッジを出さない", async ({ page }) => {
    await page.goto("/company/6861");
    const neighbors = page.locator("section", { hasText: "電気機器で水準が近い会社" });
    await expect(neighbors.getByText("本社のみ")).toHaveCount(0);
  });
});

/*
 * 公開後の指摘（2巡目）。チャートまわりの3点。
 *
 * - 折れ線の文字がPCで大きすぎた（viewBoxの拡大に文字も乗るため実効20px）
 * - 推移の節が「有価証券報告書の実測値」より上にあった（アートボード 4b では下）
 * - どちらのチャートも縦が薄かった
 */
test.describe("公開後の手直し（2巡目・チャート）", () => {
  test("推移の節は「有価証券報告書の実測値」より後ろにある", async ({ page }) => {
    await page.goto("/company/6861");
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim() ?? "")
    );
    // 見出しには決算期が付く（S3・Issue #134）ので前方一致で探す。
    const raw = headings.findIndex((h) => h.startsWith("有価証券報告書の実測値"));
    const history = headings.indexOf("平均年収推移（過去10年間）");
    expect(raw).toBeGreaterThanOrEqual(0);
    expect(history).toBeGreaterThan(raw);
  });

  // 表示基準と独立であることは値で担保する（AC-8）。断り書きは節の説明から外した。
  test("推移の説明は出典だけで、表示基準の断りを重ねない", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.locator("section", { hasText: "平均年収推移（過去10年間）" });
    await expect(section).toContainText("実測値（提出会社単体）");
    await expect(section.getByText("年齢そろえ")).toHaveCount(0);
    await expect(section).toContainText("横軸は報告書の提出年です。");
  });

  /*
   * 文字の大きさは**器の幅**で決まる。SVGはviewBoxごと拡大縮小するので、
   * user unit をそのまま読んでも実効の大きさは分からない——倍率を掛けて測る。
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

  test("推移の棒はPCで高さを持ち、年のラベルが棒と揃う", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");
    // 稼ぐ力の推移（P2）が同じ `YearlyBarChart` を使うので、節で絞ってから figure を取る。
    const figure = page
      .locator("section", { hasText: "平均年収推移（過去10年間）" })
      .locator("figure");

    const bars = figure.locator('[role="presentation"]').first();
    expect((await bars.boundingBox())!.height).toBeGreaterThanOrEqual(120);

    // 棒と年ラベルは別の行なので、割り付けが違うと1本ずつずれる。
    const [barX, yearX] = await figure.evaluate((el) => {
      const rows = el.querySelectorAll('[role="presentation"]');
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

/*
 * 年齢別の表の列幅（2026-08-20 の指摘）。年齢の列に `w-36`（144px）を敷いていたため、
 * 狭い器では「25歳」の3文字に必要な倍近くを取り、右の2列——とくに
 * 「1,190万円〜1,785万円」が入る推定範囲——が痩せていた。**器の幅で切る**（`@container`）
 * ので、ビューポート幅ではなくサイドバーを含めた実際の器で確かめる——768px でも
 * サイドバーがあると器は 396px しかない。
 */
test.describe("年齢別の表の列幅", () => {
  const columns = (page: import("@playwright/test").Page) =>
    page
      .getByRole("table")
      .filter({ hasText: "推定範囲" })
      .first()
      .evaluate((table) => {
        const th = [...table.querySelectorAll("th")];
        return {
          age: th[0].getBoundingClientRect().width,
          range: th[2].getBoundingClientRect().width,
          container: (table.parentElement as HTMLElement).clientWidth,
          // 折り返さずに収まっているか（`whitespace-nowrap` なので溢れれば scrollWidth が伸びる）。
          overflow: Math.max(
            ...[...table.querySelectorAll("td")].map((n) => n.scrollWidth - n.clientWidth)
          ),
        };
      });

  for (const width of [360, 375, 768]) {
    test(`器が狭いとき（${width}px）年齢の列は内容ぶんに絞る`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/company/6861");

      const { age, range, container, overflow } = await columns(page);
      expect(container).toBeLessThan(448); // @md 未満であることの確認（前提が崩れたら気づく）
      expect(age).toBeLessThanOrEqual(72);
      expect(range).toBeGreaterThan(age * 2);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("器が広ければ元の幅に戻る", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    const { age, container } = await columns(page);
    expect(container).toBeGreaterThanOrEqual(448);
    expect(age).toBe(144);
  });
});

/*
 * C4（Issue #146・親 #145）。3つの節に、数値から機械的に導ける地の文を置いた。
 *
 * - 年齢別: 到達年齢（「30歳で600万円、35歳で700万円…に達します」）
 * - 実測値: 4項目を1文にした地の文
 * - 推移: 最高値の年（最新年が最高値でない会社だけ）
 */
test.describe("C4 説明文の強化", () => {
  const curveSummary = (page: Page) =>
    page.getByRole("heading", { name: "年齢別の推定年収" }).locator("xpath=..");

  test("AC-14: 年齢別の説明文が到達年齢を述べる", async ({ page }) => {
    await page.goto("/company/6861");
    await expect(curveSummary(page)).toContainText(
      "株式会社キーエンスの推定年収を年齢別に見ると、30歳で1,200万円、35歳で2,000万円、50歳で2,500万円に達します。"
    );
  });

  /*
   * **文の金額と表の金額が食い違わないこと。** 判定を円のまま行うと、表が「600万円」と
   * 描いている行を文が数えない（`toManYen` に寄せた理由）。表の同じ年齢の行を引いて確かめる。
   */
  test("AC-14: 到達年齢の行は表でもその金額以上になっている", async ({ page }) => {
    await page.goto("/company/9020");
    const section = curveSummary(page);
    const sentence = (await section.locator("p").first().textContent())!;
    const pairs = [...sentence.matchAll(/(\d+)歳で([\d,]+)万円/g)];
    expect(pairs.length).toBeGreaterThan(0);

    for (const [, age, manYen] of pairs) {
      const row = section.getByRole("row").filter({ hasText: `${age}歳` }).first();
      const shown = Number((await row.locator("td").nth(1).textContent())!.replace(/[^0-9]/g, ""));
      expect(shown).toBeGreaterThanOrEqual(Number(manYen.replace(/,/g, "")));
    }
  });

  // 8点の推定カーブは表示基準に依らないので、説明文も変わらない。
  test("AC-14: 表示基準を切り替えても年齢別の説明文は変わらない", async ({ page }) => {
    await page.goto("/company/6861");
    const first = curveSummary(page).locator("p").first();
    const before = await first.textContent();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(page.getByText("35歳時点の推定年収")).toBeVisible();
    expect(await first.textContent()).toBe(before);
  });

  /*
   * 3文は1つの段落として続ける（運営者の指示）。1文ずつ `<p>` に分けると、
   * どれも同じ8点の話なのに3つの話題が並んでいるように見える。
   */
  test("AC-14: 説明文の3文は1つの段落に続く", async ({ page }) => {
    await page.goto("/company/6861");
    const paragraph = curveSummary(page).locator("p", { hasText: "に達します" });
    await expect(paragraph).toHaveCount(1);
    const text = (await paragraph.textContent())!;
    expect(text).toContain("に達します。最も高い水準は");
    expect(text).toContain("です。5歳刻みで比べると");
  });

  test("AC-17: 実測値の節に4項目を述べる地の文がある", async ({ page }) => {
    await page.goto("/company/6861");
    const section = page.locator("section", { hasText: "有価証券報告書の実測値" });
    await expect(section).toContainText(
      "有価証券報告書によると、株式会社キーエンスの平均年収は2,178万円、平均年齢は35.0歳、平均勤続年数は11.3年、従業員数は3,306人です。"
    );
    // 決算期は見出しが持っている（S3）。地の文には重ねない。
    await expect(section.getByText(/\d+年\d+月期/)).toHaveCount(1);
  });

  test("AC-17: 推移の説明に最高値の年が入る", async ({ page }) => {
    // キーエンスの最高値は2023年（最新の2026年ではない）。
    await page.goto("/company/6861");
    await expect(historySection(page)).toContainText(
      "この10年で最も高かったのは2023年の2,279万円です。"
    );
  });

  // 最新年が最高値の会社では書かない（増減の1文が同じ数字を出しているため）。
  test("AC-17: 最新年が最高値なら最高値の文を出さない", async ({ page }) => {
    await page.goto("/company/9020");
    await expect(historySection(page).getByText("最も高かったのは")).toHaveCount(0);
  });

  // 説明文はサーバーが出す。クライアントの描画待ちにしない（spec 2. SEO）。
  test("説明文は初期HTMLに入っている", async ({ request }) => {
    const html = await (await request.get("/company/6861")).text();
    expect(html).toContain("30歳で1,200万円");
    expect(html).toContain("平均勤続年数は11.3年");
  });

  test("390px で説明文が横スクロールを起こさない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // 社名の長い会社（文が最も長くなる）。
    await page.goto("/company/9413");
    await expect(curveSummary(page).locator("p").first()).toContainText("に達します");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
