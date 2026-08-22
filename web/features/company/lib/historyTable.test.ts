import { describe, it, expect } from "vitest";
import historyData from "../../../public/data/history.json";
import { buildHistoryTable, formatRate } from "./historyTable";

const history = historyData as { years: number[]; byId: Record<string, (number | null)[]> };

function tableFor(id: string) {
  return buildHistoryTable({ years: history.years, values: history.byId[id] });
}

describe("buildHistoryTable", () => {
  it("10年ぶんの行を年の並びのまま返す", () => {
    const { rows } = tableFor("6861");
    expect(rows).toHaveLength(10);
    expect(rows[0].year).toBe(2017);
    expect(rows[9].year).toBe(2026);
  });

  it("基準年の行は前年比も累積も持たない", () => {
    const { rows, baseYear } = tableFor("6861");
    expect(baseYear).toBe(2017);
    expect(rows[0].yoy).toBeNull();
    expect(rows[0].cumulative).toBeNull();
  });

  it("前年比と累積は同じ値から出す", () => {
    const { rows } = buildHistoryTable({
      years: [2017, 2018, 2019],
      values: [1_000_000, 1_250_000, 1_100_000],
    });
    expect(rows[1].yoy).toBeCloseTo(0.25, 10);
    expect(rows[1].cumulative).toBeCloseTo(0.25, 10);
    expect(rows[2].yoy).toBeCloseTo(-0.12, 10);
    expect(rows[2].cumulative).toBeCloseTo(0.1, 10);
  });

  /*
   * 内部に欠損のある会社が33社ある（2117 は2023・2024が欠損）。**その次の年は前年比を
   * 出さない**——2022年と2025年の比を「前年比」として並べると1年ぶんの動きとして読まれる。
   * 累積は基準年からの比なので、飛んでいても意味が変わらないため出す。
   */
  it("値の無い年をまたぐと前年比は出ないが、累積は出る", () => {
    const { rows } = tableFor("2117");
    const byYear = new Map(rows.map((row) => [row.year, row]));
    expect(byYear.get(2023)!.value).toBeNull();
    expect(byYear.get(2023)!.yoy).toBeNull();
    expect(byYear.get(2023)!.cumulative).toBeNull();
    expect(byYear.get(2025)!.value).not.toBeNull();
    expect(byYear.get(2025)!.yoy).toBeNull();
    expect(byYear.get(2025)!.cumulative).not.toBeNull();
    expect(byYear.get(2026)!.yoy).not.toBeNull();
  });

  // 2017年の値を持たない会社が230社ある。固定の2017年基準にすると累積が丸ごと空になる。
  it("先頭が欠けていれば最初に値のある年が基準になる", () => {
    const { rows, baseYear } = buildHistoryTable({
      years: [2017, 2018, 2019],
      values: [null, 5_000_000, 6_000_000],
    });
    expect(baseYear).toBe(2018);
    expect(rows[0].value).toBeNull();
    expect(rows[1].yoy).toBeNull();
    expect(rows[1].cumulative).toBeNull();
    expect(rows[2].cumulative).toBeCloseTo(0.2, 10);
  });

  it("値が1つも無ければ基準年は null", () => {
    const { rows, baseYear } = buildHistoryTable({ years: [2017, 2018], values: [null, null] });
    expect(baseYear).toBeNull();
    expect(rows.every((row) => row.yoy === null && row.cumulative === null)).toBe(true);
  });

  // 実データ全社。前年比が出ている行は必ず「直前の年に値がある」。
  it("全社で、前年比が出る行の直前の年には値がある", () => {
    for (const [id, values] of Object.entries(history.byId)) {
      const { rows } = buildHistoryTable({ years: history.years, values });
      rows.forEach((row, i) => {
        if (row.yoy !== null) expect(values[i - 1], `${id} ${row.year}`).not.toBeNull();
      });
    }
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
