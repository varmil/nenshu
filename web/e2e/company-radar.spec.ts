import { test, expect } from "./appTest";
import type { Page } from "@playwright/test";
import { collectPageRequests } from "./network";
import {
  companies,
  industryOf,
  pickCompany,
  pickMaxCompany,
  rowIndexOf,
  worklife,
} from "../testing/realData";
import { companyPageData } from "../features/company/lib/pageData";
import {
  buildRadarAxes,
  unitPickNote,
  type RadarAxis,
  type RadarAxisKey,
} from "../features/company/lib/radar";
import { statsForBasis } from "../features/company/lib/stats";
import { formatDecimal1, formatManYen } from "../features/ranking/lib/format";
import type { TargetAge } from "../features/ranking/types";
import { shortIndustryLabel } from "../lib/data/industry";
import { decodeWorklife } from "../lib/data/worklife";
import { htmlText } from "./html";

/**
 * P1（Issue #167）——企業詳細ページのレーダーチャート「公開資料による全体像」。
 * `docs/performance/spec.md` の AC-6〜AC-9・AC-11 と、`docs/worklife/spec.md` の
 * AC-13・AC-14・AC-17（W2・W3 で図に効いたもの）に対応する。
 *
 * 軸の値・順位・断りの文言は `features/company/lib/radar.test.ts` と
 * `pipeline/scripts/build-data.test.ts` が固定しているので、ここは**ブラウザでどう
 * 出るか**（欠測軸の頂点が無いこと・表示基準に追随するのが平均年収だけであること・
 * 指標リストの列が中身で動かないこと・図が潰れないこと）と、実データを通した配線を見る。
 *
 * **期待値はいまのデータの値を書き写さず、画面と同じ組み立て（`radarAxesOf`）から作る。
 * 会社も状態（欠けた軸の数・先頭の区分で打った軸がある 等）で選ぶ**（refresh の D0・#870。
 * 毎日の更新で順位も値も、どの会社がその状態かも動く）。
 */

const section = (page: Page) =>
  page.getByRole("heading", { name: "公開資料による全体像" }).locator("xpath=..");

const chart = (page: Page) => section(page).locator("svg");

const worklifeSection = (page: Page) =>
  page.getByRole("heading", { name: "残業・有給・男女の賃金の差異" }).locator("xpath=..");

/** 指標リストの1行（ラベルで引く）。`dd` は 値・順位・（稼ぐ力だけ）2行目 の順。 */
const listRow = (page: Page, label: string) =>
  section(page)
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: label }) });

/** 図の軸ラベルの下の値（`text` の2つ目の `tspan`）。ラベルで引く。 */
const chartValue = (page: Page, label: string) =>
  chart(page).locator("text", { hasText: label }).locator("tspan").nth(1);

/**
 * 軸ごとの数値の書き方。**`CompanyDetail` が `buildRadarAxes` に渡しているものと同じ**
 * ——単位の付け方は画面の組み立ての側にあって、関数として取り出されていない。
 */
const RADAR_FORMAT: Record<RadarAxisKey, (value: number) => string> = {
  salary: formatManYen,
  paidLeave: (v) => `${formatDecimal1(v)}%`,
  tenure: (v) => `${formatDecimal1(v)}年`,
  profit: formatManYen,
  overtime: (v) => `${formatDecimal1(v)}時間`,
};

/**
 * 1社ぶんの5軸を、画面と同じ入力（`companyPageData`）・同じ組み立て（`buildRadarAxes`）で作る。
 * 平均年収の軸だけが表示基準で変わる（AC-11）ので、表示基準を受け取る。
 */
function radarAxesOf(id: string, targetAge: TargetAge | null = null): RadarAxis[] {
  const { view, radar } = companyPageData(id);
  const current = statsForBasis(view, targetAge);
  return buildRadarAxes(
    {
      salary: { value: current.salary, rank: current.rankAll, population: view.totalCount },
      ...radar,
    },
    RADAR_FORMAT,
    {
      profit:
        radar.profitIndustryMedian === null
          ? ""
          : `${shortIndustryLabel(view.tse33)}の中央値 ${formatManYen(radar.profitIndustryMedian)}`,
    },
    { profit: "1人当たり経常利益" }
  );
}

