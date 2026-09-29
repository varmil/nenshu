/**
 * 10年推移の窓（refresh の D5・#875・`docs/refresh/history-window/design.md`）。
 *
 * **推移は会社ごとに、その会社の直近10年を出す**（`docs/refresh/spec.md` 1.10）。窓の右端は
 * その会社の推移で値のある最新の年（＝数字に反映した有報を提出した年）で、有報が出た日に
 * その会社の窓だけが1年ずれる。平均年収・在籍年数・稼ぐ力の3つの推移は同じ窓を使う。
 *
 * **このファイルは `pipeline/scripts/build-data.ts` も import する**——データを窓に詰める側と、
 * 画面で年を振る側が同じ関数を通す。alias（`@/`）を使わない。
 */

/** 窓の長さ（年）。 */
export const HISTORY_SPAN = 10;

/** 右端 `end` から数えた窓の年（古い順）。 */
export function historyWindowYears(end: number, span: number = HISTORY_SPAN): number[] {
  return Array.from({ length: span }, (_, k) => end - span + 1 + k);
}

/**
 * `history.json` の形（T0〜T4・refresh の D5）。**配列はどれも会社の窓の10年ぶん**で、
 * 年は `endById` から `historyWindowYears` で振る。全社共通の年の並びは持たない。
 */
export interface HistoryData {
  /** 会社ごとの窓の右端（その会社の推移で値のある最新の年）。 */
  endById: Record<string, number>;
  /** 平均年収。 */
  byId: Record<string, (number | null)[]>;
  /** 平均年齢（T3・#827）。`byId` と同じ会社・同じ年に値を持つ。 */
  ageById: Record<string, (number | null)[]>;
  /** 在籍年数（T4・#835）。`byId` と同じ会社を持ち、平均年収の無い年は `null`。 */
  tenureById: Record<string, (number | null)[]>;
  /** 在籍年数の業種の中央値の年（全社の窓を覆う連続した年）。 */
  medianYears: number[];
  /** 在籍年数の業種の中央値（T4）。`companies.industries` の並びで、各配列は `medianYears` にそろう。 */
  tenureIndustryMedian: (number | null)[][];
}

/**
 * `profit-history.json` の形（P2・refresh の D5）。**窓は `history.json` の同じ会社の窓**
 * （右端は `HistoryData.endById` だけが持つ）。
 */
export interface ProfitHistoryData {
  profit: Record<string, (number | null)[]>;
  income: Record<string, (number | null)[]>;
  employees: Record<string, (number | null)[]>;
}
