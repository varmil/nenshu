import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseUnifiedCsv,
  parseSalaryHistoryCsv,
  parsePerformanceHistoryCsv,
} from "./lib/csv";
import { parseCsv } from "../worklife/csv";
import { encodeRow, StringPool, type WorklifeRow } from "../worklife/json";
import { makeId } from "./lib/slug";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { ranks, representativeValue } from "../../web/features/company/lib/radar";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { TARGET_AGES } from "../../web/features/ranking/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_ROW_COUNT = 2961;
const COMPANIES_JSON_GZIP_LIMIT_BYTES = 100 * 1024;
const HISTORY_JSON_GZIP_LIMIT_BYTES = 150 * 1024;
// 実測 131KB（注釈・説明 716社ぶんを同梱した状態）。切り出す前に気づける余白として
// 上限を 160KB に置く。増分の6割が注釈なので、超えたらそこを別ファイルにする
// （`docs/worklife/overview.md`）。
const WORKLIFE_JSON_GZIP_LIMIT_BYTES = 160 * 1024;
// 実測 8.6KB（1,867社ぶんの整数1本と業種33件の中央値だけ）。数値の配列2本しか
// 持たないので、桁が変わったら中身が変わったということ。上限は 32KB に置く。
const PERFORMANCE_JSON_GZIP_LIMIT_BYTES = 32 * 1024;
/** 稼ぐ力の中央値を採る期間（`docs/performance/spec.md` 1.2）。 */
const PERFORMANCE_YEARS = 5;
// 実測 12.3KB（1,867社 × 4軸のパーセンタイルと値）。上限は 48KB。
const RADAR_JSON_GZIP_LIMIT_BYTES = 48 * 1024;
// 1,867社 × 10年 × 3本（稼ぐ力・経常利益・従業員数）。上限は 256KB。
const PROFIT_HISTORY_JSON_GZIP_LIMIT_BYTES = 256 * 1024;
const DATA_VERSION = "2026-06";
const AGE_POINTS = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67];

/**
 * 掲載データの決算期の**幅**（`YYYY-MM` の最古と最新）を CSV の `period_end` から
 * 導く（E1・`docs/expansion/spec.md` 1.4、S3・`docs/site-chrome/spec.md` 5.）。
 *
 * **最頻の1つを代表として採るのはやめた。** 母集団を直近12か月に広げると
 * （ADR-0011）3月期は 63.5% まで下がり、**「過半に届かなければ落とす」という
 * 旧ガードは通ってしまう**——1,081社の決算期が違うまま「2026年3月期」と名乗る
 * ことになる。**落ちないほうが危ない。**
 *
 * **直書きしない理由は社数（`meta.count`）と同じ。** 画面と title・description の
 * 何箇所にも書くものなので、手で書くと年1回のデータ更新でそこだけ古い年が残る。
 */
export function fiscalPeriodRange(rows: { periodEnd: string }[]): {
  from: string;
  to: string;
} {
  if (rows.length === 0) {
    throw new Error("決算期を導く行がありません");
  }
  let from = "";
  let to = "";
  for (const row of rows) {
    const period = row.periodEnd.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error(`period_end が YYYY-MM-DD の形でありません: ${row.periodEnd}`);
    }
    if (from === "" || period < from) from = period;
    if (to === "" || period > to) to = period;
  }

  // **代表の過半チェックを外したぶん、幅そのものをガードにする。** 母集団は
  // 「直近12か月に有報を出した会社」（ADR-0011）なので、決算期の幅は普通なら
  // 12か月に収まり、提出が遅れた会社が混じっても15か月程度で止まる（拡大後の
  // 実測が 2025-03〜2026-05 = 15か月）。**24か月を超えるのは取得側の異常**で、
  // 黙って通すと何年も前の数字が同じ表に並ぶ。
  const months = monthsBetween(from, to);
  if (months > 24) {
    throw new Error(
      `決算期の幅が広すぎます（${from} 〜 ${to} = ${months}か月）。` +
        `取得の窓（docs/adr/0011-company-universe-twelve-month-window.md）を確認すること。`
    );
  }
  return { from, to };
}

/** `YYYY-MM` 同士の月数の差。 */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * 母集団の内訳（`pipeline/data/universe.json`。E2・`docs/expansion/spec.md` 1.3）。
 * **CSV の行からは出せないものだけ**を持つ——取得の窓と、掲載条件で落とした社数。
 * 書くのは `pipeline/salary/unified.py` の `save_universe`。
 */
