export interface UnifiedRow {
  secCode: string;
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
}

const HEADER = [
  "rank_adj", "rank_raw", "rank_delta", "sec_code", "name", "tse33",
  "listed", "avg_age", "avg_tenure", "avg_salary", "salary35",
  "factor", "employees_nonconsolidated", "employees_consolidated",
  "emp_ratio", "badge", "salary35_fit", "industry", "source",
  "period_end", "doc_id",
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
    };
  });
}
