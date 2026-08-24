/**
 * `worklife.json` を読み戻す。W1・Issue #150。
 *
 * **並びの定義は `pipeline/worklife/json.ts` にあり、これはその写し。**
 * `pipeline/` は web から import できない（別のワークスペースで、tsconfig も
 * vitest の対象も分かれている）ので、`decodeRow` と同じ規則をここに置く。
 * **変えるときは両側を直す**（`docs/worklife/data-ingest/design.md`）。
 *
 * 読むのは `/company/[id]` だけ。**`app/page.tsx` からは import しない**
 * ——トップページのHTMLを1バイトも増やさないため（Issue #22・spec 3.）。
 */

/** 先頭の固定部分。この後ろに雇用管理区分が可変長で続く。 */
const FIXED = {
  overtimeAll: 0,
  overtimeScope: 1,
  paidLeaveAll: 2,
  wageGapAll: 3,
  wageGapRegular: 4,
  wageGapNonRegular: 5,
  wageGapPeriod: 6,
  asOf: 7,
  updatedAt: 8,
} as const;
const FIXED_LENGTH = 9;

/** プールに無い文字列を表す添字。 */
const NO_STRING = -1;

export type WorklifeRow = (number | null)[];

export interface WorklifeData {
  meta: { source: string; matched: number; count: number };
  pool: string[];
  /**
   * `companies.rows` と同じ並びの1,867行。**女性活躍DBに掲載が無い会社は `0`**
   * （突合できなかった177社と、突合できたが3指標を1つも持たない142社）。
   * **行がずれると別の会社の残業時間を出す。**
   */
  rows: (WorklifeRow | 0)[];
  /** 同じ並び。会社が登録した注釈・説明（716社）。無ければ `0`。 */
  notes: (string | 0)[];
}

/** 雇用管理区分ひとつぶん。**名前は会社が登録したまま**（spec 2.2b）。 */
export interface WorklifeUnit {
  unit: string;
  value: number | null;
}

export interface WorklifeRecord {
  overtimeAll: number | null;
  /** 残業の「公表する範囲」（`対象正社員` / `その他` 等）。無ければ空文字。 */
  overtimeScope: string;
  overtimeUnits: WorklifeUnit[];
  paidLeaveAll: number | null;
  paidLeaveUnits: WorklifeUnit[];
  wageGapAll: number | null;
  wageGapRegular: number | null;
  wageGapNonRegular: number | null;
  wageGapPeriod: string;
  asOf: string;
  updatedAt: string;
  /** 会社が登録した注釈・説明。無ければ空文字。 */
  note: string;
}

/**
 * 1社ぶんを読み戻す。掲載が無ければ `null`。
 *
 * **`null` は「節を出さない」ではない**（AC-10）。呼び出し側が「掲載なし」の
 * 見た目に落とす。
 */
export function decodeWorklife(data: WorklifeData, index: number): WorklifeRecord | null {
  const row = data.rows[index];
  if (row === undefined || row === 0) return null;

  const pool = data.pool;
  const text = (i: number | null) => (i === null || i === NO_STRING ? "" : (pool[i] ?? ""));

  let at = FIXED_LENGTH;
  const readUnits = (): WorklifeUnit[] => {
    const count = row[at++] ?? 0;
    const out: WorklifeUnit[] = [];
    for (let k = 0; k < count; k++) {
      out.push({ unit: text(row[at]), value: row[at + 1] ?? null });
      at += 2;
    }
    return out;
  };
  const overtimeUnits = readUnits();
  const paidLeaveUnits = readUnits();

  const note = data.notes[index];
  return {
    overtimeAll: row[FIXED.overtimeAll] ?? null,
    overtimeScope: text(row[FIXED.overtimeScope]),
    overtimeUnits,
    paidLeaveAll: row[FIXED.paidLeaveAll] ?? null,
    paidLeaveUnits,
    wageGapAll: row[FIXED.wageGapAll] ?? null,
    wageGapRegular: row[FIXED.wageGapRegular] ?? null,
    wageGapNonRegular: row[FIXED.wageGapNonRegular] ?? null,
    wageGapPeriod: text(row[FIXED.wageGapPeriod]),
    asOf: text(row[FIXED.asOf]),
    updatedAt: text(row[FIXED.updatedAt]),
    note: note === undefined || note === 0 ? "" : note,
  };
}
