import type { SalaryHistory } from "../types";

/** 表の1行（`docs/timeseries/spec.md` 2.5）。 */
export interface HistoryRow {
  year: number;
  /** その年の平均年間給与（円）。有報が無ければ `null`。内挿しない。 */
  value: number | null;
  /**
   * 前年比（例 `0.25` が ＋25.0%）。**直前の年に値があるときだけ入る。**
   * 値の無い年をまたいだ比は「前年比」ではないので `null` にする。
   */
  yoy: number | null;
  /** 基準年（その会社で最初に値のある年）からの累積。基準年の行と欠損の行は `null`。 */
  cumulative: number | null;
}

export interface HistoryTable {
  rows: HistoryRow[];
  /** 累積の基準になった年。値が1つも無ければ `null`。 */
  baseYear: number | null;
}

/**
 * 10年推移の表（T2・Issue #138）。**`history.json` を1社ぶん引くだけで、データは増やさない。**
 *
 * **基準年は会社ごとに違う。** 2017年の値を持たない会社が230社あるので、固定の2017年基準に
 * すると累積の列がその230社で丸ごと空になる。**その会社で最初に値のある年**を基準にし、
 * 列の見出しにその年を書く。
 *
 * **飛び年をまたぐ比は出さない**（内部に欠損のある会社が33社ある。例: 2117 は2023・2024が
 * 欠損）。2022年と2025年の比を「前年比」として並べると、読者は1年ぶんの動きとして読む。
 */
export function buildHistoryTable(history: SalaryHistory): HistoryTable {
  const { years, values } = history;
  const baseIndex = values.findIndex((value) => value !== null);
  const baseValue = baseIndex === -1 ? null : values[baseIndex];

  const rows = years.map((year, i) => {
    const value = values[i];
    const previous = i === 0 ? null : values[i - 1];
    return {
      year,
      value,
      yoy: value === null || previous === null || previous === 0 ? null : value / previous - 1,
      cumulative:
        value === null || baseValue === null || baseValue === 0 || i === baseIndex
          ? null
          : value / baseValue - 1,
    };
  });

  return { rows, baseYear: baseIndex === -1 ? null : years[baseIndex] };
}

/**
 * 比を ＋25.0% / −14.2% の形にする。符号は `buildHistorySummary` と同じ全角。
 *
 * **丸めてから符号を決める。** −0.04% を「−0.0%」と出すと、増えても減ってもいない年に
 * 向きが付いて見える。
 */
export function formatRate(rate: number): string {
  const percent = Math.round(rate * 1000) / 10;
  const sign = percent > 0 ? "＋" : percent < 0 ? "−" : "±";
  return `${sign}${Math.abs(percent).toFixed(1)}%`;
}