interface Universe {
  filingWindow: { from: string; to: string };
  minEmployees: number;
  excludedByEmployees: number;
}

function readUniverse(): Universe {
  const raw = JSON.parse(readFileSync(resolve(ROOT, "data/universe.json"), "utf-8"));
  const { filingWindow, minEmployees, excludedByEmployees } = raw ?? {};
  if (
    typeof filingWindow?.from !== "string" ||
    typeof filingWindow?.to !== "string" ||
    typeof minEmployees !== "number" ||
    typeof excludedByEmployees !== "number"
  ) {
    throw new Error(
      "pipeline/data/universe.json の形が想定と違います。" +
        "pipeline/salary/unified.py を回して作り直すこと。"
    );
  }
  return { filingWindow, minEmployees, excludedByEmployees };
}

export function buildData(outDir: string) {
  const csvText = readFileSync(resolve(ROOT, "data/ranking_unified_2026.csv"), "utf-8");
  const rows = parseUnifiedCsv(csvText);
  const universe = readUniverse();
  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(`companies.json は${EXPECTED_ROW_COUNT}行の想定ですが${rows.length}行でした`);
  }

  const curvesRaw = JSON.parse(readFileSync(resolve(ROOT, "data/annual_curves.json"), "utf-8"));
  const annualIndustry: Record<string, number[]> = curvesRaw.ANNUAL_INDUSTRY;

  const industries = Array.from(new Set(rows.map((r) => r.tse33))).sort((a, b) =>
    a.localeCompare(b, "ja")
  );
  const curveKeys = Object.keys(annualIndustry);

  // **会社ごとの決算期は文字列プールの添字で持つ**（E1）。企業詳細は1社ぶんなので
  // 幅ではなく実際の決算期を出せる（`docs/expansion/spec.md` 1.4）。値の種類は
  // 現状2つ・拡大後14しかないので、`YYYY-MM` をそのまま並べず添字にする——
  // **実測でトップページの HTML が gzip +1,301 B**（そのまま並べると4倍以上）。
  const periods = Array.from(new Set(rows.map((r) => r.periodEnd.slice(0, 7)))).sort();

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
      periods.indexOf(row.periodEnd.slice(0, 7)),
    ] as const;
  });

  const companies = {
    meta: {
      version: DATA_VERSION,
      count: companyRows.length,
      // 掲載データの決算期の**幅**（E1・`docs/expansion/spec.md` 1.4）。web 側は
      // この2つの値から「2026年3月期〜4月期」を組み立てる（`web/lib/data/period.ts`）。
      fiscalPeriodRange: fiscalPeriodRange(rows),
      // 取得の窓と、掲載条件で省いた社数（E2・`docs/expansion/spec.md` 1.3）。
      // **どちらも CSV の行からは出せない**——窓は行に残らず、落とした会社は
      // そもそも行にならない。`unified.py` が書いた内訳を読む。
      filingWindow: universe.filingWindow,
      excluded: {
        minEmployees: universe.minEmployees,
        byEmployees: universe.excludedByEmployees,
      },
      generatedAt: new Date().toISOString(),
    },
    industries,
    curveKeys,
    // 会社ごとの決算期（`YYYY-MM`・昇順）。`rows` の末尾がこの添字を持つ。
    periods,
    rows: companyRows,
  };

  const curves = {
    agePoints: AGE_POINTS,
    curves: annualIndustry,
  };

  const stats = buildStats(companies, curves);
  const history = buildHistory(rows, companyRows);
  const worklife = buildWorklife(companyRows);
  const performance = buildPerformance(rows, industries);
  const radar = buildRadar(rows, companyRows, performance);
  const profitHistory = buildProfitHistory(rows, companyRows, history.years);

  mkdirSync(outDir, { recursive: true });
  const companiesPath = resolve(outDir, "companies.json");
  const curvesPath = resolve(outDir, "curves.json");
  const statsPath = resolve(outDir, "stats.json");
  const historyPath = resolve(outDir, "history.json");
  const worklifePath = resolve(outDir, "worklife.json");
  const performancePath = resolve(outDir, "performance.json");
  const radarPath = resolve(outDir, "radar.json");
  const profitHistoryPath = resolve(outDir, "profit-history.json");
  const companiesJson = JSON.stringify(companies);
  const historyJson = JSON.stringify(history);
  const worklifeJson = JSON.stringify(worklife);
  const performanceJson = JSON.stringify(performance);
  const radarJson = JSON.stringify(radar);
  const profitHistoryJson = JSON.stringify(profitHistory);
  writeFileSync(companiesPath, companiesJson);
  writeFileSync(curvesPath, JSON.stringify(curves));
  writeFileSync(statsPath, JSON.stringify(stats));
  writeFileSync(historyPath, historyJson);
  writeFileSync(worklifePath, worklifeJson);
  writeFileSync(performancePath, performanceJson);
  writeFileSync(radarPath, radarJson);
  writeFileSync(profitHistoryPath, profitHistoryJson);

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

  const performanceGzipSize = gzipSync(performanceJson).length;
  if (performanceGzipSize > PERFORMANCE_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `performance.json のgzipサイズが上限(32KB)を超えています: ${(performanceGzipSize / 1024).toFixed(1)}KB`
    );
  }

  const radarGzipSize = gzipSync(radarJson).length;
  if (radarGzipSize > RADAR_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `radar.json のgzipサイズが上限(48KB)を超えています: ${(radarGzipSize / 1024).toFixed(1)}KB`
    );
  }

  const profitHistoryGzipSize = gzipSync(profitHistoryJson).length;
  if (profitHistoryGzipSize > PROFIT_HISTORY_JSON_GZIP_LIMIT_BYTES) {
    throw new Error(
      `profit-history.json のgzipサイズが上限(256KB)を超えています: ${(profitHistoryGzipSize / 1024).toFixed(1)}KB`
    );
  }

  return {
    companiesPath,
    curvesPath,
    statsPath,
    historyPath,
    worklifePath,
    performancePath,
    radarPath,
    profitHistoryPath,
    companies,
    curves,
    stats,
    history,
    worklife,
    performance,
    radar,
    profitHistory,
    gzipSize,
    historyGzipSize,
    worklifeGzipSize,
    performanceGzipSize,
    radarGzipSize,
    profitHistoryGzipSize,
  };
}

