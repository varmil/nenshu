import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import historyData from "../../../public/data/history.json";
import type { CompaniesData, CurvesData, TargetAge } from "@/features/ranking/types";
import type { CompanyStatsData } from "../types";
import { buildCompanyView } from "./view";
import { statsForBasis } from "./stats";
import { buildCurveSummary, buildHighlights, buildHistorySummary } from "./highlights";

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

  it("最高水準の年齢と、伸びが最大の5歳区間を述べる", () => {
    const sentences = buildCurveSummary(byAge("6861"), "キーエンス");
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("55歳の2,699万円が最も高い水準");
    expect(sentences[1]).toContain("25歳から30歳の伸びが最も大きく");
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