const axisOf = (axes: RadarAxis[], key: RadarAxisKey) => axes.find((a) => a.key === key)!;
const missingCount = (axes: RadarAxis[]) => axes.filter((a) => a.position === null).length;
const pickedAxes = (axes: RadarAxis[]) => axes.filter((a) => a.pickedUnit !== "");

/** 有給・残業の全体値と区分（`worklife.json` を画面と同じ関数で読み戻す）。 */
function worklifeAxes(id: string) {
  const record = decodeWorklife(worklife, rowIndexOf(id));
  return [
    { key: "paidLeave", all: record?.paidLeaveAll ?? null, units: record?.paidLeaveUnits ?? [] },
    { key: "overtime", all: record?.overtimeAll ?? null, units: record?.overtimeUnits ?? [] },
  ] as const;
}

/** **居ることだけを前提にする会社**（企業 ID は変わらない・ADR-0017）。図の寸法を見るだけに使う。 */
const KEYENCE = "6861";

/** 先頭の区分で点を打った軸が1つあり、欠けた軸の無い会社（W3 の1軸・初期 HTML）。 */
const ONE_PICK = pickCompany("先頭の区分で打った軸が1つで、欠けた軸の無い会社", ([id]) => {
  const axes = radarAxesOf(id);
  return pickedAxes(axes).length === 1 && missingCount(axes) === 0;
});

test.describe("節の中身", () => {
  /*
   * 1社で、節に出る文字をまとめて見る（AC-6・AC-8・AC-9）。稼ぐ力の業種中央値を見るので、
   * それが添わる会社を選ぶ。既定の 1280px では図の右に指標リストが出る（`lg` から）。
   */
  test("AC-6・AC-8・AC-9 5軸のラベルと実数、断り、図の外の指標リストが出る", async ({ page }) => {
    const id = pickCompany(
      "稼ぐ力に業種の中央値が添わる会社",
      ([id]) => axisOf(radarAxesOf(id), "profit").note !== ""
    );
    const axes = radarAxesOf(id);
    await page.goto(`/company/${id}`);

    /*
     * **見出しの中では先頭。** C15（#821）で平均年収カードの直後に移した（`docs/company/spec.md`
     * 1.21）。カードには見出しが無いので、カードより後ろであることは `company-refresh.spec.ts` の
     * AC-33 が DOM・画面の上下・生の HTML で見ている。
     */
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    expect(headings[0]).toBe("公開資料による全体像");

    // AC-6: 5軸のラベルと実数（アートボード 6a）。欠けた軸は「掲載なし」。
    const svg = chart(page);
    for (const label of ["平均年収（有報）", "有給の取得", "定着（在籍）", "稼ぐ力", "残業時間"]) {
      await expect(svg).toContainText(label);
    }
    for (const { label, valueText } of axes) {
      await expect(chartValue(page, label), label).toHaveText(valueText);
    }
    // AC-8: 男女の賃金の差異は軸にしない（数値は下の節に残る）。
    await expect(svg).not.toContainText("賃金");

    // 各軸が「公表している会社の中での相対位置」であること、稼ぐ力の業種中央値
    // （業種差が30倍ある・spec 1.3）と分母の範囲（年収は単体・稼ぐ力は連結）。
    const body = section(page);
    for (const text of [
      "その指標を公表している会社の中での相対位置",
      "1人当たり経常利益",
      axisOf(axes, "profit").note,
      "連結の経常利益",
      "パート・アルバイトは従業員数に含まれません",
    ]) {
      await expect(body).toContainText(text);
    }

    /*
     * AC-9: 値と順位が図の外にも出る。**並びは 年収 → 残業 → 有給 → 定着 → 稼ぐ力**
     * （`RADAR_LIST_ORDER`。図の時計回りとは別）——稼ぐ力だけが2行ぶんの高さを
     * 持つので末尾に置く。途中に挟むとそこで行間が崩れる。
     */
    const list = body.locator("dl");
    const labels = await list.locator("dt").allInnerTexts();
    const expected = ["平均年収（有報）", "残業時間", "有給の取得", "定着（在籍）", "稼ぐ力"];
    expect(labels).toHaveLength(expected.length);
    // 稼ぐ力は副題が後ろに付くので前方一致で見る。
    labels.forEach((label, i) => expect(label.startsWith(expected[i]), label).toBe(true));
    // 各行の値と順位（掲載なしの軸は順位が空）。
    for (const [i, label] of expected.entries()) {
      const { valueText, rankText } = axes.find((a) => a.label === label)!;
      const cells = list.locator(":scope > div").nth(i).locator("dd");
      await expect(cells.nth(0), label).toHaveText(valueText);
      await expect(cells.nth(1), label).toHaveText(rankText);
    }
    // 「上位◯%」は使わない（上位82%が良い意味に読まれるため）。
    await expect(list).not.toContainText("上位");
  });
});

