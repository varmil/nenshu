import { describe, it, expect } from "vitest";
import {
  classifyAvgAgeBucket,
  classifyEmployeeSize,
  classifyTenure,
  matchesFilters,
} from "./filter";
import { companies, industryOf, pickCompany } from "@/testing/realData";
import type { AvgAgeBucket, CompanyRow, RankingState } from "../types";

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

function countBy<T>(classify: (row: CompanyRow) => T) {
  const counts = new Map<T, number>();
  for (const row of companies.rows) {
    const key = classify(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

/** spec の表の条件どおりに数えた社数。区分関数を通さずに、条件をそのまま書く。 */
const countWhere = (pred: (row: CompanyRow) => boolean) => companies.rows.filter(pred).length;

/*
 * 区分の境界は spec.md §1.5 の表の条件（`<` / 以上・未満 / 以上）。社数はデータで動くので
 * 書き写さず、表の条件で数えた社数と突き合わせる。3区分がどれも空でないこと（区切りが
 * 機能していること）も、期待値の側に 0 の区分があれば落ちる形で見ている。
 */
describe("分類関数（spec.md §1.5 の条件どおりに全社を3区分に分ける）", () => {
  it("従業員数: 〜300人 / 300〜1,000人 / 1,000人以上", () => {
    expect(countBy((row) => classifyEmployeeSize(row[7]))).toEqual({
      under300: countWhere((row) => row[7] < 300),
      "300to1000": countWhere((row) => row[7] >= 300 && row[7] < 1000),
      "1000plus": countWhere((row) => row[7] >= 1000),
    });
  });

  it("在籍年数: 〜13年 / 13〜17年 / 17年以上", () => {
    expect(countBy((row) => classifyTenure(row[5]))).toEqual({
      under13: countWhere((row) => row[5] < 13),
      "13to17": countWhere((row) => row[5] >= 13 && row[5] < 17),
      "17plus": countWhere((row) => row[5] >= 17),
    });
  });

  it("平均年齢: 〜40歳 / 40〜43歳 / 43歳以上", () => {
    expect(countBy((row) => classifyAvgAgeBucket(row[4]))).toEqual({
      under40: countWhere((row) => row[4] < 40),
      "40to43": countWhere((row) => row[4] >= 40 && row[4] < 43),
      "43plus": countWhere((row) => row[4] >= 43),
    });
  });
});

/*
 * 業種（AC-3）と検索の結合（AC-6）は `rank.test.ts` が `buildRankedCompanies` を通して
 * 見ている。ここでは状態からスイッチ系の絞り込みが効くことを見る。
 */
describe("matchesFilters", () => {
  const matched = (overrides: Partial<RankingState>) =>
    companies.rows.filter((row) => matchesFilters(row, companies.industries, stateFor(overrides)));

  it("AC-4: 従業員数で「1,000人以上」を選ぶと、単体従業員数が1,000人以上の会社だけが残る", () => {
    const result = matched({ employeeSize: "1000plus" });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toEqual(companies.rows.filter((row) => row[7] >= 1000));
  });

  it("AC-5: 業種と平均年齢を重ねると、業種のみより件数が減る", () => {
    // 40歳未満の会社とそうでない会社が両方いる業種を選ぶ（どちらかしかいない業種では
    // 重ねても件数が減らないか、0件になる）。
    const bucketsByIndustry = new Map<number, Set<AvgAgeBucket>>();
    for (const row of companies.rows) {
      const buckets = bucketsByIndustry.get(row[2]) ?? new Set<AvgAgeBucket>();
      buckets.add(classifyAvgAgeBucket(row[4]));
      bucketsByIndustry.set(row[2], buckets);
    }
    const industry = industryOf(
      pickCompany("40歳未満の会社とそうでない会社が両方いる業種の会社", (row) => {
        const buckets = bucketsByIndustry.get(row[2])!;
        return buckets.has("under40") && buckets.size > 1;
      })
    );

    const industryOnly = matched({ industry });
    const combined = matched({ industry, avgAgeBucket: "under40" });
    expect(combined.length).toBeLessThan(industryOnly.length);
    expect(combined.length).toBeGreaterThan(0);
    // 両方の条件を満たす会社だけが残る。
    for (const row of combined) {
      expect(companies.industries[row[2]]).toBe(industry);
      expect(classifyAvgAgeBucket(row[4])).toBe("under40");
    }
  });
});