/**
 * 稼ぐ力＝一人当たり経常利益（P0・`docs/performance/spec.md` 1.2・Issue #155）。
 *
 * ```
 * 稼ぐ力 ＝ 連結の経常利益（直近5期の中央値） ÷ 連結の従業員数
 * ```
 *
 * **連結で組む**（親 Issue #154 の決定）。単体だと分子が実質的に子会社からの配当に
 * なる会社が173社あり、**軸の上位が持株会社で埋まる**——そうなるとこの指標は
 * 稼ぐ力ではなく「本社に人を置いていないか」を測ることになり、「本社のみ」バッジと
 * 役割が重なる。連結なら持株会社が事業会社と同じ土俵に乗り、例外処理が1つも要らない。
 *
 * **中央値を採るのは1期の減損で順位が決まらないようにするため。**
 * **赤字は負のまま持つ**（59社。捨てると「データが無い」と区別できなくなる）。
 *
 * **このファイルが持つのは金額と業種中央値だけ。** レーダーの頂点をどこに打つかは
 * 表示側（P1）が決める——目盛りの決め方を変えてもデータを作り直さずに済む。
 *
 * **`/` は読まない。** 企業詳細ページだけが読む（Issue #22）。
 */
function buildPerformance(rows: ReturnType<typeof parseUnifiedCsv>, industries: string[]) {
  const csvPath = resolve(ROOT, "data/performance_history.csv");
  const historyRows = parsePerformanceHistoryCsv(readFileSync(csvPath, "utf-8"));

  const byEdinetCode = new Map<string, { year: number; ordinaryIncome: number }[]>();
  for (const row of historyRows) {
    const list = byEdinetCode.get(row.edinetCode);
    if (list === undefined) byEdinetCode.set(row.edinetCode, [row]);
    else list.push(row);
  }

  // データ全体の最終年。会社ごとの「新しさ」をこれと比べる。
  const latestYear = Math.max(...historyRows.map((r) => r.year));
  const years = new Set<number>();
  const perEmployee: (number | null)[] = [];
  const byIndustry = new Map<string, number[]>();
  let matched = 0;

  for (const row of rows) {
    const list = byEdinetCode.get(row.edinetCode);
    // **連結が無ければ単体で代用する**（連結財務諸表を作っていない191社）。
    const employees = row.employeesConsolidated ?? row.employeesNonConsolidated;
    if (list === undefined || list.length === 0 || !employees) {
      perEmployee.push(null);
      continue;
    }
    // その会社が持つ年のうち**新しい5つ**。決算期は会社ごとにずれるので、
    // 固定の年で切らずに会社ごとの並びから採る。
    const recent = [...list].sort((a, b) => b.year - a.year).slice(0, PERFORMANCE_YEARS);
    /*
     * **最新年が古すぎる会社は落とす。**
     *
     * 「直近5期」は最新年から遡って数えるので、最後に経常利益を開示したのが
     * 8年前の会社では 2014〜2018年の中央値が「稼ぐ力」として画面に出る。
     * **古い数字を最新のものとして見せない。** 該当は1〜2社で、そこは
     * レーダーの軸も「掲載なし」になる。
     */
    if (recent[0].year < latestYear - 1) {
      perEmployee.push(null);
      continue;
    }
    for (const r of recent) years.add(r.year);
    const value = Math.round(median(recent.map((r) => r.ordinaryIncome)) / employees);
    perEmployee.push(value);
    matched++;
    const list2 = byIndustry.get(row.tse33);
    if (list2 === undefined) byIndustry.set(row.tse33, [value]);
    else list2.push(value);
  }

  // **業種中央値を併記しないと読み違える。** 一人当たり利益は海運業2,524万円・
  // 輸送用機器131万円と19倍開くので、全社を一列に並べるとレーダーが業種の
  // 当たり外れを表示するだけになる（spec 1.3）。**平均ではなく中央値**を採るのは
  // 1社の外れ値に引きずられないため（電気機器はキーエンスが桁で外れる）。
  const industryMedian = industries.map((name) => {
    const values = byIndustry.get(name);
    return values === undefined || values.length === 0 ? null : Math.round(median(values));
  });

  return {
    meta: {
      count: rows.length,
      matched,
      years: [...years].sort((a, b) => a - b),
    },
    /** `companies.rows` と同じ並び。**ずれると別の会社の稼ぐ力を出す。** */
    perEmployee,
    /** `companies.industries` と同じ並び。 */
    industryMedian,
  };
}