test.describe("AC-7 欠測軸", () => {
  /*
   * 欠けた軸の数ごとに1社を並べ、どの会社でも同じ規則を見る:
   * - 頂点は値のある軸の数だけ。**中心まで引き込まない**（破線の多角形を描かない）
   * - ラベルは5軸とも残す。軸ごと消すと何が公表されていないかが図から消える
   * - 「掲載なし」は実数より一段小さい（運営者の指示）。同じ大きさで並ぶと、
   *   無い軸のほうが読む順で先に来る
   * - 描き方の断りは欠けた軸がある会社にだけ出る（W3 の後の指摘）
   */
  test("欠けた軸は頂点を打たず、ラベルと一段小さい「掲載なし」を残す", async ({ page }) => {
    const note = "公表の無い指標は頂点を打たず、残りの点で閉じています。";
    for (const { label, absent } of [
      { label: "欠けた軸が1つ", absent: 1 },
      { label: "欠けた軸が2つ", absent: 2 },
      { label: "欠けが無い", absent: 0 },
    ]) {
      const id = pickCompany(`${label}の会社`, ([id]) => missingCount(radarAxesOf(id)) === absent);
      const points = 5 - absent;
      await page.goto(`/company/${id}`);
      const svg = chart(page);
      await expect(svg.locator("circle"), label).toHaveCount(points);
      await expect(svg.locator("text"), label).toHaveCount(5);
      await expect(svg.locator("polygon[stroke-dasharray]"), label).toHaveCount(0);

      const values = await svg.locator("text > tspan:nth-child(2)").evaluateAll((spans) =>
        spans.map((s) => ({
          text: s.textContent,
          size: parseFloat(getComputedStyle(s).fontSize),
        }))
      );
      const missing = values.filter((v) => v.text === "掲載なし");
      const shown = values.filter((v) => v.text !== "掲載なし");
      expect(missing, label).toHaveLength(5 - points);
      for (const m of missing) {
        for (const s of shown)
          expect(m.size, `${label}: ${s.text} より小さい`).toBeLessThan(s.size);
      }

      if (points < 5) await expect(section(page), label).toContainText(note);
      else await expect(section(page), label).not.toContainText(note);
    }
  });
});

/*
 * W3（Issue 802）。~~「区分別」と書いて頂点を打たない~~（W2）→ **区分の並びの先頭の
 * 値で点を打ち、どの区分の値かを該当する会社にだけ断る**（AC-13・AC-17）。
 * 断りの文の組み立ては `radar.test.ts` の `unitPickNote` が固定しているので、
 * ここは実データの区分名が図と断りに届くことを見る。
 */
