import { describe, it, expect } from "vitest";
import { history, historyYearsOf, pickCompany } from "@/testing/realData";
import { buildHistoryTable, formatRate, historyBaseYear } from "./historyTable";

function tableFor(id: string) {
  return buildHistoryTable({
    years: historyYearsOf(id),
    values: history.byId[id],
    ages: history.ageById[id],
  });
}

/**
 * 10年推移の途中に値の無い年があり、その後ろに値のある年が続く会社なら、
 * `[値の無い年, その後ろで最初に値のある年]` の添字を返す。
 */
function innerGap(id: string): [number, number] | null {
  const values = history.byId[id] ?? [];
  const first = values.findIndex((value) => value !== null);
  if (first === -1) return null;
  const gap = values.findIndex((value, i) => i > first && value === null);
  const after = values.findIndex((value, i) => gap !== -1 && i > gap && value !== null);
  return gap === -1 || after === -1 ? null : [gap, after];
}

describe("buildHistoryTable", () => {
  it("10年ぶんの行を年の並びのまま返し、基準年の行は累積を持たない", () => {
    const { rows, baseYear } = tableFor("6861");
    expect(rows.map((row) => row.year)).toEqual(historyYearsOf("6861"));
    // 基準年はその会社で最初に値のある年。
    const base = history.byId["6861"].findIndex((value) => value !== null);
    expect(baseYear).toBe(historyYearsOf("6861")[base]);
    expect(rows[base].cumulative).toBeNull();
  });

  it("累積は基準年の値からの比", () => {
    const { rows } = buildHistoryTable({
      years: [2017, 2018, 2019],
      values: [1_000_000, 1_250_000, 1_100_000],
      ages: [40, 40.5, 41],
    });
    expect(rows[1].cumulative).toBeCloseTo(0.25, 10);
    expect(rows[2].cumulative).toBeCloseTo(0.1, 10);
  });

  /*
   * T3（#827）。平均年齢は同じ有報の値をそのまま行に載せる。**丸めない**——小数第2位で
   * 書く会社があり（`42.49`）、丸めは描画の `formatDecimal1` がカードと同じ規則で行う。
   * 平均年収の無い年に年齢だけを出すことはしない。
   */
  it("平均年齢は丸めずに同じ年の行に載せ、平均年収の無い年は持たない", () => {
    const { rows } = buildHistoryTable({
      years: [2017, 2018, 2019],
      values: [null, 5_000_000, 5_100_000],
      ages: [41.2, 42.49, 42.62],
    });
    expect(rows.map((row) => row.age)).toEqual([null, 42.49, 42.62]);
  });

  /*
   * 内部に欠損のある会社がある。累積は基準年からの比なので、
   * 間が飛んでいても意味が変わらないため出す。
   */
  it("値の無い年をまたいでも累積は出る", () => {
    const id = pickCompany("10年推移の途中が欠けている会社", (row) => innerGap(row[0]) !== null);
    const [gap, after] = innerGap(id)!;
    const { rows } = tableFor(id);
    expect(rows[gap].value).toBeNull();
    expect(rows[gap].age).toBeNull();
    expect(rows[gap].cumulative).toBeNull();
    expect(rows[after].age).not.toBeNull();
    expect(rows[after].cumulative).not.toBeNull();
  });

  // 先頭の年の値を持たない会社がある。固定の先頭年基準にすると累積が丸ごと空になる。
  it("先頭が欠けていれば最初に値のある年が基準になる", () => {
    const input = {
      years: [2017, 2018, 2019],
      values: [null, 5_000_000, 6_000_000],
      ages: [null, 38, 38.4],
    };
    const { rows, baseYear } = buildHistoryTable(input);
    expect(baseYear).toBe(2018);
    // 列の見出しと節の説明が同じ年を名乗るよう、どちらも `historyBaseYear` を読む。
    expect(historyBaseYear(input)).toBe(2018);
    expect(rows[1].cumulative).toBeNull();
    expect(rows[2].cumulative).toBeCloseTo(0.2, 10);
  });

  it("値が1つも無ければ基準年は null", () => {
    const { rows, baseYear } = buildHistoryTable({
      years: [2017, 2018],
      values: [null, null],
      ages: [null, null],
    });
    expect(baseYear).toBeNull();
    expect(rows.every((row) => row.age === null && row.cumulative === null)).toBe(true);
  });
});

describe("formatRate", () => {
  it("符号は全角で、小数第1位まで", () => {
    expect(formatRate(0.25)).toBe("＋25.0%");
    expect(formatRate(-0.142)).toBe("−14.2%");
  });

  // 丸めてから符号を決める。−0.04% を「−0.0%」と出すと動いていない年に向きが付く。
  it("丸めて0になる比には向きを付けない", () => {
    expect(formatRate(-0.0004)).toBe("±0.0%");
    expect(formatRate(0)).toBe("±0.0%");
  });
});
