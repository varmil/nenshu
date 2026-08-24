import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedCsv, parseSalaryHistoryCsv } from "./lib/csv";
import { parseCsv } from "../worklife/csv";
import { encodeRow, StringPool, type WorklifeRow } from "../worklife/json";
import { makeId } from "./lib/slug";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { TARGET_AGES } from "../../web/features/ranking/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_ROW_COUNT = 1867;
const COMPANIES_JSON_GZIP_LIMIT_BYTES = 100 * 1024;
const HISTORY_JSON_GZIP_LIMIT_BYTES = 150 * 1024;
// 実測 131KB（注釈・説明 716社ぶんを同梱した状態）。切り出す前に気づける余白として
// 上限を 160KB に置く。増分の6割が注釈なので、超えたらそこを別ファイルにする
// （`docs/worklife/overview.md`）。
const WORKLIFE_JSON_GZIP_LIMIT_BYTES = 160 * 1024;
const DATA_VERSION = "2026-06";
const AGE_POINTS = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67];

/**
 * 掲載データの決算期（`YYYY-MM`）を CSV の `period_end` から導く（S3・Issue #134、
 * `docs/site-chrome/spec.md` 5.）。**最頻の1つを代表として採る**——決算期は
 * 全社が同じではなく、いまのデータは1,865社が3月期・2社が4月期になる。
 *
 * **直書きしない理由は社数（`meta.count`）と同じ。** 画面と title・description の
 * 何箇所にも書くものなので、手で書くと年1回のデータ更新でそこだけ古い年が残る。
 *
 * 代表が過半に届かないときは落とす。そのときは「1つの決算期で代表できる」という
 * 前提そのものが崩れており、黙って多数派を出すと読者に嘘の時点を見せることになる。
 */
export function dominantFiscalPeriod(rows: { periodEnd: string }[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const period = row.periodEnd.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error(`period_end が YYYY-MM-DD の形でありません: ${row.periodEnd}`);
    }
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }

  let top = "";
  let topCount = 0;
  for (const [period, count] of counts) {
    if (count > topCount || (count === topCount && period > top)) {
      top = period;
      topCount = count;
    }
  }
  if (topCount * 2 <= rows.length) {
    throw new Error(
      `決算期が1つに代表できません（最頻 ${top} が${topCount}/${rows.length}社）。` +
        `docs/site-chrome/spec.md 5.3 の前提を見直すこと。`
    );
  }
  return top;
}

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
      // 掲載データの決算期（S3・`docs/site-chrome/spec.md` 5.）。web 側はこの1つの値から
      // 「2026年3月期」を組み立てる（`web/lib/data/period.ts`）。
      fiscalPeriod: dominantFiscalPeriod(rows),
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
  const population = pickPopulation(stats);
  const history = buildHistory(rows, companyRows);
  const worklife = buildWorklife(companyRows);

  mkdirSync(outDir, { recursive: true });
  const companiesPath = resolve(outDir, "companies.json");
  const curvesPath = resolve(outDir, "curves.json");
  const statsPath = resolve(outDir, "stats.json");
  const populationPath = resolve(outDir, "population.json");
  const historyPath = resolve(outDir, "history.json");
  const worklifePath = resolve(outDir, "worklife.json");
  const companiesJson = JSON.stringify(companies);
  const historyJson = JSON.stringify(history);
  const worklifeJson = JSON.stringify(worklife);
  writeFileSync(companiesPath, companiesJson);
  writeFileSync(curvesPath, JSON.stringify(curves));
  writeFileSync(statsPath, JSON.stringify(stats));
  writeFileSync(populationPath, JSON.stringify(population));
  writeFileSync(historyPath, historyJson);
  writeFileSync(worklifePath, worklifeJson);

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

  const worklifeGzipSize = gzipSync(worklifeJson).length;
  if (worklifeGzipSize > WORKLIFE_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `worklife.json のgzipサイズが上限(160KB)を超えています: ${(worklifeGzipSize / 1024).toFixed(1)}KB`
    );
  }

  return {
    companiesPath,
    curvesPath,
    statsPath,
    populationPath,
    historyPath,
    worklifePath,
    companies,
    curves,
    stats,
    population,
    history,
    worklife,
    gzipSize,
    historyGzipSize,
    worklifeGzipSize,
  };
}

/**
 * `stats.json` から母集団の統計だけを切り出したもの（R0・`docs/runtime/spec.md` 2.3）。
 * これが `population.json` になる。
 */
export type PopulationJson = {
  bases: (number | null)[];
  count: number;
  population: { mean: number; sd: number }[];
};

/**
 * `/` が読むのはここだけ（337B）なのに、`stats.json` を丸ごと読むと 131KB を
 * `JSON.parse` することになる。**import したファイルは、1バイトしか使わなくても
 * 丸ごと解析され、しかも isolate の初回リクエストに課金される**（R0・Issue #118）。
 *
 * **`stats.json` は残す。** `/company/[id]` は `rankAll`・`rankIndustry`・
 * `distribution` を使うので、あちらは丸ごと要る。
 *
 * 切り出した値が元とずれないことは、ここが同じオブジェクトを参照していることと
 * `build-data.test.ts` の突き合わせで担保する（AC-5）。
 */
