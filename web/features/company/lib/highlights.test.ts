import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import historyData from "../../../public/data/history.json";
import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import type { CompanyStatsData } from "../types";
import { buildCompanyView } from "./view";
import { statsForBasis } from "./stats";
import {
  buildActualsSummary,
  buildCurveSummary,
  buildHighlights,
  buildHistoryPeak,
  buildHistorySummary,
  findSalaryMilestones,
} from "./highlights";
import { formatManYen, toManYen } from "@/features/ranking/lib/format";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;
const history = historyData as { years: number[]; byId: Record<string, (number | null)[]> };

function highlights(id: string, age: TargetAge | null) {
  const view = buildCompanyView(companies, curves, stats, id)!;
  return buildHighlights(view, statsForBasis(view, age));
}

describe("buildHighlights（AC-11）", () => {
  it("金額・全体順位・業界内順位を必ず含む", () => {
    const items = highlights("6861", null);
    expect(items[0]).toContain("2,178万円");
    expect(items[0]).toContain("1位");
    // 括弧に添えるのは偏差値（アートボード 4b）。上位◯%は出さない。
    expect(items[0]).toContain("偏差値122.9");
    expect(items[1]).toContain("電気機器");
  });

  it("表示基準を切り替えると位置の記述が変わる", () => {
    const raw = highlights("6861", null);
    const at25 = highlights("6861", 25);
    expect(raw[0]).not.toBe(at25[0]);
    expect(at25[0]).toContain("25歳にそろえた推定年収");
    // 実測値では「推定」の語を出さない（spec AC-9）。
    expect(raw.join("")).not.toContain("推定");
  });

  /*
   * 該当しない項目は出さない（項目数を揃えない）。三分位の真ん中に入る会社は
   * 年齢・勤続・規模の行がすべて落ちるので、項目数が最小になる。
   */
  it("該当しない項目は出さない", () => {
    const middle = companies.rows.find(
      (r) => r[4] >= 40 && r[4] < 43 && r[5] >= 13 && r[5] < 17 && r[7] >= 300 && r[7] < 1000 && r[8] === 0
    )!;
    const items = highlights(middle[0], 35);
    expect(items).toHaveLength(2);
  });

  it("「本社のみ」の会社にはその断りが入る", () => {
    const badged = companies.rows.find((r) => r[8] === 1)!;
    expect(highlights(badged[0], null).join("")).toContain("本社のみ");
  });
});

describe("buildCurveSummary", () => {
  function byAge(id: string) {
    const view = buildCompanyView(companies, curves, stats, id)!;
    return view.byBasis.filter((s) => s.targetAge !== null);
  }

  it("到達年齢・最高水準・伸びが最大の5歳区間を述べる", () => {
    const sentences = buildCurveSummary(byAge("6861"), "キーエンス");
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toBe(
      "キーエンスの推定年収を年齢別に見ると、30歳で1,200万円、35歳で2,000万円、50歳で2,500万円に達します。"
    );
    expect(sentences[1]).toContain("最も高い水準は55歳の2,699万円");
    expect(sentences[2]).toContain("25歳から30歳の伸びが最も大きく");
  });

  /*
   * 段に1つも届かない会社（8点が最も低い段の中に収まる。実データで8社）。
   * **切り出しの「年齢別に見ると」は落とさない**——最高水準の文が引き継ぐ。
   */
  it("到達する段が無ければ到達年齢の文を出さない", () => {
    const ages = byAge("E04127"); // 福井鉄道（8点とも362〜369万円）
    expect(findSalaryMilestones(ages)).toHaveLength(0);
    const sentences = buildCurveSummary(ages, "福井鉄道");
    expect(sentences[0]).toContain("福井鉄道の推定年収を年齢別に見ると");
    expect(sentences[0]).toContain("最も高い水準になります");
    expect(sentences.join("")).not.toContain("に達します");
  });

  /*
   * 末尾が下がる会社でも、下がる理由（補正に使う統計側のカーブが定年前後で
   * 下向き）は書かない（Issue #95）。この会社の数値から導ける事実ではないため。
   */
  it("末尾が下がっても仕組みの説明は足さない", () => {
    const ages = byAge("6861");
    expect(ages[ages.length - 1].salary).toBeLessThan(ages[ages.length - 2].salary);
    expect(buildCurveSummary(ages, "キーエンス").join("")).not.toContain("定年前後");
  });
});

