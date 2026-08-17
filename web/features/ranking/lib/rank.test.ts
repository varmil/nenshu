import { describe, it, expect } from "vitest";
import { buildRankedCompanies } from "./rank";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData, RankingState } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

function stateFor(
  targetAge: RankingState["targetAge"],
  visibleCount = 100,
  overrides: Partial<RankingState> = {}
): RankingState {
  return {
    targetAge,
    industry: null,
    employeeSize: null,
    tenure: null,
    avgAgeBucket: null,
    query: "",
    visibleCount,
    ...overrides,
  };
}

describe("buildRankedCompanies", () => {
  it("AC-1: 初期状態（35歳・絞り込みなし）で上位100件、1位はキーエンスで推定年収2,178万円", () => {
    const ranked = buildRankedCompanies(companies, curves, stateFor(35));
    expect(ranked).toHaveLength(100);
    expect(ranked[0].name).toBe("株式会社キーエンス");
    expect(ranked[0].rank).toBe(1);
    expect(Math.round(ranked[0].estimatedSalary / 10000)).toBe(2178);
  });

  it("AC-2後半: 60歳時点の上位50社に、35歳時点の上位50社が40社以上含まれる", () => {
    const top50at35 = new Set(
      buildRankedCompanies(companies, curves, stateFor(35, 50)).map((c) => c.id)
    );
    const top50at60 = buildRankedCompanies(companies, curves, stateFor(60, 50));

    const overlap = top50at60.filter((c) => top50at35.has(c.id)).length;
    expect(overlap).toBeGreaterThanOrEqual(40);
  });

  it("visibleCountで件数が切り出される", () => {
    const ranked = buildRankedCompanies(companies, curves, stateFor(35, 10));
    expect(ranked).toHaveLength(10);
  });

  it("AC-3: 業種で「海運業」を選ぶと7社になり、順位が1から振り直される", () => {
    const ranked = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, 100, { industry: "海運業" })
    );
    expect(ranked).toHaveLength(7);
    expect(ranked[0].rank).toBe(1);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("AC-4: 従業員数で「1,000人以上」を選ぶと616社になる", () => {
    const ranked = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, companies.rows.length, { employeeSize: "1000plus" })
    );
    expect(ranked).toHaveLength(616);
  });

  it("AC-5: 業種と平均年齢を重ねると、業種のみより件数が減る", () => {
    const industryOnly = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, companies.rows.length, { industry: "情報・通信業" })
    );
    const combined = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, companies.rows.length, { industry: "情報・通信業", avgAgeBucket: "under40" })
    );
    expect(combined.length).toBeLessThan(industryOnly.length);
  });

  it("AC-6: 「商船三井」で検索すると「株式会社　商船三井」が結果に含まれる", () => {
    const ranked = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, companies.rows.length, { query: "商船三井" })
    );
    expect(ranked.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });

  it("検索はフィルタとANDで結合する（業種フィルタ単独より件数が減る）", () => {
    const industryOnly = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, companies.rows.length, { industry: "海運業" })
    );
    const combined = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, companies.rows.length, { industry: "海運業", query: "商船三井" })
    );
    expect(combined.length).toBeLessThan(industryOnly.length);
    expect(combined.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });
});