test.describe("AC-13・AC-17 先頭の区分で点を打つ", () => {
  test("1軸: 先頭の区分で頂点を打ち、その区分名を断る", async ({ page }) => {
    const axes = radarAxesOf(ONE_PICK);
    const [picked] = pickedAxes(axes);
    await page.goto(`/company/${ONE_PICK}`);
    await expect(chartValue(page, picked.label)).toHaveText(picked.valueText);
    // 5軸すべてに頂点がある（W2 までは、先頭の区分で打つ軸に頂点が無く4つだった）。
    await expect(chart(page).locator("circle")).toHaveCount(5);
    await expect(listRow(page, picked.label).locator("dd").nth(1)).toHaveText(picked.rankText);
    await expect(section(page)).toContainText(unitPickNote(axes)!);
    // 「区分別」の表記は無くなった（AC-13）。**節の中で見る**——会社の説明文や AI 分析の
    // 本文には「区分別に給与体系を…」のような語が実在する。
    await expect(section(page)).not.toContainText("区分別");
    // 値そのものは下の節に区分のまま出ている（図に打ったのはその先頭）。
    const metric = companyPageData(ONE_PICK).worklife.metrics.find((m) => m.key === picked.key)!;
    expect(metric.rows.length).toBeGreaterThan(1);
    for (const row of metric.rows) {
      await expect(worklifeSection(page)).toContainText(formatDecimal1(row.value));
    }
  });

  /*
   * AC-17 の 390px の横スクロールもここで見る。**断りが2軸ぶんで最も長い会社**を選ぶ。
   * 先頭の区分が管理職でも飛ばさないことは `radar.test.ts` の `representative` が見る。
   */
  test("2軸: 両方の区分名が1文に出て、390pxでも横スクロールが出ない（断りが最も長い会社）", async ({
    page,
  }) => {
    const notes = new Map<string, string>();
    for (const [id] of companies.rows) {
      const axes = radarAxesOf(id);
      if (pickedAxes(axes).length === 2) notes.set(id, unitPickNote(axes)!);
    }
    const id = pickMaxCompany(
      "先頭の区分で打った軸が2つあり、断りが最も長い会社",
      ([id]) => notes.get(id)?.length ?? -Infinity
    );

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/company/${id}`);
    await expect(section(page)).toContainText(notes.get(id)!);
    for (const { label, valueText } of pickedAxes(radarAxesOf(id))) {
      await expect(chartValue(page, label)).toHaveText(valueText);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  /*
   * 該当しない会社には断りを出さない（W2 の「区分別」の断りは全社のページに出ていた）。
   * 2通り: **全体値があれば区分がいくつあっても全体値で打つ**会社（図の値は先頭の区分の
   * 値ではない）と、区分がちょうど1つで選んでいない会社。後者は、W2 で入力ミスとみられる
   * 全体値（有給 100% ちょうど）を取り込み時に落とした会社の形でもある——残った区分の値が
   * 図に出る。
   */
  test("該当しない会社には断りが出ない（全体値がある・区分が1つ）", async ({ page }) => {
    for (const { label, matches } of [
      {
        label: "全体値があり、値のある区分が2つ以上で先頭の値が全体値と違う軸",
        matches: (all: number | null, valued: number[]) =>
          all !== null && valued.length >= 2 && formatDecimal1(valued[0]) !== formatDecimal1(all),
      },
      {
        label: "全体値が無く、値のある区分がちょうど1つの軸",
        matches: (all: number | null, valued: number[]) => all === null && valued.length === 1,
      },
    ]) {
      const axisKey = (id: string) =>
        worklifeAxes(id).find(({ all, units }) =>
          matches(
            all,
            units.flatMap((u) => (u.value === null ? [] : [u.value]))
          )
        )?.key;
      const id = pickCompany(
        `${label}を持ち、先頭の区分で打った軸の無い会社`,
        ([id]) => axisKey(id) !== undefined && pickedAxes(radarAxesOf(id)).length === 0
      );
      const axis = axisOf(radarAxesOf(id), axisKey(id)!);
      await page.goto(`/company/${id}`);
      // 稼ぐ力の断りは全社に出ている（節の取り違えでないことの確認）。
      await expect(section(page), label).toContainText("連結の経常利益");
      await expect(section(page), label).not.toContainText("先頭の区分");
      // 図の値は全体値・ただ1つの区分の値そのもの。
      await expect(chartValue(page, axis.label), label).toHaveText(axis.valueText);
    }
  });
});

/*
 * W2（Issue 185）——女性活躍DBの入力ミスとみられる値（残業 0.0h 等）は取り込み時に
 * **値だけを落とし、区分の行は残す**（AC-14）。どの会社のどの値かは
 * `lib/data/worklife.test.ts` と pipeline の `positivedb.test.ts` が見ている。ここは
 * **行だけ残って値の無い軸が、図にも節にも値を出さないこと**を見る（片方だけ残ると
 * 食い違いを作る）。
 */
test("W2 区分の行だけ残って値の無い軸は、図では掲載なし・節では登録なしになる", async ({
  page,
}) => {
  const emptied = (id: string) =>
    worklifeAxes(id).find(
      ({ all, units }) => all === null && units.length > 0 && units.every((u) => u.value === null)
    )?.key;
  const id = pickCompany(
    "区分の行はあるが値が1つも無い軸を持ち、先頭の区分で打った軸の無い会社",
    ([id]) => emptied(id) !== undefined && pickedAxes(radarAxesOf(id)).length === 0
  );
  const axis = axisOf(radarAxesOf(id), emptied(id)!);
  const metric = companyPageData(id).worklife.metrics.find((m) => m.key === axis.key)!;
  expect(axis.valueText).toBe("掲載なし");
  expect(metric.rows).toHaveLength(0);

  await page.goto(`/company/${id}`);
  await expect(chartValue(page, axis.label)).toHaveText("掲載なし");
  await expect(section(page)).not.toContainText("先頭の区分");
  await expect(worklifeSection(page)).toContainText(metric.emptyNote);
});

test.describe("AC-11 表示基準", () => {
  test("年齢そろえで平均年収の軸だけが追随する", async ({ page }) => {
    // 5軸とも値のある会社で見る（欠けた軸は年齢に関わらず「掲載なし」で、動かないことを見られない）。
    const id = pickCompany("欠けた軸の無い会社", ([id]) => missingCount(radarAxesOf(id)) === 0);
    const raw = radarAxesOf(id);
    const at25 = radarAxesOf(id, 25);
    // 平均年収の軸が25歳で実際に変わる会社であること（変わらなければ追随を見られない）。
    expect(axisOf(at25, "salary").valueText).not.toBe(axisOf(raw, "salary").valueText);
    const value = (label: string) => listRow(page, label).locator("dd").first();

    await page.setViewportSize({ width: 1280, height: 1000 });
    // **ハイドレーションを待つ。** この節の値は SSR の HTML で既に満たされるので、
    // `toContainText` はクリックできる状態になる前に解決してしまう。全体実行で
    // dev サーバーが重いときだけ、押したのに何も起きない形で落ちる（実際に落ちた）。
    await page.goto(`/company/${id}`, { waitUntil: "networkidle" });
    for (const { label, valueText } of raw) await expect(value(label), label).toHaveText(valueText);

    const requests = collectPageRequests(page);
    await page.getByRole("button", { name: "年齢そろえ" }).click();
    await page
      .getByRole("group", { name: "目標年齢" })
      .getByRole("button", { name: "25歳" })
      .click();
    // 表示基準は URL に出さない（R1・ADR-0012）。
    await expect(page).toHaveURL(new RegExp(`/company/${id}$`));

    // 平均年収だけが25歳の推定値に変わる。稼ぐ力・定着・有給・残業は年齢補正を通さないので
    // 実測値のときのまま動かない。
    for (const { key, label, valueText } of raw) {
      const expected = key === "salary" ? axisOf(at25, "salary").valueText : valueText;
      await expect(value(label), label).toHaveText(expected);
    }
    expect(requests).toHaveLength(0);
  });
});

/*
 * 指標リスト（アートボード 6b）の列。**値と順位は固定幅・右寄せの grid の列**で、
 * 行の中身（桁数・業種名の長さ・掲載なし）では動かない。どれも実際に崩れた形の
 * 再発防止（`docs/performance/company-radar/design.md`）。
 */
test.describe("指標リストの列（PC）", () => {
  /*
   * **右寄せの文字は、器を超えると左へはみ出す。** 右端はそろったままなので、右端を
   * 比べるだけでは捕まらない——84px の器に実測83px の `1,867社中1,468位` が入って
   * いたとき、隣のラベルを押していたのに通っていた。
   *
   * **「収まる」では足りない。1文字ぶんの余裕を要求する。** このサイトは webfont を
   * 持たずOSのフォントで組むので、**同じ文字列の幅が環境で変わる**（モバイルの行で
   * 「円」だけが実機で2行目に落ちたのと同じ理由・CLAUDE.md）。1px の余りは、別の
   * フォントでは溢れる。
   */
  const MIN_SLACK = 8;

  test("値と順位の右端が全行でそろい、器に1文字ぶんの余裕がある", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    // 順位の文字がいちばん長くなるのは母数も順位も4桁のとき（`N,NNN社中N,NNN位`）。
    // 稼ぐ力の行の2行目（業種中央値）の右端も見るので、稼ぐ力に中央値が添わる会社に限る。
    const hasWidestRank = (axes: RadarAxis[]) =>
      axes.some((a) => /^\d,\d{3}社中\d,\d{3}位$/.test(a.rankText));
    for (const [label, missing] of [
      ["4桁の順位・掲載なしの行が1つ", 1],
      ["4桁の順位・掲載なしの行が2つ", 2],
    ] as const) {
      const id = pickCompany(`${label}の会社（稼ぐ力に業種中央値あり）`, ([id]) => {
        const axes = radarAxesOf(id);
        return (
          hasWidestRank(axes) &&
          missingCount(axes) === missing &&
          axisOf(axes, "profit").note !== ""
        );
      });
      await page.goto(`/company/${id}`);
      const rows = await section(page)
        .locator("dl > div")
        .evaluateAll((els) =>
          els.map((row) => {
            // 値・順位は行の `dd` そのもの（grid の列）。3つ目は稼ぐ力の2行目の帯。
            const cells = row.querySelectorAll("dd");
            const dt = row.querySelector("dt")!;
            // **文字そのものの矩形を測る。** 器は固定幅なので、`text-align` を
            // 変えても要素の矩形は動かない——`Range` なら中身の位置が出る。
            const inner = (el: Element) => {
              const range = document.createRange();
              range.selectNodeContents(el);
              return range.getBoundingClientRect();
            };
            const note = cells[2]?.querySelector("span:last-child");
            return {
              text: cells[1].textContent ?? "",
              valueRight: Math.round(cells[0].getBoundingClientRect().right),
              rankRight: Math.round(cells[1].getBoundingClientRect().right),
              rankTextRight: Math.round(inner(cells[1]).right),
              valueSlack: Math.round(
                cells[0].getBoundingClientRect().width - inner(cells[0]).width
              ),
              rankSlack: Math.round(cells[1].getBoundingClientRect().width - inner(cells[1]).width),
              noteRight: note ? Math.round(note.getBoundingClientRect().right) : null,
              dtLines: Math.round(
                dt.getBoundingClientRect().height / parseFloat(getComputedStyle(dt).lineHeight)
              ),
              height: Math.round(row.getBoundingClientRect().height),
            };
          })
        );
      expect(rows, label).toHaveLength(5);

      // **掲載なしの行も同じ幅の空きを残す**（詰めるとその行だけ右へ寄る）。
      for (const row of rows) {
        expect([row.valueRight, row.rankRight], `${label}: ${row.text} の行の列`).toEqual([
          rows[0].valueRight,
          rows[0].rankRight,
        ]);
        expect(row.valueSlack, `${label}: 値の器（${row.text} の行）`).toBeGreaterThanOrEqual(
          MIN_SLACK
        );
        expect(row.rankSlack, `${label}: 順位の器（${row.text}）`).toBeGreaterThanOrEqual(
          MIN_SLACK
        );
      }
      // 桁数の違う順位（1桁の順位と4桁の順位）が文字の右端でそろう。
      const ranked = rows.filter((r) => r.text !== "");
      expect(ranked.length, label).toBeGreaterThan(1);
      for (const row of ranked) expect(row.rankTextRight, label).toBe(ranked[0].rankTextRight);

      // 稼ぐ力（末尾）の業種中央値は2行目で順位と同じ右端にそろう（右寄せ）。
      expect(rows[4].noteRight, label).toBe(rows[4].rankRight);

      // **ラベルは折り返しを直接見る。** 器の余りから逆算するより確か。
      // 稼ぐ力だけが副題ぶん高く、他の4行は同じ高さ（有給・残業に区分名を添えて
      // 行が2行になっていたのを、運営者の指示で外した）。
      for (const row of rows.slice(0, 4)) {
        expect(row.dtLines, `${label}: ${row.text} の行のラベル`).toBe(1);
        expect(row.height, `${label}: ${row.text} の行の高さ`).toBe(rows[0].height);
      }
      expect(rows[4].height, label).toBeGreaterThan(rows[0].height);
    }
  });

  /*
   * 業種名が長い会社（`lib/data/industry.ts` で略称にする業種）。**中央値の注記は
   * 業種名の長さで伸びる**ので、値と順位の器に同居させると桁そろえを壊す——実際に
   * 稼ぐ力の行だけが 9.3px 右へずれ、器の右端（296px）からはみ出していた（大和証券
   * グループ本社）。列は grid で固定し、**業種名は略称にして2行目へ収めた**。
   */
  test("業種名が長くても値と順位の列が動かない（略称で出る業種の会社）", async ({ page }) => {
    const id = pickCompany("業種名を略称で出し、稼ぐ力に業種中央値が添わる会社", ([id]) => {
      const industry = industryOf(id);
      return (
        shortIndustryLabel(industry) !== industry && axisOf(radarAxesOf(id), "profit").note !== ""
      );
    });
    const industry = industryOf(id);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/company/${id}`);
    const list = section(page).locator("dl");
    // 略称で出る。**原文は同じ画面の他の場所（パンくず・業界内順位）に残る**
    // ので、読者は略称と原文を突き合わせられる。
    await expect(list).toContainText(`${shortIndustryLabel(industry)}の中央値`);
    await expect(list).not.toContainText(industry);
    await expect(page.locator("body")).toContainText(industry);

    const box = await list.evaluate((dl) => {
      const rows = [...dl.querySelectorAll(":scope > div")];
      return {
        listRight: Math.round(dl.getBoundingClientRect().right),
        rows: rows.map((row) => {
          const cells = [...row.querySelectorAll("dd")];
          const second = cells[2];
          const lineHeight = (el: Element) => parseFloat(getComputedStyle(el).lineHeight);
          return {
            value: Math.round(cells[0].getBoundingClientRect().right),
            rank: Math.round(cells[1].getBoundingClientRect().right),
            // **行の矩形は器の幅のままなので、中身の右端を測る。**
            // はみ出していた `dd` は 805px にあったが、行そのものは 796px だった。
            right: Math.round(Math.max(...cells.map((c) => c.getBoundingClientRect().right))),
            height: Math.round(row.getBoundingClientRect().height),
            secondLines:
              second === undefined
                ? 0
                : Math.round(second.getBoundingClientRect().height / lineHeight(second)),
            // 上の行（1行ぶん）＋2行目1行ぶんが、稼ぐ力の行のあるべき高さ。
            expectedHeight:
              second === undefined
                ? Math.round(row.getBoundingClientRect().height)
                : Math.round(
                    row.getBoundingClientRect().height -
                      second.getBoundingClientRect().height +
                      lineHeight(second)
                  ),
          };
        }),
      };
    });
    expect(box.rows).toHaveLength(5);
    for (const row of box.rows) {
      expect(row.value).toBe(box.rows[0].value);
      expect(row.rank).toBe(box.rows[0].rank);
      // 中身が器の右端を超えない（行の矩形を見ていると気づけない）。
      expect(row.right).toBeLessThanOrEqual(box.listRight);
    }
    // **2行目が1行に収まる。** 略称にする前は中央値だけが3行目へ落ちて、
    // その会社の行だけ高くなっていた（運営者の指摘）。
    expect(box.rows[4].secondLines).toBe(1);
    expect(box.rows[4].height).toBe(box.rows[4].expectedHeight);
  });
});