describe("findSalaryMilestones（C4・AC-14）", () => {
  function byAge(id: string) {
    const view = buildCompanyView(companies, curves, stats, id)!;
    return view.byBasis.filter((s) => s.targetAge !== null);
  }

  it("段に届いた年齢を若い順に並べる", () => {
    // 東日本旅客鉄道: 464 / 610 / 733 / 821 / 838 / 836 / 834 / 735（万円）
    expect(findSalaryMilestones(byAge("9020"))).toEqual([
      { age: 30, manYen: 600 },
      { age: 35, manYen: 700 },
      { age: 40, manYen: 800 },
    ]);
  });

  /*
   * **表の金額と文の金額が食い違わないこと。** 判定は画面に出ている万円の値
   * （`toManYen`）で行う——円のまま比べると、表が「600万円」と描いている行を
   * 文が数えないことが起こりうる。全1,867社で突き合わせる。
   */
  it("段に届いたと書いた年齢の行は、表でもその金額以上になっている", () => {
    for (const row of companies.rows) {
      const view = buildCompanyView(companies, curves, stats, row[0])!;
      const ages = view.byBasis.filter((s) => s.targetAge !== null);
      for (const milestone of findSalaryMilestones(ages)) {
        const point = ages.find((s) => s.targetAge === milestone.age)!;
        expect(toManYen(point.salary)).toBeGreaterThanOrEqual(milestone.manYen);
      }
    }
  });

  // 25歳より前のデータを持っていないので、左端で既に上回っている段は数えない。
  it("25歳で既に上回っている段は数えない", () => {
    // キーエンスの25歳は788万円。700万円以下の段はどれも出てこない。
    const found = findSalaryMilestones(byAge("6861"));
    expect(found.every((m) => m.manYen > 788)).toBe(true);
  });

  // 末尾（60歳）で下がる会社でも、いったん届いた段を数え直さない。
  it("いったん届いた段は下がっても数え直さない", () => {
    const found = findSalaryMilestones(byAge("6861"));
    const ages = found.map((m) => m.age);
    expect(new Set(ages).size).toBe(ages.length);
    expect([...found].sort((a, b) => a.manYen - b.manYen)).toEqual(found);
  });

  // 4段以上に届く会社は、文に載るのが最初・真ん中・最後の3つになる。
  it("4段以上に届いても文に載るのは3つまで", () => {
    // テレビ東京ホールディングスは5段（700 / 900 / 1,000 / 1,200 / 1,500万円）に届く。
    const ages = byAge("9413");
    expect(findSalaryMilestones(ages).length).toBeGreaterThan(3);
    const sentence = buildCurveSummary(ages, "テレビ東京ホールディングス")[0];
    expect(sentence.match(/歳で/g)).toHaveLength(3);
  });
});

describe("buildActualsSummary（C4・AC-17）", () => {
  it("実測値の4項目を1文にする", () => {
    const view = buildCompanyView(companies, curves, stats, "6861")!;
    const sentence = buildActualsSummary(view);
    expect(sentence).toBe(
      "有価証券報告書によると、株式会社キーエンスの平均年収は2,178万円、平均年齢は35.0歳、平均勤続年数は11.3年、従業員数は3,306人です。"
    );
  });

  // 決算期は節の見出しが持っている（S3・Issue #134）。1画面に1回。
  it("決算期は書かない", () => {
    const view = buildCompanyView(companies, curves, stats, "6861")!;
    expect(buildActualsSummary(view)).not.toContain("期");
  });

  // 実測値そのものなので、どの表示基準でも同じ文になる（推定の語も出ない）。
  it("推定の語を出さない", () => {
    const view = buildCompanyView(companies, curves, stats, "6861")!;
    expect(buildActualsSummary(view)).not.toContain("推定");
  });
});

describe("buildHistoryPeak（C4）", () => {
  it("最高値が途中の年にあればその年と金額を書く", () => {
    // キーエンスの最高値は2023年の2,279万円（最新は2026年の2,178万円）。
    const peak = buildHistoryPeak(history.years, history.byId["6861"])!;
    expect(peak).toBe("この10年で最も高かったのは2023年の2,279万円です。");
  });

  // 最新年が最高値なら書かない（増減の1文が同じ数字を既に出している）。
  it("最新年が最高値なら null", () => {
    expect(buildHistoryPeak([2017, 2018], [5_000_000, 6_000_000])).toBeNull();
    expect(buildHistoryPeak(history.years, history.byId["9020"])).toBeNull();
  });

  it("値が1つ以下なら null", () => {
    expect(buildHistoryPeak([2017, 2018], [null, 5_000_000])).toBeNull();
  });

  // 増減の1文と同じ丸めで書く（同じ節に並ぶ2文で金額の書式が割れない）。
  it("金額はランキングと同じ書式", () => {
    const values = history.byId["6861"];
    const peak = Math.max(...values.filter((v): v is number => v !== null));
    expect(buildHistoryPeak(history.years, values)).toContain(formatManYen(peak));
  });
});

describe("buildHistorySummary", () => {
  it("10年の増減を最初と最後の実在する年で書く", () => {
    const summary = buildHistorySummary(history.years, history.byId["6861"])!;
    expect(summary).toContain("2017年");
    expect(summary).toContain("2026年");
    expect(summary).toContain("2,178万円");
  });

  // 端が欠けている会社は、実在する年で書く。内挿しない。
  it("先頭が欠けていればその次の実在年から書く", () => {
    const summary = buildHistorySummary([2017, 2018, 2019], [null, 5_000_000, 6_000_000])!;
    expect(summary).toContain("2018年 500万円");
    expect(summary).toContain("2019年 600万円");
    expect(summary).toContain("1年で ＋100万円");
  });

  it("値が1つ以下なら null", () => {
    expect(buildHistorySummary([2017, 2018], [null, 5_000_000])).toBeNull();
    expect(buildHistorySummary([2017, 2018], [null, null])).toBeNull();
  });

  it("減っていれば − で書く", () => {
    const summary = buildHistorySummary([2017, 2018], [6_000_000, 5_000_000])!;
    expect(summary).toContain("−100万円");
  });
});
