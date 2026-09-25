import type { SalaryHistory } from "../types";

/** 表の1行（`docs/timeseries/spec.md` 2.5）。 */
export interface HistoryRow {
  year: number;
  /** その年の平均年間給与（円）。有報が無ければ `null`。内挿しない。 */
  value: number | null;
  /**
   * 同じ書類の平均年齢（歳）。T3（#827）で前年比の列を置き換えた。平均年収が無い年は `null`。
   *
   * **前年比は動いた幅しか言えない。** 有報の平均年間給与は会社の平均なので、年齢構成が
   * 変わるだけでも動く。平均年齢が隣にあれば、伸びが年齢の上昇と一緒に起きたかを読める。
   */
  age: number | null;
  /** 基準年（その会社で最初に値のある年）からの累積。基準年の行と欠損の行は `null`。 */
  cumulative: number | null;
}

export interface HistoryTable {
  rows: HistoryRow[];
  /** 累積の基準になった年。値が1つも無ければ `null`。 */
  baseYear: number | null;
}

/**
 * 10年推移の表（T2・Issue #138、T3・#827）。**`history.json` を1社ぶん引くだけで、計算は累積の割り算だけ。**
 *
 * **基準年は会社ごとに違う。** 2017年の値を持たない会社が230社あるので、固定の2017年基準に
 * すると累積の列がその230社で丸ごと空になる。**その会社で最初に値のある年**を基準にし、
 * 列の見出しにその年を書く。累積は基準年からの比なので、間に欠けた年があっても意味が変わらない
 * （内部に欠損のある会社が33社ある。例: 2117 は2023・2024が欠損）。
 */
export function buildHistoryTable(history: SalaryHistory): HistoryTable {
  const { years, values, ages } = history;
  const baseIndex = baseIndexOf(values);
  const baseValue = baseIndex === -1 ? null : values[baseIndex];

  const rows = years.map((year, i) => {
    const value = values[i];
    return {
      year,
      value,
      // 平均年収の無い年に年齢だけを出さない（データでも揃えてある・spec AC-15）。
      age: value === null ? null : (ages[i] ?? null),
      cumulative:
        value === null || baseValue === null || baseValue === 0 || i === baseIndex
          ? null
          : value / baseValue - 1,
    };
  });

  return { rows, baseYear: historyBaseYear(history) };
}

function baseIndexOf(values: readonly (number | null)[]): number {
  return values.findIndex((value) => value !== null);
}

/**
 * 累積の基準年（＝その会社で最初に値のある年）。値が1つも無ければ `null`。
 *
 * 表の列見出し（`2017年比`）と節の説明（「2017年比は会社の平均が動いた幅で…」）の両方が
 * これを読む。**別々に求めると、見出しと説明で違う年を名乗りうる。**
 */
export function historyBaseYear(history: SalaryHistory): number | null {
  const baseIndex = baseIndexOf(history.values);
  return baseIndex === -1 ? null : history.years[baseIndex];
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
