import { describe, it, expect } from "vitest";
import { buildRankedCompanies } from "./rank";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData, RankingState } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

function stateFor(targetAge: RankingState["targetAge"], visibleCount = 100): RankingState {
  return {
    targetAge,
    industry: null,
    employeeSize: null,
    tenure: null,
    avgAgeBucket: null,
    query: "",
    visibleCount,
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
});