/**
 * レーダー4軸の相対位置（P1・#167・`docs/performance/spec.md` 2.1）。
 *
 * **ビルド時に確定させる。** 各軸のパーセンタイルは1,867社の分布が要るので、
 * リクエストごとに回すと Workers Free の CPU 予算（10ms）に踏み込む
 * ——`stats.json` の順位と同じ理由（`docs/company/company-page/design.md`）。
 *
 * **平均年収の軸はここに入れない。** あれだけは表示基準（実測値 / 年齢そろえ）で
 * 変わるので、`stats.json` の `rankAll` から表示時に出す（AC-11）。
 *
 * **規則は `web/features/company/lib/radar.ts` の1か所にある。** 代表値の選び方も
 * 順位の数え方もあちらから import する——ここに書き写すと、「図の頂点」と
 * 「図の下に出る値」が別の規約で選ばれることになる。
 *
 * **値そのものは持たせない。** 4軸の値はすべて別のファイルにあり、
 * 二重に持つと `radar.json` の `JSON.parse` が倍になる（0.264ms → 0.524ms）。
 * 表示側は `companies.json`・`performance.json`・`worklife.json` から引く。
 */
function buildRadar(
  rows: ReturnType<typeof parseUnifiedCsv>,
  companyRows: readonly (readonly (string | number)[])[],
  performance: ReturnType<typeof buildPerformance>
) {
  const byId = loadWorklifeCells();
  const numberOrNull = (raw: string | undefined) =>
    raw === undefined || raw === "" ? null : Number(raw);

  const paidLeaveValue: (number | null)[] = [];
  const overtimeValue: (number | null)[] = [];

  companyRows.forEach((company) => {
    const cells = byId.get(String(company[0]));
    const units = (namePrefix: string, valueSuffix: string) =>
      [1, 2, 3, 4, 5].map((n) => ({
        value: numberOrNull(cells?.[`${namePrefix}${n}${valueSuffix}`]),
      }));
    paidLeaveValue.push(
      cells === undefined
        ? null
        : representativeValue(
            numberOrNull(cells.paid_leave_all),
            units("paid_leave_unit", "_rate")
          )
    );
    overtimeValue.push(
      cells === undefined
        ? null
        : representativeValue(numberOrNull(cells.overtime_all), units("overtime_unit", "_hours"))
    );
  });

  return {
    meta: { count: companyRows.length, axes: ["paidLeave", "tenure", "profit", "overtime"] },
    paidLeave: ranks(paidLeaveValue),
    tenure: ranks(rows.map((row) => row.avgTenure)),
    profit: ranks(performance.perEmployee),
    // **残業だけは小さいほど上位。** 5軸すべてが「外側＝良い」で揃っていないと
    // レーダーは図として読めない（#154）。
    overtime: ranks(overtimeValue, true),
  };
}