export function pickPopulation(stats: {
  bases: (number | null)[];
  count: number;
  population: { mean: number; sd: number }[];
}): PopulationJson {
  return { bases: stats.bases, count: stats.count, population: stats.population };
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

/**
 * 働きやすさ指標（`worklife.json`）。W0・Issue #149。
 *
 * **`/company/[id]` だけが import する。`app/page.tsx` からは読まない**
 * ——トップページのHTML（gzip 62KB）を1バイトも増やさないため（Issue #22）。
 *
 * **行は `companies.rows` と同じ並びにする。** `stats.json` と同じ理由で、
 * **行がずれると別の会社の残業時間を出す。** データが無い会社には `0` を置く。
 * 並びの定義は `pipeline/worklife/json.ts` の1か所にある。
 *
 * 注釈・説明（716社）は本文が長い（平均186字）ので、行の配列とは別に持つ。
 * 数値だけを読む場面で長い文字列を跨がずに済む。
 */
function buildWorklife(companyRows: readonly (readonly (string | number)[])[]) {
  const csvText = readFileSync(resolve(ROOT, "data/worklife_2026.csv"), "utf-8");
  const table = parseCsv(csvText);
  const header = table[0] ?? [];
  const byId = new Map<string, Record<string, string>>();
  for (const line of table.slice(1)) {
    const cells: Record<string, string> = {};
    header.forEach((name, i) => (cells[name] = line[i] ?? ""));
    byId.set(cells.id, cells);
  }

  const pool = new StringPool();
  const rows: (WorklifeRow | 0)[] = [];
  const notes: (string | 0)[] = [];
  let matched = 0;
  for (const company of companyRows) {
    const cells = byId.get(String(company[0]));
    if (cells === undefined) {
      rows.push(0);
      notes.push(0);
      continue;
    }
    matched++;
    rows.push(encodeRow(cells, pool));
    notes.push(cells.wage_gap_note === "" ? 0 : cells.wage_gap_note);
  }
  if (matched !== byId.size) {
    throw new Error(
      `worklife_2026.csv の${byId.size}行のうち${matched}行しか companies に紐づきませんでした`
    );
  }

  return {
    meta: {
      source: "mhlw-positivedb",
      matched,
      count: companyRows.length,
    },
    pool: pool.values,
    rows,
    notes,
  };
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

  // 中位と分布の形（C2・`docs/company/spec.md` 1.13）。平均との差だけでは、右に
  // 強く裾を引く分布の中でその会社が「やや上」なのか「裾のほう」なのかが分からない。
  const distribution = bases.map((_, k) => buildDistribution(estimates.map((e) => e[k])));

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
    distribution,
    industryCounts,
    rankAll,
    rankIndustry,
  };
}

/** ヒストグラムの階級幅の候補（円）。読者が読める丸い数字だけを使う。 */
const HISTOGRAM_WIDTH_LADDER = [10, 20, 25, 50, 100, 200, 250, 500, 1000].map((v) => v * 10_000);
const HISTOGRAM_BINS = 9;

/**
 * 1つの表示基準ぶんの中位と9ビンのヒストグラム（spec 1.13）。
 *
 * **階級を固定値にできない。** 25歳そろえの分布は 249〜788万円、実測値は
 * 332〜2,178万円で、同じ区切りを当てると片方は9ビンのうち7つが空になる。
 * 表示基準ごとに幅と下限を決める。
 *
 * 幅は「2〜95パーセンタイルが9ビンに収まる最小の丸い数字」。**両端のビンは外側を
 * 吸収する**（`min` 未満は先頭、`min + 幅×8` 以上は末尾）——最大2,178万円まで
 * 等間隔で並べると、実データの9割が最初の2ビンに潰れるため。ラベルは
 * 「◯万円未満」「◯万円以上」になる。
 */
function buildDistribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const span = at(0.95) - at(0.02);
  const width =
    HISTOGRAM_WIDTH_LADDER.find((w) => w * HISTOGRAM_BINS >= span) ??
    HISTOGRAM_WIDTH_LADDER[HISTOGRAM_WIDTH_LADDER.length - 1];
  const min = Math.floor(at(0.02) / width) * width;

  const counts = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const value of sorted) {
    const bin = Math.floor((value - min) / width);
    counts[Math.max(0, Math.min(HISTOGRAM_BINS - 1, bin))] += 1;
  }

  // 中位は実在する会社の金額をそのまま採る（偶数件でも中央2件を平均しない）。
  // 「この会社が中位」と言えるほうが読者に説明しやすい。
  return { median: sorted[Math.floor(sorted.length / 2)], min, width, counts };
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
  console.log(`${result.populationPath}: ${result.population.population.length}表示基準ぶんの母集団`);
  console.log(
    `${result.historyPath}: ${Object.keys(result.history.byId).length}社 × ${result.history.years.length}年, ` +
      `gzip ${(result.historyGzipSize / 1024).toFixed(1)}KB`
  );
  console.log(
    `${result.worklifePath}: ${result.worklife.meta.matched}社, ` +
      `gzip ${(result.worklifeGzipSize / 1024).toFixed(1)}KB`
  );
}
