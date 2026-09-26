import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";

/**
 * C2（Issue #83）で足した節——水準が近い会社・分布・年齢別の表と ±20%・10年推移
 * （timeseries の T1・T2・T3、在籍年数の T4）・このページの出典（C12 で「この数字の作り方」から作り替えた）
 * ——と、C3 以降の見た目の手直しの E2E。
 *
 * C1 で作った表示基準の切替・URL・履歴・初期 HTML は `company-page.spec.ts` にある。
 * **表示基準を切り替えても変わらない節**（推移・説明文・要約と分析・稼ぐ力）は、
 * そちらの AC-3 がまとめて1本で見ている。
 */

/*
 * 節の並び（アートボード 4b・6b・6e・8a / 8b）。**全部の見出しを1本で並べて見る。**
 * 以前は C2 の2巡目（推移は実測値の後ろ）・P2（稼ぐ力は推移の直後）・C10（分析は
 * レーダーの直後、要約は稼ぐ力の後ろ、出典は要約の後ろ）が別々のファイルで隣り合う2つずつを
 * 見ていた。全体を並べれば、どれか1つがずれても落ちる。
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

  test("本文は平均年収カード → レーダー → 分析の順で始まり、見出しが決めた順に並ぶ", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/company/6861");

    expect(await page.locator("h2").allTextContents()).toEqual([
      "公開資料による全体像",
      "株式会社キーエンスの現状と今後",
      "残業・有給・男女の賃金の差異",
      "年齢別の推定年収",
      "平均年収推移（過去10年間）",
      "在籍年数推移（過去10年間）",
      "稼ぐ力の推移（過去10年間）",
      "株式会社キーエンスの有価証券報告書の要約",
      // 実測値の4項目の Q&A は要約の直後・出典の直前（C16・spec AC-34）。C15 までは
      // 「有価証券報告書の実測値（2026年3月期）」として年齢別と推移の間にあった。
      "株式会社キーエンスの年収に関するQ&A",
      "このページの出典",
      // サイドバーは DOM では本文の後ろ。
      "電気機器で水準が近い会社",
    ]);

    // カードは本文の列の最初の子で、レーダーの節はそのすぐ次の兄弟。分析はスロット
    // （`astro-slot`）に包まれて届くので、兄弟ではなく上の見出しの並びで見ている。
    expect(await salaryCard(page).evaluate((el) => el.previousElementSibling === null)).toBe(true);
    const card = await salaryCard(page).elementHandle();
    expect(await radar(page).evaluate((el, c) => el.previousElementSibling === c, card)).toBe(true);

    // 入れ替えた目的そのもの。レーダーが先頭だった頃、金額は上から 954px にあった。
    const amount = (await salaryCard(page).getByText("2,178万円", { exact: true }).boundingBox())!;
    expect(amount.y + amount.height).toBeLessThanOrEqual(800);
  });

  // 横スクロールは下の AC-15 のループ（375px）が見ている。
  test("390px でもカードがレーダーより上にあり、金額が最初の画面に入る", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/company/6861");

    const cardBox = (await salaryCard(page).boundingBox())!;
    const radarBox = (await radar(page).boundingBox())!;
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(radarBox.y);

    // レーダーが先頭だった頃は上から 1,139px。
    const amount = (await salaryCard(page).getByText("2,178万円", { exact: true }).boundingBox())!;
    expect(amount.y + amount.height).toBeLessThanOrEqual(844);
  });
});

test.describe("AC-12 水準が近い会社", () => {
  /*
   * **「本社のみ」は出さない**（運営者の指示）。316px の列にバッジを足すと社名が切れる。
   * キーエンスの10社にはバッジを持つ会社が3社（キオクシア・ソニー・SCREEN）入っているので、
   * 出していれば落ちる。自分を含まないこと・10社に満たない業種は `lib/neighbors.test.ts`。
   */
  test("同業種の10社が企業詳細へのリンクとして並び、業界順位・平均年齢と業種一覧への導線が付く", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const neighbors = page.locator("section", { hasText: "電気機器で水準が近い会社" });

    await expect(neighbors.getByRole("listitem")).toHaveCount(10);
    await expect(neighbors.locator("ul").getByRole("link").first()).toHaveAttribute(
      "href",
      /^\/company\//
    );
    await expect(neighbors.locator("ul")).not.toContainText("株式会社キーエンス");
    await expect(neighbors.getByText("業界2位・平均40.1歳")).toBeVisible();
    await expect(neighbors.getByRole("link", { name: "電気機器193社をすべて見る" })).toHaveAttribute(
      "href",
      /^\/\?ind=/
    );
    await expect(neighbors.getByText("本社のみ")).toHaveCount(0);
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
    await page.goto("/company/6861");

    // 位置バー。**金額ではなく順位から出す**ので、両端も順位で書く。
    await expect(figure(page)).toContainText("全体2,961社の中の位置");
    await expect(figure(page)).toContainText("偏差値 124.8");
    await expect(figure(page)).toContainText("2,961位");
    await expect(figure(page)).toContainText("1位");
    await expect(page.getByText(/中位 [\d,]+万円/)).toBeVisible();

    // 読み上げ用の一覧がヒストグラムの正。9階級ぶんあり、その会社の階級に印が付く。
    const bins = page.getByText(/全2,961社の分布/).locator("xpath=../ul[1]/li");
    await expect(bins).toHaveCount(9);
    await expect(bins.filter({ hasText: "株式会社キーエンスはここ" })).toHaveCount(1);
    // sr-only の一覧とは別に、棒の上にも社数が出ている。
    await expect(figure(page).getByText("327", { exact: true })).toBeVisible();

    /*
     * 両端の階級は外側を吸収する。**それは横軸の目盛（「〜500」「1,200+」）が言っている**ので、
     * 図の説明に同じ断りを重ねない（C14・spec AC-32）。
     */
    await expect(figure(page).getByText("〜500", { exact: true })).toBeVisible();
    await expect(figure(page).getByText("1,200+", { exact: true })).toBeVisible();
    await expect(figure(page).locator("figcaption")).not.toContainText("両端の階級");
  });

  // ラベルが折り返すと軸の高さが階級ごとに変わり、棒の下端が揃わなくなる（公開後に報告あり）。
  test("ヒストグラムの棒の幅が揃い、目盛が1行に収まる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    const { widths, lines } = await figure(page).evaluate((el) => ({
      widths: [...el.querySelectorAll('[role="presentation"] > div')].map(
        (n) => Math.round(n.getBoundingClientRect().width * 10) / 10
      ),
      lines: [...el.querySelectorAll('[role="presentation"] > div > span:last-child')].map(
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

test.describe("AC-14 年齢別の表と推定範囲", () => {
  /*
   * **信頼区間ではない旨は1か所だけ**——表・説明文・チャートは1つの `section` に縦に続くので、
   * 表の caption にも同じ文を置くと一度の視界に断りが2つ並ぶ（Issue #95 で表の caption を
   * 外した）。**帯だけを見ると信頼区間に見える**ので、図の側からは外さない。
   * `/about` 側の断りは `company-page.spec.ts` の「/about への導線」が見ている。
   */
  test("8行の表で推定範囲は ±20%、信頼区間ではない旨はチャートにだけ書き、縦軸は丸い目盛", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const rows = curveSection(page).getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(8);

    const cells = rows.first().locator("td");
    const salary = Number((await cells.nth(1).textContent())!.replace(/[^0-9]/g, ""));
    const range = (await cells.nth(2).textContent())!.replace(/[^0-9〜]/g, "").split("〜");
    expect(Number(range[0])).toBe(Math.round(salary * 0.8));
    expect(Number(range[1])).toBe(Math.round(salary * 1.2));

    await expect(page.getByText("統計的な信頼区間ではありません")).toHaveCount(1);
    await expect(
      page.locator("figcaption", { hasText: "統計的な信頼区間ではありません" })
    ).toBeVisible();
    await expect(page.getByRole("table").locator("caption")).toHaveCount(0);

    // 目盛の値そのものは `lib/stats.test.ts` の `niceTicks`。ここは描かれていることだけ。
    const svg = page.locator("svg").filter({ hasText: "（万円）" });
    await expect(svg.getByText("1,000", { exact: true })).toBeVisible();
  });

  test("年齢別は 表 → 説明文 → チャート の順に並ぶ", async ({ page }) => {
    await page.goto("/company/6861");
    await page.getByRole("button", { name: "年齢そろえ" }).click();

    const table = (await curveSection(page).getByRole("table").boundingBox())!;
    const summary = (await page.getByText("推定年収を年齢別に見ると").boundingBox())!;
    const chart = (await page.getByText("年齢別の推定年収の推移", { exact: true }).boundingBox())!;
    expect(table.y).toBeLessThan(summary.y);
    expect(summary.y).toBeLessThan(chart.y);
  });

  /*
   * C4（Issue #146）。文言の組み立ては `lib/highlights.test.ts` が全社で固定している
   * （到達年齢が表の万円の値で判定されていることも含む）。ここは**描かれた DOM から読み直して**
   * 文と表が食い違わないことと、3文が1つの段落に続くこと（運営者の指示。1文ずつ `<p>` に
   * 分けると、同じ8点の話が3つの話題に見える）を見る。
   *
   * 段落は「年齢別に見ると」で引く——**節の最初の `p` ではない**（C12・#805 で見出しの直下に
   * 年齢補正の1行が入った）。
   */
  test("C4 AC-14: 説明文は到達年齢から始まる3文の1段落で、到達年齢の行は表でもその金額以上", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const paragraph = curveSection(page).locator("p", { hasText: "年齢別に見ると" });
    await expect(paragraph).toHaveCount(1);

    const text = (await paragraph.textContent())!;
    expect(text).toContain(
      "株式会社キーエンスの推定年収を年齢別に見ると、30歳で1,200万円、35歳で2,000万円、50歳で2,500万円に達します。"
    );
    expect(text).toContain("に達します。最も高い水準は");
    expect(text).toContain("です。5歳刻みで比べると");

    const pairs = [...text.matchAll(/(\d+)歳で([\d,]+)万円/g)];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, age, manYen] of pairs) {
      const row = curveSection(page).getByRole("row").filter({ hasText: `${age}歳` }).first();
      const shown = Number((await row.locator("td").nth(1).textContent())!.replace(/[^0-9]/g, ""));
      expect(shown, `${age}歳`).toBeGreaterThanOrEqual(Number(manYen.replace(/,/g, "")));
    }
  });

  /*
   * 年齢別の表の列幅（2026-08-20 の指摘）。年齢の列に `w-36`（144px）を敷いていたため、
   * 狭い器では「25歳」の3文字に必要な倍近くを取り、右の2列——とくに
   * 「1,190万円〜1,785万円」が入る推定範囲——が痩せていた。**器の幅で切る**（`@container`）
   * ので、ビューポート幅ではなくサイドバーを含めた実際の器で確かめる——**768px でも
   * サイドバーがあると器は 396px しかない**。360px はモバイルの最狭。
   */
  test("器が狭いとき（360px・768px）年齢の列は内容ぶんに絞り、推定範囲が1行に収まる", async ({
    page,
  }) => {
    for (const width of [360, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/company/6861");

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
      rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""))
    );
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
  test("10年ぶんの図と表（年度・金額・平均年齢・基準年比）に、出典と増減・最高値の文が付く", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const section = historySection(page);

    const rows = await historyRows(page);
    expect(rows).toHaveLength(10);
    // 基準年（＝最初に値のある年）の行は累積が空。平均年齢は2017年の有報の値。
    expect(rows[0]).toEqual(["2017年", "1,862万円", "36.1歳", ""]);
    expect(rows[9][0]).toBe("2026年");
    expect(rows[1][3]).toMatch(/^[＋−±][\d.]+%$/);
    for (const row of rows) {
      expect(row[1]).toMatch(/^[\d,]+万円$/);
      expect(row[2]).toMatch(/^\d{2}\.\d歳$/);
    }

    // 列は4つで、累積の見出しは基準年を名乗る。**「昇給率」とは呼ばない**（会社の平均が
    // 動いた幅であって個人の昇給ではない）。断りは累積の列に付き、同じ基準年を名乗る。
    expect(await section.getByRole("columnheader").allTextContents()).toEqual([
      "年度",
      "平均年収",
      "平均年齢",
      "2017年比",
    ]);
    await expect(section).toContainText(
      "2017年比は会社の平均が動いた幅で、個人の昇給率ではありません。"
    );

    // 読み上げは表が担う（AC-10）。同じ10件を読み上げる経路を2つ置かない。
    await expect(section.locator("ul.sr-only")).toHaveCount(0);
    await expect(section.getByRole("table")).toHaveCount(1);
    // 棒と年のラベルはグラフ側に残る（4桁の西暦）。
    await expect(section.getByText("2017", { exact: true })).toBeVisible();
    await expect(section.getByText("2026", { exact: true })).toBeVisible();

    // 説明は出典だけ（AC-9）。表示基準と独立であることは値で担保するので、断りを重ねない。
    await expect(section).toContainText("平均年間給与と平均年齢の実測値（提出会社単体）");
    await expect(section).toContainText("横軸は報告書の提出年です。");
    await expect(section.getByText("年齢そろえ")).toHaveCount(0);

    // 増減の1文に、最高値の年を足す（C4・AC-17）。最新年が最高値なら出さないことは
    // `lib/highlights.test.ts` の `buildHistoryPeak`。
    await expect(section).toContainText(/9年で [＋−][\d,]+万円/);
    await expect(section).toContainText("この10年で最も高かったのは2023年の2,279万円です。");
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

  /*
   * 欠け方は2通り。**2117 は途中が欠ける**（2023・2024）——棒は描かれず年のラベルだけが残り、
   * 欠けた年は平均年齢も空。累積は基準年からの比なので、欠損をまたいだ2025年にも出る。
   * **3447 は先頭が欠ける**（2017年が無い）——固定の2017年基準だと累積の列が丸ごと空になるので、
   * 最初に値のある年が基準になり、節の説明も同じ年を名乗る。
   */
  test("T1 AC-7・T2 AC-13: 欠損のある年は「なし」で平均年齢も累積も空、基準年は最初に値のある年", async ({
    page,
  }) => {
    await page.goto("/company/2117");
    const section = historySection(page);
    await expect(section.getByText("なし", { exact: true })).toHaveCount(2);
    await expect(section.getByText("2023", { exact: true })).toBeVisible();
    await expect(section.getByText("2024", { exact: true })).toBeVisible();

    const byYear = new Map((await historyRows(page)).map((row) => [row[0], row]));
    expect(byYear.get("2023年")).toEqual(["2023年", "データなし", "", ""]);
    expect(byYear.get("2025年")![1]).toMatch(/^[\d,]+万円$/);
    expect(byYear.get("2025年")![2]).toMatch(/^\d{2}\.\d歳$/);
    expect(byYear.get("2025年")![3]).toMatch(/^[＋−±][\d.]+%$/);

    await page.goto("/company/3447");
    await expect(historySection(page).getByRole("columnheader", { name: "2018年比" })).toBeVisible();
    await expect(historySection(page)).toContainText("2018年比は会社の平均が動いた幅で");
    const rows = await historyRows(page);
    expect(rows[0]).toEqual(["2017年", "データなし", "", ""]);
    expect(rows[1][2]).toMatch(/^\d{2}\.\d歳$/);
    expect(rows[1][3]).toBe("");
    expect(rows[2][3]).toMatch(/^[＋−±][\d.]+%$/);
  });

  /*
   * T3 AC-16。最新年の行とページ上部のカードは同じ有報の同じ数字。**書式が片方だけ違うと、
   * 同じ値を別の値として読ませる**（丸めはどちらも `formatDecimal1`）。最新年が2026年の
   * 3月期の会社と、2026年の枠が空いて2025年が最新になる8月期の会社（ファーストリテイリング）。
   */
  test("T3 AC-16: 最新年の行の平均年齢がカードの平均年齢と同じ文字列", async ({ page }) => {
    for (const id of ["6861", "9983"]) {
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

const tenureSection = (page: Page) =>
  page.getByRole("heading", { name: "在籍年数推移（過去10年間）" }).locator("xpath=..");

/** 在籍年数の表の各行を「年 / 在籍年数 / 基準年との差」の3セルで読む。 */
async function tenureRows(page: Page): Promise<string[][]> {
  return tenureSection(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""))
    );
}

/*
 * T4（#835・`docs/timeseries/spec.md` 2.7）。在籍年数の折れ線と業種の中央値の点線、表、説明文。
 * 差・説明文の分岐・線の切れ目・ラベルの逃がし方は `lib/tenureHistory.test.ts` が固定しており、
 * ここは実ページでそう描かれることを見る。表示基準と独立であること（AC-22）は
 * `company-page.spec.ts` の AC-3、390px の横スクロールは下の AC-15 のループ。
 */
test.describe("T4 在籍年数推移", () => {
  test("AC-19: 折れ線と業種の中央値の点線、10行の表、説明文が チャート → 表 → 説明文 の順に並ぶ", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const section = tenureSection(page);

    await expect(section).toContainText(
      "各年の有価証券報告書に載った平均勤続年数の実測値（提出会社単体）。点線は電気機器の中央値です。"
    );
    await expect(section).toContainText("縦軸は0から始まりません。");

    const rows = await tenureRows(page);
    expect(rows).toHaveLength(10);
    expect(await section.getByRole("columnheader").allTextContents()).toEqual([
      "年度",
      "在籍年数",
      "2017年との差",
    ]);
    expect(rows[0][2]).toBe("");
    for (const row of rows) expect(row[1]).toMatch(/^\d{1,2}\.\d年$/);
    for (const row of rows.slice(1)) expect(row[2]).toMatch(/^[＋−±]\d+\.\d年$/);

    // 図: 中央値の点線があり、各点に表と同じ値が書かれている。最新年の点の値は太字。
    const chart = section.getByRole("img");
    await expect(chart).toHaveAttribute("aria-label", /電気機器の中央値（点線）。中央値は2017年 [\d.]+年、/);
    await expect(section.getByTestId("tenure-median-line")).toHaveAttribute("d", /^M/);
    await expect(chart.locator("text", { hasText: /^業種の中央値 [\d.]+$/ })).toHaveCount(1);
    const pointLabels = await chart.locator('text[font-weight]').allTextContents();
    expect(pointLabels).toEqual(rows.map((row) => row[1].replace("年", "")));
    await expect(chart.locator('text[font-weight="700"]')).toHaveText(rows[9][1].replace("年", ""));

    // 説明文: 1文目は年・社名・値で閉じ、2文目は中央値との差と最初の年からの動き。
    const summary = section.locator("p", { hasText: "2026年の株式会社キーエンスの平均勤続年数は" });
    await expect(summary).toContainText(`単体（提出会社）で${rows[9][1]}です。電気機器の中央値（`);
    await expect(summary).toContainText(/2017年の[\d.]+年から9年で/);

    const box = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;
    expect((await box(section.locator("figure"))).y).toBeLessThan((await box(section.getByRole("table"))).y);
    expect((await box(section.getByRole("table"))).y).toBeLessThan((await box(summary)).y);
  });

  /*
   * 2117 は途中が欠け（2023・2024。平均年収の推移と同じ年）、3447 は先頭が欠ける（2017年）。
   * 欠けた年は線をつながず、表は「データなし」で差も空、差の基準は最初に値のある年になる。
   */
  test("AC-20: 欠損のある年は線をつながず、表は「データなし」で差も空、基準は最初に値のある年", async ({
    page,
  }) => {
    await page.goto("/company/2117");
    const byYear = new Map((await tenureRows(page)).map((row) => [row[0], row]));
    expect(byYear.get("2023年")).toEqual(["2023年", "データなし", ""]);
    expect(byYear.get("2024年")).toEqual(["2024年", "データなし", ""]);
    expect(byYear.get("2025年")![2]).toMatch(/^[＋−±]\d+\.\d年$/);
    // 会社の線は欠けた年の前後で2本に切れる。点線（中央値）は同業に値があるのでつながる。
    const line = tenureSection(page).getByTestId("tenure-line");
    expect(((await line.getAttribute("d")) ?? "").match(/M/g)).toHaveLength(2);
    const median = tenureSection(page).getByTestId("tenure-median-line");
    expect(((await median.getAttribute("d")) ?? "").match(/M/g)).toHaveLength(1);

    await page.goto("/company/3447");
    await expect(tenureSection(page).getByRole("columnheader", { name: "2018年との差" })).toBeVisible();
    const rows = await tenureRows(page);
    expect(rows[0]).toEqual(["2017年", "データなし", ""]);
    expect(rows[1][2]).toBe("");
  });

  /*
   * 最新年の行と「年収に関するQ&A」（C16）の平均勤続年数の回答は同じ有報の同じ数字（T3 AC-16 の
   * 平均年齢と同じ）。3月期の会社と、2026年の枠が空いて2025年が最新になる8月期の会社。
   */
  test("AC-21: 最新年の行の在籍年数が、Q&A の平均勤続年数の回答と同じ文字列", async ({ page }) => {
    for (const id of ["6861", "9983"]) {
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

test.describe("AC-15 レイアウト", () => {
  /*
   * サイドバーは `md:sticky md:top-4` で画面に貼り付く。**画面より高いと、はみ出した
   * 下端は本文を最後まで下ろすまで見えない**（C11・#799 の前は 6861 で 964px あった）。
   * 水準が近い会社は最大10社なので、10社そろう 6861 で見る。
   *
   * **サイドバーは「水準が近い会社」の1枚だけ**——高さを押し上げていた「この会社の要点」
   * （AC-11）は C11 で外した。生の HTML に無いことは `company-page.spec.ts` の AC-10 が見る。
   */
  test("PC は2カラムで、サイドバーは画面の高さに収まり、スクロールしても最後の1社まで見える", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/company/6861");

    const aside = page.locator("aside");
    expect(await aside.locator("h2").allTextContents()).toEqual(["電気機器で水準が近い会社"]);
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
   * 幅は最も狭い 375px に寄せ、各節が最も長くなる会社を並べる。
   *
   * - 6861: 全節がそろう（レーダー・近傍10社・推移と稼ぐ力の表・説明文・有報への帯）。
   *   **外さないこと**——`company-radar.spec.ts` はキーエンスの横スクロール検査をここに任せて消した
   * - 9413: 社名が長く、年齢別の説明文が最も長くなる（C4）
   * - 8031: 分析に参照した資料が並ぶ（C10）
   */
  test("375px では1カラムで、どの会社でも横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    for (const id of ["6861", "9413", "8031"]) {
      await page.goto(`/company/${id}`);
      await expect(page.getByRole("heading", { level: 1 }), id).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, id).toBeLessThanOrEqual(0);
      expect((await page.locator("aside").boundingBox())!.x, id).toBeLessThan(64);

      // 推移の表は器の中で横に送る作りではない（T2 AC-14・T4 AC-22）。器ごと収まっていること。
      for (const [label, section] of [
        ["推移の表", historySection(page)],
        ["在籍年数の表", tenureSection(page)],
      ] as const) {
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
 * 出ているデータを加工の度合いで6区分に分け、区分ごとに該当するものと出典を並べる。
 * 行の組み立ては `lib/sources.test.ts`、節の有無による出し分け（説明文の無い会社）は
 * `company-summary.spec.ts`、有報のリンク先の書類は `company-filing.spec.ts`。
 */
test.describe("AC-16 このページの出典", () => {
  const sources = (page: Page) => page.getByTestId("company-sources");
  const row = (page: Page, label: string) =>
    sources(page).locator("dl > div", { has: page.locator("dt", { hasText: label }) });

  test("6区分が該当するものと出典を添えて並び、一次情報へのリンクがある", async ({ page }) => {
    await page.goto("/company/6861");

    await expect(sources(page).getByRole("heading", { name: "このページの出典", level: 2 })).toBeVisible();
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

    // キーエンスは説明文・推移・要約と分析をすべて持つ（節の有無がページから渡っている）。
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
    // 3ステップは PC（1280×800）で 260px、モバイル（390×844）で 580px あった（変更前の実測）。
    for (const [viewport, before] of [
      [{ width: 1280, height: 800 }, 260],
      [{ width: 390, height: 844 }, 580],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/company/6861");
      const box = await sources(page).boundingBox();
      expect(box!.height, `${viewport.width}px`).toBeLessThan(before);
    }
  });
});

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
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/company/6861");

    // P1（#167）のレーダーが同じ額を図と指標リストにも出すので、カードの中で引く。
    const amount = (await salaryCard(page).getByText("2,178万円", { exact: true }).boundingBox())!;
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
  test("1段目に平均年齢・従業員数、2段目に業界内順位・全体順位が並び、太字は金額だけで、見出しとの間は4px", async ({ page }) => {
    await page.goto("/company/6861");

    expect(await texts(page, 0, "dt")).toEqual(["平均年齢", "従業員数（単体）"]);
    expect(await texts(page, 0, "dd")).toEqual(["35.0歳", "3,306人"]);
    expect(await texts(page, 1, "dt")).toEqual(["業界内順位", "全体順位"]);
    expect(await texts(page, 1, "dd")).toEqual(["1位 /193社", "3位 /2,961社"]);
    await expect(salaryCard(page)).not.toContainText("在籍年数");
    // 偏差値はカードの中で1回だけ（#831。順位の段にも置くと2回になる）。位置バーの見出しの
    // 隣にあることは AC-13 が見る。
    await expect(salaryCard(page).getByText(/124\.8/)).toHaveCount(1);

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
    const label = (
      await salaryCard(page).getByText("平均年収（有価証券報告書・単体）", { exact: true }).boundingBox()
    )!;
    const amount = (await salaryCard(page).getByText("2,178万円", { exact: true }).boundingBox())!;
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
   * 分布の階級は基準ごとに決め直している（実測値は400万円から、35歳そろえは300万円から）ので、
   * 先頭の階級の文字が変わる。変わらないもの（推移・説明文・要約と分析）は
   * `company-page.spec.ts` の AC-3。
   */
  test("年齢そろえに切り替えると、金額の見出しと2段目と分布の階級が変わり、1段目と金額直下の1文は変わらない", async ({
    page,
  }) => {
    await page.goto("/company/6861");
    const firstBin = page.getByText(/全2,961社の分布/).locator("xpath=../ul[1]/li").first();
    const before = await firstBin.textContent();
    /*
     * 金額の直下は有報の値を言い直す1文（C15・spec 1.4）。**年齢そろえでも同じ文のまま**
     * ——「推定」は見出しが持つ（Issue #128）。文の組み立ては `lib/cardFacts.test.ts`。
     */
    const lead = salaryCard(page).getByText(
      "株式会社キーエンスの最新の有価証券報告書に基づく平均年収は 約2,178万円（平均年齢35.0歳）です。",
      { exact: true }
    );
    await expect(lead).toBeVisible();

    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await expect(salaryCard(page).getByText("35歳時点の推定年収")).toBeVisible();
    await expect(salaryCard(page).getByText("2,178万円", { exact: true })).toBeVisible();
    await expect(lead).toBeVisible();

    expect(await texts(page, 0, "dd")).toEqual(["35.0歳", "3,306人"]);
    expect(await texts(page, 1, "dd")).toEqual(["1位 /193社", "2位 /2,961社"]);
    expect(await firstBin.textContent()).not.toBe(before);
  });

  // 3列だった頃は 93px（1280px）しか無く、折り返すと「38位 /2,961社」が2行になっていた
  // （報告あり）。#831 で2列にして 143px（1280px）・155px（390px）になったが、器を狭める
  // 変更で戻らないように残す。モバイルはカードが1カラムになるが、本文の幅が狭いぶん
  // 1列あたりはほぼ同じになる。
  test("カードの順位と実測値が1行に収まる（1280px・390px）", async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/company/8725");

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
 * 決算期が画面に2回までであることは `data-period.spec.ts`、節の位置は上の「節の並び」、
 * JS 実行前の HTML は `company-page.spec.ts` の AC-10、表示基準で変わらないことは同じファイルの
 * AC-3、FAQPage の JSON-LD を出さないことは `social.spec.ts` の鍵の集合が見ている。
 */
test.describe("AC-34 年収に関するQ&A（C16）", () => {
  test("4問が見出しとして並び、回答は開いたまま社名から始まり、太字は値だけ", async ({ page }) => {
    await page.goto("/company/6861");
    const qa = page.getByTestId("company-qa");

    await expect(qa.getByRole("heading", { level: 2 })).toHaveText("株式会社キーエンスの年収に関するQ&A");
    await expect(qa).toContainText(
      "2026年3月期の有価証券報告書の値です。提出会社（単体）のもので、連結子会社の従業員は入りません。"
    );
    await expect(qa.getByRole("heading", { level: 3 })).toHaveText([
      "株式会社キーエンスの平均年収はいくらですか？",
      "株式会社キーエンスの平均年齢は何歳ですか？",
      "株式会社キーエンスの平均勤続年数は何年ですか？",
      "株式会社キーエンスの従業員数は何人ですか？",
    ]);
    // 折りたたまない（1c は採らなかった）。4つとも開いたまま見えている。
    const answers = page.getByTestId("company-qa-list").locator("p");
    await expect(answers).toHaveText([
      "株式会社キーエンスの平均年収は2,178万円です。",
      "株式会社キーエンスの平均年齢は35.0歳です。",
      "株式会社キーエンスの平均勤続年数は11.3年です。",
      "株式会社キーエンスの従業員数は3,306人です（提出会社単体。連結子会社の従業員は含みません）。",
    ]);
    for (const answer of await answers.all()) await expect(answer).toBeVisible();
    await expect(answers.locator("strong")).toHaveText(["2,178万円", "35.0歳", "11.3年", "3,306人"]);

    // 実測値だけの節なので「推定」を置かない（AC-9）。作り替える前の節は残っていない。
    await expect(qa).not.toContainText("推定");
    await expect(page.getByRole("heading", { name: /有価証券報告書の実測値/ })).toHaveCount(0);
  });

  /*
   * 390px では回答が2〜3行に折れる。**値（数字と単位）は行をまたがない**——何もしないと
   * `38.8` / `歳`、`293` / `人` と割れていた（ジャストシステム 4686 で実測）。`strong` は
   * インライン要素なので、行をまたぐと `getClientRects()` が行の数だけ返る。横スクロールは
   * 上の AC-15 のループ（375px）が見ている。
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
