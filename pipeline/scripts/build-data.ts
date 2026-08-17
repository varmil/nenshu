import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedCsv } from "./lib/csv";
import { makeId } from "./lib/slug";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_ROW_COUNT = 1867;
const COMPANIES_JSON_GZIP_LIMIT_BYTES = 100 * 1024;
const DATA_VERSION = "2026-06";
const AGE_POINTS = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67];

export function buildData(outDir: string) {
  const csvText = readFileSync(resolve(ROOT, "data/ranking_unified_2026.csv"), "utf-8");
  const rows = parseUnifiedCsv(csvText);
  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(`companies.json は${EXPECTED_ROW_COUNT}行の想定ですが${rows.length}行でした`);
  }

  const curvesRaw = JSON.parse(readFileSync(resolve(ROOT, "data/annual_curves.json"), "utf-8"));
  const annualIndustry: Record<string, number[]> = curvesRaw.ANNUAL_INDUSTRY;

  const industries = Array.from(new Set(rows.map((r) => r.tse33))).sort((a, b) =>
    a.localeCompare(b, "ja")
  );
  const curveKeys = Object.keys(annualIndustry);

  const ids = new Set<string>();
  const companyRows = rows.map((row) => {
    const id = makeId(row);
    if (ids.has(id)) {
      throw new Error(`id が重複しています: ${id}`);
    }
    ids.add(id);

    const tse33Idx = industries.indexOf(row.tse33);
    const curveIdx = curveKeys.indexOf(row.industry);
    if (curveIdx === -1) {
      throw new Error(
        `${row.name} の産業大分類 "${row.industry}" が annual_curves.json のキーにありません`
      );
    }

    return [
      id,
      row.name,
      tse33Idx,
      curveIdx,
      row.avgAge,
      row.avgTenure,
      Math.round(row.avgSalary),
      Math.round(row.employeesNonConsolidated),
      row.badge === "本社のみ" ? 1 : 0,
    ] as const;
  });

  const companies = {
    meta: {
      version: DATA_VERSION,
      count: companyRows.length,
      generatedAt: new Date().toISOString(),
    },
    industries,
    curveKeys,
    rows: companyRows,
  };

  const curves = {
    agePoints: AGE_POINTS,
    curves: annualIndustry,
  };

  mkdirSync(outDir, { recursive: true });
  const companiesPath = resolve(outDir, "companies.json");
  const curvesPath = resolve(outDir, "curves.json");
  const companiesJson = JSON.stringify(companies);
  writeFileSync(companiesPath, companiesJson);
  writeFileSync(curvesPath, JSON.stringify(curves));

  const gzipSize = gzipSync(companiesJson).length;
  if (gzipSize > COMPANIES_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `companies.json のgzipサイズが上限(100KB)を超えています: ${(gzipSize / 1024).toFixed(1)}KB`
    );
  }

  return { companiesPath, curvesPath, companies, curves, gzipSize };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : "public/data";
  const outDir = resolve(ROOT, out);
  const result = buildData(outDir);
  console.log(`${result.companiesPath}: ${result.companies.rows.length}行, gzip ${(result.gzipSize / 1024).toFixed(1)}KB`);
  console.log(result.curvesPath);
}
