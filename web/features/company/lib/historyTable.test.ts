import { describe, it, expect } from "vitest";
import historyData from "../../../public/data/history.json";
import companiesData from "../../../public/data/companies.json";
import { buildHistoryTable, formatRate, historyBaseYear } from "./historyTable";

const history = historyData as {
  years: number[];
  byId: Record<string, (number | null)[]>;
  ageById: Record<string, (number | null)[]>;
};

function historyFor(id: string) {
  return { years: history.years, values: history.byId[id], ages: history.ageById[id] };
}

function tableFor(id: string) {
  return buildHistoryTable(historyFor(id));
}

describe("buildHistoryTable", () => {
  it("10年ぶんの行を年の並びのまま返す", () => {
    const { rows } = tableFor("6861");
    expect(rows).toHaveLength(10);
    expect(rows[0].year).toBe(2017);
    expect(rows[9].year).toBe(2026);
  });

  it("基準年の行は累積を持たない", () => {
    const { rows, baseYear } = tableFor("6861");
    expect(baseYear).toBe(2017);
    expect(rows[0].cumulative).toBeNull();
    expect(rows[1].cumulative).not.toBeNull();
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
   */
  it("平均年齢を同じ年の行にそのまま載せる", () => {
    const { rows } = buildHistoryTable({
      years: [2017, 2018],
      values: [5_000_000, 5_100_000],
      ages: [42.49, 42.62],
    });
    expect(rows.map((row) => row.age)).toEqual([42.49, 42.62]);
  });

  it("平均年収の無い年は平均年齢も持たない", () => {
    const { rows } = buildHistoryTable({
      years: [2017, 2018],
      values: [null, 5_000_000],
      ages: [41.2, 41.5],
    });
    expect(rows[0].age).toBeNull();
    expect(rows[1].age).toBe(41.5);
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
    expect(byYear.get(2025)!.value).not.toBeNull();
    expect(byYear.get(2025)!.age).not.toBeNull();
    expect(byYear.get(2025)!.cumulative).not.toBeNull();
  });

  // 2017年の値を持たない会社が230社ある。固定の2017年基準にすると累積が丸ごと空になる。
  it("先頭が欠けていれば最初に値のある年が基準になる", () => {
    const { rows, baseYear } = buildHistoryTable({
      years: [2017, 2018, 2019],
      values: [null, 5_000_000, 6_000_000],
      ages: [null, 38, 38.4],
    });
    expect(baseYear).toBe(2018);
    expect(rows[0].value).toBeNull();
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

  // 実データ全社。平均年収のある行には平均年齢もある（spec AC-15 を表の側でも見る）。
  it("全社で、平均年収のある行には平均年齢がある", () => {
    for (const id of Object.keys(history.byId)) {
      const { rows } = tableFor(id);
      for (const row of rows) {
        expect(row.age === null, `${id} ${row.year}`).toBe(row.value === null);
      }
    }
  });

  /*
   * AC-16 の土台。最新年の行の平均年齢は、カード（`companies.json` の平均年齢）と同じ数字で
   * なければならない。キーエンスは2026年の有報が採用書類。
   */
  it("キーエンスの2026年の平均年齢は companies.json と一致する", () => {
    const keyence = (companiesData as { rows: (string | number)[][] }).rows.find(
      (row) => row[0] === "6861"
    )!;
    const { rows } = tableFor("6861");
    expect(rows[9].age).toBe(keyence[4]);
  });
});

describe("historyBaseYear", () => {
  it("表の見出しと同じ年を返す", () => {
    for (const id of ["6861", "2117", "3447"]) {
      expect(historyBaseYear(historyFor(id))).toBe(tableFor(id).baseYear);
    }
    expect(historyBaseYear(historyFor("3447"))).toBe(2018);
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
