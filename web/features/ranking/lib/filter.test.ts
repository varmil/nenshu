import { describe, it, expect } from "vitest";
import { classifyAvgAgeBucket, classifyEmployeeSize, classifyTenure, matchesFilters } from "./filter";
import companiesData from "../../../public/data/companies.json";
import type { CompaniesData, RankingState } from "../types";

const companies = companiesData as CompaniesData;

function stateFor(overrides: Partial<RankingState>): RankingState {
  return {
    targetAge: 35,
    industry: null,
    employeeSize: null,
    tenure: null,
    avgAgeBucket: null,
    query: "",
    page: 1,
    ...overrides,
  };
}

function countBy<T>(classify: (row: CompaniesData["rows"][number]) => T) {
  const counts = new Map<T, number>();
  for (const row of companies.rows) {
    const key = classify(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

describe("分類関数（spec.md §1.5 の区分件数を固定する）", () => {
  it("従業員数: 〜300人=517, 300〜1,000人=734, 1,000人以上=616", () => {
    const counts = countBy((row) => classifyEmployeeSize(row[7]));
    expect(counts.get("under300")).toBe(517);
    expect(counts.get("300to1000")).toBe(734);
    expect(counts.get("1000plus")).toBe(616);
  });

  it("在籍年数: 〜13年=545, 13〜17年=732, 17年以上=590", () => {
    const counts = countBy((row) => classifyTenure(row[5]));
    expect(counts.get("under13")).toBe(545);
    expect(counts.get("13to17")).toBe(732);
    expect(counts.get("17plus")).toBe(590);
  });

  it("平均年齢: 〜40歳=450, 40〜43歳=709, 43歳以上=708", () => {
    const counts = countBy((row) => classifyAvgAgeBucket(row[4]));
    expect(counts.get("under40")).toBe(450);
    expect(counts.get("40to43")).toBe(709);
    expect(counts.get("43plus")).toBe(708);
  });
});

describe("matchesFilters", () => {
  it("AC-3: 業種で「海運業」を選ぶと7社になる", () => {
    const state = stateFor({ industry: "海運業" });
    const matched = companies.rows.filter((row) => matchesFilters(row, companies.industries, state));
    expect(matched).toHaveLength(7);
  });

  it("AC-4: 従業員数で「1,000人以上」を選ぶと616社になる", () => {
    const state = stateFor({ employeeSize: "1000plus" });
    const matched = companies.rows.filter((row) => matchesFilters(row, companies.industries, state));
    expect(matched).toHaveLength(616);
  });

  it("AC-5: 業種と平均年齢を重ねると、業種のみより件数が減る", () => {
    const industryOnly = companies.rows.filter((row) =>
      matchesFilters(row, companies.industries, stateFor({ industry: "情報・通信業" }))
    );
    const combined = companies.rows.filter((row) =>
      matchesFilters(
        row,
        companies.industries,
        stateFor({ industry: "情報・通信業", avgAgeBucket: "under40" })
      )
    );
    expect(combined.length).toBeLessThan(industryOnly.length);
    expect(combined.length).toBeGreaterThan(0);
  });

  it("フィルタなし（すべてnull）では全社が一致する", () => {
    const matched = companies.rows.filter((row) => matchesFilters(row, companies.industries, stateFor({})));
    expect(matched).toHaveLength(companies.rows.length);
  });
});