/**
 * 稼ぐ力の10年推移（P2・#168・`docs/performance/spec.md` 2.3）。
 *
 * ```
 * その年の稼ぐ力 ＝ その年の経常利益 ÷ その年の連結従業員数
 * ```
 *
 * **年ごとに割る。** P0 の「5期の中央値 ÷ 当期の従業員数」とは分母が違う——
 * あちらは1点の代表値で、こちらは各年の実績になる。従業員数が10年で倍になった
 * 会社では、当期の分母で割った過去の年は実態と合わない。
 *
 * **従業員数はその年の書類の当期からしか取れない**（`extract.py` の注記）。
 * 遡って埋めた年（`back > 0`）には無いので、その年の書類が取れていない会社では
 * 経常利益はあっても稼ぐ力が出ない。**内挿しない**——推移の既存の扱いと同じで、
 * 欠けていること自体を画面に出す（AC-10）。
 *
 * **全年 `null` の会社はキーごと落とす。** 1,867社ぶんの空配列を配る意味がない。
 */
function buildProfitHistory(
  rows: ReturnType<typeof parseUnifiedCsv>,
  companyRows: readonly (readonly (string | number)[])[],
  years: readonly number[]
) {
  const csvPath = resolve(ROOT, "data/performance_history.csv");
  const historyRows = parsePerformanceHistoryCsv(readFileSync(csvPath, "utf-8"));

  /*
   * **年の範囲は平均年収の推移（`history.json`）に合わせる。**
   *
   * CSV には2013年まで入っている——2017年の書類が5期ぶんの経常利益を持つため。
   * だが**従業員数はその年の書類の当期からしか取れない**ので、2016年以前は
   * 分母が無く稼ぐ力が出ない。それ以上に、**この節は平均年収推移の直後に置いて
   * 同じ10年を見比べるためのもの**（アートボード 6e）で、片方だけ14本の棒に
   * なると横軸が揃わない。
   */
  const yearIndex = new Map(years.map((y, i) => [y, i]));

  type Series = { profit: (number | null)[]; income: (number | null)[]; employees: (number | null)[] };
  const byEdinetCode = new Map<string, Series>();
  for (const row of historyRows) {
    let series = byEdinetCode.get(row.edinetCode);
    if (series === undefined) {
      series = {
        profit: new Array<number | null>(years.length).fill(null),
        income: new Array<number | null>(years.length).fill(null),
        employees: new Array<number | null>(years.length).fill(null),
      };
      byEdinetCode.set(row.edinetCode, series);
    }
    const i = yearIndex.get(row.year);
    if (i === undefined) continue;
    series.income[i] = row.ordinaryIncome;
    // 連結が無い年は単体で代用する（P0 と同じ規則）。
    const employees = row.employeesConsolidated ?? row.employeesNonConsolidated;
    if (employees) {
      series.employees[i] = employees;
      series.profit[i] = Math.round(row.ordinaryIncome / employees);
    }
  }

  const profit: Record<string, (number | null)[]> = {};
  const income: Record<string, (number | null)[]> = {};
  const employees: Record<string, (number | null)[]> = {};
  rows.forEach((row, i) => {
    const series = byEdinetCode.get(row.edinetCode);
    if (series === undefined || series.profit.every((v) => v === null)) return;
    const id = companyRows[i][0] as string;
    profit[id] = series.profit;
    income[id] = series.income;
    employees[id] = series.employees;
  });

  return { years: [...years], profit, income, employees };
}

