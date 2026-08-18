import { describe, it, expect } from "vitest";
import { buildRankedCompanies } from "./rank";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData, RankingState } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

function stateFor(
  targetAge: RankingState["targetAge"],
  overrides: Partial<RankingState> = {}
): RankingState {
  return {
    targetAge,
    industry: null,
    employeeSize: null,
    tenure: null,
    avgAgeBucket: null,
    query: "",
    page: 1,
    ...overrides,
  };
}

describe("buildRankedCompanies", () => {
  it("AC-1: 初期状態（35歳・絞り込みなし）で上位100件、1位はキーエンスで推定年収2,178万円", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(companies, curves, stateFor(35));
    expect(ranked).toHaveLength(100);
    expect(totalCount).toBe(companies.rows.length);
    expect(ranked[0].name).toBe("株式会社キーエンス");
    expect(ranked[0].rank).toBe(1);
    expect(Math.round(ranked[0].estimatedSalary / 10000)).toBe(2178);
  });

  // 2点モデル（ADR-0005）では平均年齢が違う会社どうしの順序が動きうるので、
  // 旧式（同業種内は完全に不変）より重なりは減る。実測37社に対して閾値を35社に置く。
  it("AC-2後半: 60歳時点の上位50社に、35歳時点の上位50社が35社以上含まれる", () => {
    const top50at35 = new Set(
      buildRankedCompanies(companies, curves, stateFor(35)).companies.slice(0, 50).map((c) => c.id)
    );
    const top50at60 = buildRankedCompanies(companies, curves, stateFor(60)).companies.slice(0, 50);

    const overlap = top50at60.filter((c) => top50at35.has(c.id)).length;
    expect(overlap).toBeGreaterThanOrEqual(35);
  });

  it("1ページの件数はPAGE_SIZE（100）で切り出される", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35));
    expect(ranked).toHaveLength(100);
  });

  it("pageで正しいオフセットが切り出される（2ページ目は101〜200位）", () => {
    const page1 = buildRankedCompanies(companies, curves, stateFor(35, { page: 1 })).companies;
    const page2 = buildRankedCompanies(companies, curves, stateFor(35, { page: 2 })).companies;
    expect(page2[0].rank).toBe(101);
    expect(page2.map((c) => c.id)).not.toEqual(page1.map((c) => c.id));
  });

  it("総ページ数を超えるpageは最終ページにクランプする", () => {
    const ranked = buildRankedCompanies(companies, curves, stateFor(35, { industry: "海運業", page: 999 }));
    expect(ranked.totalCount).toBe(7);
    expect(ranked.companies).toHaveLength(7);
  });

  it("0件のときtotalCountが0でcompaniesも空になる", () => {
    const ranked = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "鉱業", query: "存在しない社名" })
    );
    expect(ranked.totalCount).toBe(0);
    expect(ranked.companies).toHaveLength(0);
  });

  it("AC-3: 業種で「海運業」を選ぶと7社になり、順位が1から振り直される", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "海運業" })
    );
    expect(totalCount).toBe(7);
    expect(ranked).toHaveLength(7);
    expect(ranked[0].rank).toBe(1);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("AC-4: 従業員数で「1,000人以上」を選ぶと616社になる", () => {
    const { totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { employeeSize: "1000plus" })
    );
    expect(totalCount).toBe(616);
  });

  it("AC-5: 業種と平均年齢を重ねると、業種のみより件数が減る", () => {
    const industryOnly = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "情報・通信業" })
    );
    const combined = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "情報・通信業", avgAgeBucket: "under40" })
    );
    expect(combined.totalCount).toBeLessThan(industryOnly.totalCount);
  });

  it("AC-6: 「商船三井」で検索すると「株式会社　商船三井」が結果に含まれる", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35, { query: "商船三井" }));
    expect(ranked.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });

  it("検索はフィルタとANDで結合する（業種フィルタ単独より件数が減る）", () => {
    const industryOnly = buildRankedCompanies(companies, curves, stateFor(35, { industry: "海運業" }));
    const combined = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "海運業", query: "商船三井" })
    );
    expect(combined.totalCount).toBeLessThan(industryOnly.totalCount);
    expect(combined.companies.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });
});
