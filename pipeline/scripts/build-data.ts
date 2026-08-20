import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedCsv, parseSalaryHistoryCsv } from "./lib/csv";
import { makeId } from "./lib/slug";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { TARGET_AGES } from "../../web/features/ranking/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_ROW_COUNT = 1867;
const COMPANIES_JSON_GZIP_LIMIT_BYTES = 100 * 1024;
const HISTORY_JSON_GZIP_LIMIT_BYTES = 150 * 1024;
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
  const history = buildHistory(rows, companyRows);

  mkdirSync(outDir, { recursive: true });
  const companiesPath = resolve(outDir, "companies.json");
  const curvesPath = resolve(outDir, "curves.json");
  const statsPath = resolve(outDir, "stats.json");
  const historyPath = resolve(outDir, "history.json");
  const companiesJson = JSON.stringify(companies);
  const historyJson = JSON.stringify(history);
  writeFileSync(companiesPath, companiesJson);
  writeFileSync(curvesPath, JSON.stringify(curves));
  writeFileSync(statsPath, JSON.stringify(stats));
  writeFileSync(historyPath, historyJson);

  const gzipSize = gzipSync(companiesJson).length;
  if (gzipSize > COMPANIES_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `companies.json のgzipサイズが上限(100KB)を超えています: ${(gzipSize / 1024).toFixed(1)}KB`
    );
  }

  const historyGzipSize = gzipSync(historyJson).length;
  if (historyGzipSize > HISTORY_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `history.json のgzipサイズが上限(150KB)を超えています: ${(historyGzipSize / 1024).toFixed(1)}KB`
    );
  }

  return {
    companiesPath,
    curvesPath,
    statsPath,
    historyPath,
    companies,
    curves,
    stats,
    history,
    gzipSize,
    historyGzipSize,
  };
}

/**
 * 平均年収の10年推移（T0・`docs/timeseries/spec.md` 1.3）。
 *
 * キーは**企業ID**（証券コード／EDINETコード、ADR-0006）で `companies.json` の
 * `id` と一致する。CSV 側の主キーは `edinet_code`——証券コードは上場・廃止で
 * 変わるが EDINETコードは年をまたいで変わらないため、名寄せはあちらで行い、
 * ここで公開URLのIDに移し替える。
 *
 * **その年の有報が無ければ `null` を入れる。前後から内挿しない**（spec AC-4）。
 * 欠けていること自体を企業詳細ページで見せるため。
 *
 * 全年 `null` の会社はキーごと落とす。1,867社ぶんの空配列を配る意味がない。
 *
 * **`/` はこれを読まない。** 企業詳細ページだけが読む（Issue #22）。
 */
function buildHistory(
  rows: ReturnType<typeof parseUnifiedCsv>,
  companyRows: readonly (readonly (string | number)[])[]
) {
  const csvPath = resolve(ROOT, "data/salary_history.csv");
  const historyRows = parseSalaryHistoryCsv(readFileSync(csvPath, "utf-8"));

  const years = Array.from(new Set(historyRows.map((r) => r.year))).sort((a, b) => a - b);
  const yearIndex = new Map(years.map((y, i) => [y, i]));

  // edinet_code → その会社の年次配列
  const byEdinetCode = new Map<string, (number | null)[]>();
  for (const row of historyRows) {
    let values = byEdinetCode.get(row.edinetCode);
    if (values === undefined) {
      values = new Array<number | null>(years.length).fill(null);
      byEdinetCode.set(row.edinetCode, values);
    }
    values[yearIndex.get(row.year)!] = row.avgSalary;
  }

  // 企業ID に移し替える。companies.json と同じ順・同じIDで引けるようにする。
  const byId: Record<string, (number | null)[]> = {};
  rows.forEach((row, i) => {
    const values = byEdinetCode.get(row.edinetCode);
    if (values === undefined || values.every((v) => v === null)) return;
    byId[companyRows[i][0] as string] = values;
  });

  return { years, byId };
}

interface CompaniesShape {
  industries: string[];
  curveKeys: string[];
  rows: readonly (string | number)[][];
}

/**
 * 企業詳細ページ（`/company/[id]`）が使う母集団統計。
 *
 * 順位は「その表示基準で全1,867社を並べたときの位置」なので、1社ぶんを出すにも
 * 母集団全体の値が要る。リクエストのたびに 1,867社 × 8年齢 ＝ 約15,000回の補間を
 * 回すのは、Workers Free の CPU 10ms/リクエスト制約に対して割に合わない
 * （`docs/ranking/ssr-migration/design.md` の実測でトップページが既に20〜28ms）。
 * ビルド時に確定させ、リクエスト時は当該1社ぶんの16回の補間だけにする。
 *
 * **表示基準は `bases` の並び（先頭が実測値、続いて8年齢）**（ADR-0007）。実測値の
 * 順位・偏差値は有報の平均年間給与そのままの分布に対する値で、年齢そろえのそれとは
 * 別物になる。
 *
 * 会社IDをキーにした辞書ではなく `rows` と同じ並びの配列にしている。ページは
 * id から行番号を引く必要が既にあり、その添字をそのまま使えるため。
 * **行がずれると別の会社の順位を、列がずれると別の表示基準の順位を出してしまうので、
 * `companies` を組み立てたのと同じ配列から作り、`build-data.test.ts` で固定する。**
 */
function buildStats(companies: CompaniesShape, curves: { agePoints: number[]; curves: Record<string, number[]> }) {
  const ages = [...TARGET_AGES];
  // 表示基準の並び。先頭の null が「実測値」（有報の平均年間給与そのまま）で、
  // 残りが「年齢そろえ」の8年齢。population / rankAll / rankIndustry はすべて
  // この並びの添字で引く（ADR-0007）。
  const bases: (number | null)[] = [null, ...ages];
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

  // [行][表示基準] の金額。実測値の列だけは補正を通さず avgSalary をそのまま入れる。
  const estimates = rows.map((row) => {
    const curveValues = curveValuesFor(companies.curveKeys[row[3] as number]);
    const avgSalary = row[6] as number;
    return bases.map((basis) =>
      basis === null
        ? avgSalary
        : estimateSalary(avgSalary, row[4] as number, curveValues, curves.agePoints, basis)
    );
  });

  const population = bases.map((_, k) => {
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

  const rankAll = rows.map(() => new Array<number>(bases.length));
  const rankIndustry = rows.map(() => new Array<number>(bases.length));
  for (let k = 0; k < bases.length; k++) {
    for (const [i, rank] of rankWithin(allIndexes, k)) rankAll[i][k] = rank;
    for (const members of industryIndexes) {
      for (const [i, rank] of rankWithin(members, k)) rankIndustry[i][k] = rank;
    }
  }

  return {
    bases,
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
  console.log(`${result.statsPath}: ${result.stats.bases.length}表示基準 × ${result.stats.count}社`);
  console.log(
    `${result.historyPath}: ${Object.keys(result.history.byId).length}社 × ${result.history.years.length}年, ` +
      `gzip ${(result.historyGzipSize / 1024).toFixed(1)}KB`
  );
}
