export interface UnifiedRow {
  secCode: string;
  edinetCode: string;
  /** 国税庁の法人番号（13桁）。女性活躍DBとの突合キー（ADR-0009） */
  corporateNumber: string;
  name: string;
  tse33: string;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employeesNonConsolidated: number;
  /**
   * 連結の従業員数。**空の会社が191社ある**（連結財務諸表を作っていない会社）ので
   * `null` になりうる。稼ぐ力（P0・#155）の分母で、そこでは単体で代用する。
   */
  employeesConsolidated: number | null;
  badge: string;
  industry: string;
  docId: string;
  salary35: number;
  /** 決算期の末日（`YYYY-MM-DD`）。この有報が対象にしている事業年度の終わり。 */
  periodEnd: string;
}

const HEADER = [
  "rank_adj", "rank_raw", "rank_delta", "sec_code", "name", "tse33",
  "listed", "avg_age", "avg_tenure", "avg_salary", "salary35",
  "factor", "employees_nonconsolidated", "employees_consolidated",
  "emp_ratio", "badge", "industry", "source",
  "period_end", "edinet_code", "corporate_number", "doc_id",
];

/**
 * data/ranking_unified_2026.csv の最小パーサ。
 * このCSVにクォート・カンマを含むフィールドがないことは確認済み（社名にカンマを含む行は0件）。
 * 想定外の列数が来たら例外で落とす。
 */
export function parseUnifiedCsv(text: string): UnifiedRow[] {
  const withoutBom = text.replace(/^﻿/, "");
  const lines = withoutBom.split(/\r?\n/).filter((line) => line.length > 0);

  const [headerLine, ...dataLines] = lines;
  const header = headerLine.split(",");
  if (header.length !== HEADER.length || header.some((h, i) => h !== HEADER[i])) {
    throw new Error(
      `data/ranking_unified_2026.csv の列がdesignの想定と一致しません: ${headerLine}`
    );
  }

  return dataLines.map((line, lineIndex) => {
    const cols = line.split(",");
    if (cols.length !== HEADER.length) {
      throw new Error(
        `data/ranking_unified_2026.csv の${lineIndex + 2}行目が${HEADER.length}列でありません: ${line}`
      );
    }
    const get = (name: string) => cols[HEADER.indexOf(name)];
    return {
      secCode: get("sec_code"),
      edinetCode: get("edinet_code"),
      corporateNumber: get("corporate_number"),
      name: get("name"),
      tse33: get("tse33"),
      avgAge: Number(get("avg_age")),
      avgTenure: Number(get("avg_tenure")),
      avgSalary: Number(get("avg_salary")),
      employeesNonConsolidated: Number(get("employees_nonconsolidated")),
      employeesConsolidated:
        get("employees_consolidated") === "" ? null : Number(get("employees_consolidated")),
      badge: get("badge"),
      industry: get("industry"),
      docId: get("doc_id"),
      salary35: Number(get("salary35")),
      periodEnd: get("period_end"),
    };
  });
}

export interface SalaryHistoryRow {
  edinetCode: string;
  year: number;
  avgSalary: number;
}

const HISTORY_HEADER = [
  "edinet_code", "year", "avg_salary", "avg_age",
  "employees_nonconsolidated", "source", "period_end", "doc_id",
];

/**
 * data/salary_history.csv の最小パーサ（T0・`docs/timeseries/spec.md` 1.3）。
 *
 * `parseUnifiedCsv` と同じ方針で、想定外の列が来たら例外で落とす。読むのは
 * `edinet_code` / `year` / `avg_salary` の3列だけ——残りは抽出の追跡用に
 * CSVには持たせてあるが、`history.json` には出さない。
 */
export function parseSalaryHistoryCsv(text: string): SalaryHistoryRow[] {
  const withoutBom = text.replace(/^﻿/, "");
  const lines = withoutBom.split(/\r?\n/).filter((line) => line.length > 0);

  const [headerLine, ...dataLines] = lines;
  const header = headerLine.split(",");
  if (header.length !== HISTORY_HEADER.length || header.some((h, i) => h !== HISTORY_HEADER[i])) {
    throw new Error(`data/salary_history.csv の列が想定と一致しません: ${headerLine}`);
  }

  return dataLines.map((line, lineIndex) => {
    const cols = line.split(",");
    if (cols.length !== HISTORY_HEADER.length) {
      throw new Error(
        `data/salary_history.csv の${lineIndex + 2}行目が${HISTORY_HEADER.length}列でありません: ${line}`
      );
    }
    return {
      edinetCode: cols[0],
      year: Number(cols[1]),
      avgSalary: Number(cols[2]),
    };
  });
}

export interface PerformanceHistoryRow {
  edinetCode: string;
  year: number;
  /** その年の経常利益（円）。**赤字は負のまま**（59社ある）。 */
  ordinaryIncome: number;
  /** `consolidated` / `nonconsolidated`。連結が無い年だけ単体で埋まる。 */
  basis: string;
  /**
   * その年の**連結**従業員数。
   *
   * **その年の書類の「当期」からしか取れない**（P2・Issue #168）。経常利益は
   * 1書類に5期ぶんタグ付けされているが、従業員数は当期だけで、5期ぶんは本文の
   * 中にしかない。だから遡って埋めた年（`back > 0`）では `null` になる。
   */
  employeesConsolidated: number | null;
  /** 同じくその年の**単体**従業員数。連結が無い会社の代用に使う。 */
  employeesNonConsolidated: number | null;
}

const PERFORMANCE_HEADER = [
  "edinet_code", "year", "ordinary_income", "oi_basis",
  "employees_consolidated", "employees_nonconsolidated", "source_year", "back",
];

/**
 * data/performance_history.csv の最小パーサ（P0・`docs/performance/spec.md` 1.4）。
 *
 * `parseSalaryHistoryCsv` と同じ方針。読むのは4列だけ——従業員数は
 * `ranking_unified_2026.csv` の側（当期・全社ぶん）を使うので、ここでは
 * 年次の追跡用に持たせてあるだけになる。**P2（稼ぐ力の推移）で年次の
 * 従業員数が要るようになったらここを読む。**
 */
export function parsePerformanceHistoryCsv(text: string): PerformanceHistoryRow[] {
  const withoutBom = text.replace(/^﻿/, "");
  const lines = withoutBom.split(/\r?\n/).filter((line) => line.length > 0);

  const [headerLine, ...dataLines] = lines;
  const header = headerLine.split(",");
  if (
    header.length !== PERFORMANCE_HEADER.length ||
    header.some((h, i) => h !== PERFORMANCE_HEADER[i])
  ) {
    throw new Error(`data/performance_history.csv の列が想定と一致しません: ${headerLine}`);
  }

  return dataLines.map((line, lineIndex) => {
    const cols = line.split(",");
    if (cols.length !== PERFORMANCE_HEADER.length) {
      throw new Error(
        `data/performance_history.csv の${lineIndex + 2}行目が${PERFORMANCE_HEADER.length}列でありません: ${line}`
      );
    }
    const numberOrNull = (raw: string) => (raw === "" ? null : Number(raw));
    return {
      edinetCode: cols[0],
      year: Number(cols[1]),
      ordinaryIncome: Number(cols[2]),
      basis: cols[3],
      employeesConsolidated: numberOrNull(cols[4]),
      employeesNonConsolidated: numberOrNull(cols[5]),
    };
  });
}
