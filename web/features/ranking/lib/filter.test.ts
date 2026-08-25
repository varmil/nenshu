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
    sort: { key: "salary", order: "desc" },
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
  it("従業員数: 〜300人=1,049, 300〜1,000人=1,109, 1,000人以上=803", () => {
    const counts = countBy((row) => classifyEmployeeSize(row[7]));
    expect(counts.get("under300")).toBe(1049);
    expect(counts.get("300to1000")).toBe(1109);
    expect(counts.get("1000plus")).toBe(803);
  });

  it("在籍年数: 〜13年=1,230, 13〜17年=981, 17年以上=750", () => {
    const counts = countBy((row) => classifyTenure(row[5]));
    expect(counts.get("under13")).toBe(1230);
    expect(counts.get("13to17")).toBe(981);
    expect(counts.get("17plus")).toBe(750);
  });

  it("平均年齢: 〜40歳=983, 40〜43歳=1,006, 43歳以上=972", () => {
    const counts = countBy((row) => classifyAvgAgeBucket(row[4]));
    expect(counts.get("under40")).toBe(983);
    expect(counts.get("40to43")).toBe(1006);
    expect(counts.get("43plus")).toBe(972);
  });
});

describe("matchesFilters", () => {
  it("AC-3: 業種で「海運業」を選ぶと9社になる", () => {
    const state = stateFor({ industry: "海運業" });
    const matched = companies.rows.filter((row) => matchesFilters(row, companies.industries, state));
    expect(matched).toHaveLength(9);
  });

  it("AC-4: 従業員数で「1,000人以上」を選ぶと803社になる", () => {
    const state = stateFor({ employeeSize: "1000plus" });
    const matched = companies.rows.filter((row) => matchesFilters(row, companies.industries, state));
    expect(matched).toHaveLength(803);
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