test.describe("レイアウトと初期HTML", () => {
  /*
   * Issue 191（2巡目・アートボード 6a / 6b）。**図が小さかった原因は
   * `@container` を `<svg>` 自身に置いていたこと**——`container-type: inline-size`
   * はその要素の縦横比を無かったことにするので、`height: auto` が置換要素の既定
   * （150px）に落ち、`preserveAspectRatio` が図全体を半分に縮めていた。
   * **型チェックもUnitテストも通る壊れ方**なので、比をブラウザで見張る。
   */
  test("図が viewBox の比のまま器いっぱいに伸びる（潰れていない。PC・モバイル）", async ({
    page,
  }) => {
    const RATIO = 232 / 300;
    for (const [label, width] of [
      ["PC", 1280],
      ["モバイル", 390],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/company/${KEYENCE}`);
      const box = (await chart(page).boundingBox())!;
      expect(box.height / box.width, label).toBeCloseTo(RATIO, 2);
      // 器いっぱい（PC は 340px の左列、モバイルは本文幅）まで使う。
      expect(box.width, label).toBeGreaterThan(300);
    }
  });

  /*
   * JS実行前のHTMLに、図の値（AC-9）と先頭の区分の断り（AC-17）が入っている。
   * 図の値は `aria-label`（5軸のラベルと値を読点でつないだもの）で見る——値の文字だけだと
   * 下の節にも出ている。
   */
  test("JS実行前のHTMLに図の値と断りが入っている（先頭の区分で打った軸がある会社）", async ({
    request,
  }) => {
    const axes = radarAxesOf(ONE_PICK);
    const html = await (await request.get(`/company/${ONE_PICK}`)).text();
    expect(html).toContain("公開資料による全体像");
    expect(html).toContain(htmlText(axes.map((a) => `${a.label} ${a.valueText}`).join("、")));
    expect(html).toContain(htmlText(unitPickNote(axes)!));
  });
});
