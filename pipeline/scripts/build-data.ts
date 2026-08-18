import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedCsv } from "./lib/csv";
import { makeId } from "./lib/slug";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { TARGET_AGES } from "../../web/features/ranking/types";

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

  const stats = buildStats(companies, curves);

  mkdirSync(outDir, { recursive: true });
  const companiesPath = resolve(outDir, "companies.json");
  const curvesPath = resolve(outDir, "curves.json");
  const statsPath = resolve(outDir, "stats.json");
  const companiesJson = JSON.stringify(companies);
  writeFileSync(companiesPath, companiesJson);
  writeFileSync(curvesPath, JSON.stringify(curves));
  writeFileSync(statsPath, JSON.stringify(stats));

  const gzipSize = gzipSync(companiesJson).length;
  if (gzipSize > COMPANIES_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `companies.json のgzipサイズが上限(100KB)を超えています: ${(gzipSize / 1024).toFixed(1)}KB`
    );
  }

  return { companiesPath, curvesPath, statsPath, companies, curves, stats, gzipSize };
}

interface CompaniesShape {
  industries: string[];
  curveKeys: string[];
  rows: readonly (string | number)[][];
}

/**
 * 企業詳細ページ（`/company/[id]`）が使う母集団統計。
 *
 * 順位は「その年齢時点の推定年収で全1,867社を並べたときの位置」なので、1社ぶんを
 * 出すにも母集団全体の推定が要る。リクエストのたびに 1,867社 × 8年齢 ＝ 約15,000回
 * の補間を回すのは、Workers Free の CPU 10ms/リクエスト制約に対して割に合わない
 * （`docs/ranking/ssr-migration/design.md` の実測でトップページが既に20〜28ms）。
 * ビルド時に確定させ、リクエスト時は当該1社ぶんの16回の補間だけにする。
 *
 * 会社IDをキーにした辞書ではなく `rows` と同じ並びの配列にしている。ページは
 * id から行番号を引く必要が既にあり、その添字をそのまま使えるため。
 * **行がずれると別の会社の順位を出してしまうので、`companies` を組み立てたのと
 * 同じ配列から作る。**
 */
function buildStats(companies: CompaniesShape, curves: { agePoints: number[]; curves: Record<string, number[]> }) {
  const ages = [...TARGET_AGES];
  const rows = companies.rows;

  // 円に直したカーブは産業大分類ごとに1本しかない。1,867行ぶん作り直さない。
  const curvesInYen = new Map<string, number[]>();
  const curveValuesFor = (curveKey: string) => {
    let values = curvesInYen.get(curveKey);
    if (values === undefined) {
      values = curveValuesInYen(curves.curves[curveKey]);
      curvesInYen.set(curveKey, values);
    }
    return values;
  };

  // [行][年齢] の推定年収。
  const estimates = rows.map((row) => {
    const curveValues = curveValuesFor(companies.curveKeys[row[3] as number]);
    return ages.map((age) =>
      estimateSalary(row[6] as number, row[4] as number, curveValues, curves.agePoints, age)
    );
  });

  const population = ages.map((_, k) => {
    const values = estimates.map((e) => e[k]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // 母標準偏差（n で割る）。対象は「掲載している1,867社」そのもので、
    // そこから母集団を推定しているわけではない。
    const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
    return { mean: Math.round(mean), sd: Math.round(Math.sqrt(variance)) };
  });

  const industryCounts = companies.industries.map(
    (_, i) => rows.filter((row) => row[2] === i).length
  );

  // 同額は同順位（自分より高い会社の数 ＋ 1）。
  const rankWithin = (memberIndexes: number[], k: number) => {
    const sorted = [...memberIndexes].sort((a, b) => estimates[b][k] - estimates[a][k]);
    const rankByIndex = new Map<number, number>();
    let higher = 0;
    for (let pos = 0; pos < sorted.length; pos++) {
      if (pos > 0 && estimates[sorted[pos]][k] < estimates[sorted[pos - 1]][k]) {
        higher = pos;
      }
      rankByIndex.set(sorted[pos], higher + 1);
    }
    return rankByIndex;
  };

  const allIndexes = rows.map((_, i) => i);
  const industryIndexes = companies.industries.map((_, i) =>
    allIndexes.filter((j) => rows[j][2] === i)
  );

  const rankAll = rows.map(() => new Array<number>(ages.length));
  const rankIndustry = rows.map(() => new Array<number>(ages.length));
  for (let k = 0; k < ages.length; k++) {
    for (const [i, rank] of rankWithin(allIndexes, k)) rankAll[i][k] = rank;
    for (const members of industryIndexes) {
      for (const [i, rank] of rankWithin(members, k)) rankIndustry[i][k] = rank;
    }
  }

  return {
    ages,
    count: rows.length,
    population,
    industryCounts,
    rankAll,
    rankIndustry,
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : "public/data";
  const outDir = resolve(ROOT, out);
  const result = buildData(outDir);
  console.log(`${result.companiesPath}: ${result.companies.rows.length}行, gzip ${(result.gzipSize / 1024).toFixed(1)}KB`);
  console.log(result.curvesPath);
  console.log(`${result.statsPath}: ${result.stats.ages.length}年齢 × ${result.stats.count}社`);
}