/** 中央値。偶数個なら中央2つの平均。 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
function loadWorklifeCells(): Map<string, Record<string, string>> {
  const csvText = readFileSync(resolve(ROOT, "data/worklife_2026.csv"), "utf-8");
  const table = parseCsv(csvText);
  const header = table[0] ?? [];
  const byId = new Map<string, Record<string, string>>();
  for (const line of table.slice(1)) {
    const cells: Record<string, string> = {};
    header.forEach((name, i) => (cells[name] = line[i] ?? ""));
    byId.set(cells.id, cells);
  }
  return byId;
}

function buildWorklife(companyRows: readonly (readonly (string | number)[])[]) {
  const byId = loadWorklifeCells();

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

/**
 * 派生データが母集団の何割を覆えているか（E2・`docs/expansion/spec.md` AC-8）。
 *
 * **新しく入った会社だけ中身が空になる状態を、気づけないまま公開しない。** 母集団を
 * 広げると、追随していない施策（ロゴ・10年推移・働きやすさ指標・稼ぐ力）は
 * 新規社ぶんがまるごと欠ける。**欠けても画面は壊れない**（どれも「掲載なし」の
 * 表示を持っている）ので、**数を出さないと気づけない。**
 */
function coverage(matched: number, total: number): string {
  return `${matched}/${total}社（${((matched / total) * 100).toFixed(1)}%）`;
}

/**
 * ロゴの調達済み社数。**`build:data` の生成物ではない**（`build:logos` が作る）が、
 * AC-8 が名指しする4つのうちの1つなので同じサマリーに並べる。無い環境（クローン
 * 直後など）では黙って飛ばす——ロゴが無いことはビルドの失敗ではない。
 */
function logoCount(): number | null {
  try {
    const raw = readFileSync(resolve(ROOT, "../web/public/data/logos.json"), "utf-8");
    return Object.keys(JSON.parse(raw).byId ?? {}).length;
  } catch {
    return null;
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : "public/data";
  const outDir = resolve(ROOT, out);
  const result = buildData(outDir);
  const { from, to } = result.companies.meta.fiscalPeriodRange;
  // **決算期の幅をサマリーに出す**（E1）。代表が過半に届かなければ落とす、という
  // 旧ガードを外したぶん、幅がどうなっているかは毎回目に入るようにしておく。
  console.log(
    `${result.companiesPath}: ${result.companies.rows.length}行, gzip ${(result.gzipSize / 1024).toFixed(1)}KB` +
      `, 決算期 ${from}〜${to}（${result.companies.periods.length}種類）`
  );
  console.log(result.curvesPath);
  console.log(`${result.statsPath}: ${result.stats.bases.length}表示基準 × ${result.stats.count}社`);
  // **母集団に対する割合を添える**（E2・AC-8）。社数だけだと、母集団が広がった
  // ときに「追随していない施策がどれだけ欠けているか」が読み取れない。
  const total = result.companies.meta.count;
  console.log(
    `${result.historyPath}: ${coverage(Object.keys(result.history.byId).length, total)} × ` +
      `${result.history.years.length}年, gzip ${(result.historyGzipSize / 1024).toFixed(1)}KB`
  );
  console.log(
    `${result.worklifePath}: ${coverage(result.worklife.meta.matched, total)}, ` +
      `gzip ${(result.worklifeGzipSize / 1024).toFixed(1)}KB`
  );
  console.log(
    `${result.performancePath}: ${coverage(result.performance.meta.matched, total)} ` +
      `（${result.performance.meta.years.at(0)}〜${result.performance.meta.years.at(-1)}年）, ` +
      `gzip ${(result.performanceGzipSize / 1024).toFixed(1)}KB`
  );
  console.log(
    `${result.radarPath}: ${result.radar.meta.axes.length}軸 × ${coverage(result.radar.meta.count, total)}, ` +
      `gzip ${(result.radarGzipSize / 1024).toFixed(1)}KB`
  );
  console.log(
    `${result.profitHistoryPath}: ${coverage(Object.keys(result.profitHistory.profit).length, total)} × ` +
      `${result.profitHistory.years.length}年, gzip ${(result.profitHistoryGzipSize / 1024).toFixed(1)}KB`
  );

  // ロゴだけは別のコマンドが作るので、パスではなく施策名で出す（E3・#175 で追随する）。
  const logos = logoCount();
  console.log(`logos.json（build:logos）: ${logos === null ? "未生成" : coverage(logos, total)}`);
}
