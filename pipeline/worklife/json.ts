/**
 * `worklife.json` の並び。**`companies.json` と同じ「文字列プール＋フラットな配列」**にする。
 *
 * 入れ子にすると起動時に作られるオブジェクトが増え、Worker のアイソレート起動が
 * 重くなる（Node 22 の実測で 入れ子 30.8ms → フラット 12.5ms。`companies.json` は 6.2ms）。
 *
 * **行は `companies.rows` と同じ並びにする。** `stats.json` と同じ制約で、
 * **行がずれると別の会社の残業時間を出す。** データが無い会社は `0`（数値のゼロ）を置く。
 *
 * **この並びは W1（表示）の読み手が写すことになる。** 変えるときは両側を直す。
 */

/** 先頭の固定部分。この後ろに雇用管理区分が可変長で続く。 */
export const FIXED = {
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
export const FIXED_LENGTH = 9;

/** プールに無い文字列を表す添字。 */
export const NO_STRING = -1;

export type WorklifeRow = (number | null)[];
export type DecodedUnit = { unit: string; value: number | null };
export type Decoded = {
  overtimeAll: number | null;
  overtimeScope: string;
  overtimeUnits: DecodedUnit[];
  paidLeaveAll: number | null;
  paidLeaveUnits: DecodedUnit[];
  wageGapAll: number | null;
  wageGapRegular: number | null;
  wageGapNonRegular: number | null;
  wageGapPeriod: string;
  asOf: string;
  updatedAt: string;
};

export class StringPool {
  private readonly index = new Map<string, number>();
  readonly values: string[] = [];

  put(value: string): number {
    const v = (value ?? "").trim();
    if (v === "") return NO_STRING;
    const found = this.index.get(v);
    if (found !== undefined) return found;
    this.index.set(v, this.values.length);
    this.values.push(v);
    return this.values.length - 1;
  }
}

const numberOrNull = (raw: string): number | null => (raw === "" ? null : Number(raw));

/**
 * `worklife_2026.csv` の1行を並びに直す。
 * 雇用管理区分は**件数を先に置いてから対を並べる**——空のスロットを5つ固定で持つと、
 * 区分を持たない会社（残業で1,124社）のぶんだけ要素が無駄に増える。
 */
export function encodeRow(cells: Record<string, string>, pool: StringPool): WorklifeRow {
  const row: WorklifeRow = new Array(FIXED_LENGTH);
  row[FIXED.overtimeAll] = numberOrNull(cells.overtime_all);
  row[FIXED.overtimeScope] = pool.put(cells.overtime_scope);
  row[FIXED.paidLeaveAll] = numberOrNull(cells.paid_leave_all);
  row[FIXED.wageGapAll] = numberOrNull(cells.wage_gap_all);
  row[FIXED.wageGapRegular] = numberOrNull(cells.wage_gap_regular);
  row[FIXED.wageGapNonRegular] = numberOrNull(cells.wage_gap_nonregular);
  row[FIXED.wageGapPeriod] = pool.put(cells.wage_gap_period);
  row[FIXED.asOf] = pool.put(cells.as_of);
  row[FIXED.updatedAt] = pool.put(cells.updated_at);

  for (const [namePrefix, valueSuffix] of [
    ["overtime_unit", "_hours"],
    ["paid_leave_unit", "_rate"],
  ] as const) {
    const units: [number, number | null][] = [];
    for (let n = 1; n <= 5; n++) {
      const unit = cells[`${namePrefix}${n}`] ?? "";
      const value = cells[`${namePrefix}${n}${valueSuffix}`] ?? "";
      if (unit === "" && value === "") continue;
      units.push([pool.put(unit), numberOrNull(value)]);
    }
    row.push(units.length);
    for (const [nameIdx, value] of units) row.push(nameIdx, value);
  }
  return row;
}

/** 並びを読み戻す。テストと、W1 の読み手が写す元になる。 */
export function decodeRow(row: WorklifeRow, pool: readonly string[]): Decoded {
  const text = (i: number | null) => (i === null || i === NO_STRING ? "" : pool[i]);
  let at = FIXED_LENGTH;
  const readUnits = (): DecodedUnit[] => {
    const count = row[at++] ?? 0;
    const out: DecodedUnit[] = [];
    for (let k = 0; k < count; k++) {
      out.push({ unit: text(row[at]), value: row[at + 1] });
      at += 2;
    }
    return out;
  };
  const overtimeUnits = readUnits();
  const paidLeaveUnits = readUnits();
  return {
    overtimeAll: row[FIXED.overtimeAll],
    overtimeScope: text(row[FIXED.overtimeScope]),
    overtimeUnits,
    paidLeaveAll: row[FIXED.paidLeaveAll],
    paidLeaveUnits,
    wageGapAll: row[FIXED.wageGapAll],
    wageGapRegular: row[FIXED.wageGapRegular],
    wageGapNonRegular: row[FIXED.wageGapNonRegular],
    wageGapPeriod: text(row[FIXED.wageGapPeriod]),
    asOf: text(row[FIXED.asOf]),
    updatedAt: text(row[FIXED.updatedAt]),
  };
}
