import { describe, expect, it } from "vitest";
import { history, pickCompany, profitHistory, rowOf } from "@/testing/realData";
import { companyPageData } from "./pageData";
import { HISTORY_SPAN, historyWindowYears } from "./historyWindow";

/**
 * 推移の窓（refresh の D5・#875・AC-9）。窓の規則そのもの（右端が進むのはその会社だけ・
 * 窓より古い年は出さない）は `pipeline/scripts/lib/historyWindow.test.ts` が合成データで見る。
 * ここは**画面に渡す年が、データの窓とそろっていること**を実データで見る。
 */

/** 窓の右端がいちばん新しい会社と古い会社（3つの推移がそろう会社）。 */
function edgeCompanies(): string[] {
  const ends = Object.values(history.endById);
  return [Math.max(...ends), Math.min(...ends)].map((end) =>
    pickCompany(
      `推移の窓の右端が${end}年で3つの推移がそろう会社`,
      ([id]) =>
        history.endById[id] === end &&
        profitHistory.profit[id] !== undefined &&
        history.tenureById[id]?.some((v) => v !== null) === true
    )
  );
}

describe("historyWindowYears", () => {
  it("右端から数えた連続した10年（古い順）", () => {
    const years = historyWindowYears(2030);
    expect(years).toHaveLength(HISTORY_SPAN);
    expect(years.at(-1)).toBe(2030);
    expect(years).toEqual(years.map((_, k) => years[0] + k));
  });
});

describe("companyPageData の推移（D5・AC-9）", () => {
  it("平均年収・在籍年数・稼ぐ力の3つに、その会社の窓の同じ年を渡す", () => {
    for (const id of edgeCompanies()) {
      const years = historyWindowYears(history.endById[id]);
      const data = companyPageData(id);
      expect(data.history!.years, id).toEqual(years);
      expect(data.tenureHistory!.years, id).toEqual(years);
      expect(data.profitHistory!.years, id).toEqual(years);
    }
  });

  it("在籍年数の業種の中央値は、窓の添字ではなく年で引く", () => {
    // 中央値は全社の窓を覆う年（`medianYears`）で持っている。**添字で引くと、右端が全社の
    // 最新の年でない会社で1年ずれる。**
    for (const id of edgeCompanies()) {
      const medians = history.tenureIndustryMedian[rowOf(id)[2]];
      const { years, industryMedian } = companyPageData(id).tenureHistory!;
      years.forEach((year, k) => {
        expect(industryMedian[k], `${id} ${year}`).toBe(
          medians[history.medianYears.indexOf(year)] ?? null
        );
      });
    }
  });
});
