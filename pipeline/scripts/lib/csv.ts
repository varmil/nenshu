export interface UnifiedRow {
  secCode: string;
  edinetCode: string;
  name: string;
  tse33: string;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employeesNonConsolidated: number;
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
  "period_end", "edinet_code", "doc_id",
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
      name: get("name"),
      tse33: get("tse33"),
      avgAge: Number(get("avg_age")),
      avgTenure: Number(get("avg_tenure")),
      avgSalary: Number(get("avg_salary")),
      employeesNonConsolidated: Number(get("employees_nonconsolidated")),
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
