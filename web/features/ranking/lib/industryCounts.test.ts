import { describe, expect, it } from "vitest";
import { industryCounts } from "./industryCounts";
import { companies, stats } from "@/testing/realData";
import type { CompanyRow } from "../types";

const row = (tse33Idx: number): CompanyRow => [
  "id",
  "名前",
  tse33Idx,
  0,
  40,
  10,
  6_000_000,
  100,
  0,
  0,
];

describe("industryCounts", () => {
  // 突き合わせる相手は、ビルド（`build-data.ts` の `buildStats`）が別に数えた業種ごとの社数。
  it("`industries` と同じ並びで、ビルドが stats.json に数えた社数と一致し、合計が掲載社数になる", () => {
    const counts = industryCounts(companies);
    expect(counts).toEqual(stats.industryCounts);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(companies.rows.length);
  });

  // 業種のインデックスが範囲外の行が混ざってもページを壊さない（データ側の事故に備える）。
  it("範囲外のインデックスは数えない", () => {
    const counts = industryCounts({
      ...companies,
      industries: ["A", "B"],
      rows: [row(0), row(0), row(1), row(9)],
    });
    expect(counts).toEqual([2, 1]);
  });
});
