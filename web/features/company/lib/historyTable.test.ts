import { describe, it, expect } from "vitest";
import historyData from "../../../public/data/history.json";
import { buildHistoryTable, formatRate, historyBaseYear } from "./historyTable";

const history = historyData as {
  years: number[];
  byId: Record<string, (number | null)[]>;
  ageById: Record<string, (number | null)[]>;
};

function tableFor(id: string) {
  return buildHistoryTable({
    years: history.years,
    values: history.byId[id],
    ages: history.ageById[id],
  });
}

describe("buildHistoryTable", () => {
  it("10年ぶんの行を年の並びのまま返し、基準年の行は累積を持たない", () => {
    const { rows, baseYear } = tableFor("6861");
    expect(rows.map((row) => row.year)).toEqual(history.years);
    expect(baseYear).toBe(2017);
    expect(rows[0].cumulative).toBeNull();
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
   * 内部に欠損のある会社が33社ある（2117 は2023・2024が欠損）。累積は基準年からの比なので、
   * 間が飛んでいても意味が変わらないため出す。
   */
  it("値の無い年をまたいでも累積は出る", () => {
    const { rows } = tableFor("2117");
    const byYear = new Map(rows.map((row) => [row.year, row]));
    expect(byYear.get(2023)!.value).toBeNull();
    expect(byYear.get(2023)!.age).toBeNull();
    expect(byYear.get(2023)!.cumulative).toBeNull();
    expect(byYear.get(2025)!.age).not.toBeNull();
    expect(byYear.get(2025)!.cumulative).not.toBeNull();
  });

  // 2017年の値を持たない会社が230社ある。固定の2017年基準にすると累積が丸ごと空になる。
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
