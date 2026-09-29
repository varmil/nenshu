/**
 * テストが実データ（`public/data/*.json`）を読むときの入口（refresh の D0・Issue #870。
 * `docs/refresh/test-invariants/design.md`）。ユニットテストと E2E の両方がここを使う。
 *
 * **いまのデータの値をテストに書き写さない。** 毎日の更新（`docs/refresh/spec.md`）で社数・
 * 金額・順位・決算期の幅は日ごとに動くので、書き写した値はデータが1社ぶん動いただけで落ちる。
 * 期待値はここから引くか、値どうしの関係で見る。表示の文字列は、ここで引いた値をアプリの
 * 整形関数（`formatManYen` 等）に通して作る。
 *
 * **会社を名指ししてよいのは、その会社が「居る」ことだけを前提にするとき。** 企業 ID は一度
 * 振ったら変えない（ADR-0017）ので、居ることは崩れない。「給与の決定方針が無い」「平均年齢が
 * ちょうど35歳」「業種で1位」のような状態を前提にするなら、`pickCompany` でその状態の会社を
 * データから選ぶ——状態はその会社の次の有報で変わる。
 */
import companiesJson from "@/public/data/companies.json" with { type: "json" };
import curvesJson from "@/public/data/curves.json" with { type: "json" };
import statsJson from "@/public/data/stats.json" with { type: "json" };
import historyJson from "@/public/data/history.json" with { type: "json" };
import worklifeJson from "@/public/data/worklife.json" with { type: "json" };
import radarJson from "@/public/data/radar.json" with { type: "json" };
import performanceJson from "@/public/data/performance.json" with { type: "json" };
import profitHistoryJson from "@/public/data/profit-history.json" with { type: "json" };
import logosJson from "@/public/data/logos.json" with { type: "json" };
import summariesJson from "@/public/data/summaries.json" with { type: "json" };
import analysesJson from "@/public/data/analyses.json" with { type: "json" };
import filingsJson from "@/public/data/filings.json" with { type: "json" };
import payPoliciesJson from "@/public/data/pay-policies.json" with { type: "json" };
import type { CompaniesData, CompanyRow, CurvesData } from "@/features/ranking/types";
import type { CompanyStatsData } from "@/features/company/types";
import type { PerformanceData, RadarData } from "@/features/company/lib/radar";
import type { WorklifeData } from "@/lib/data/worklife";
import type { AnalysisRecord } from "@/features/company/lib/analysis";
import type { PayPolicyRecord } from "@/features/company/lib/payPolicy";

export const companies = companiesJson as CompaniesData;
export const curves = curvesJson as CurvesData;
export const stats = statsJson as CompanyStatsData;
export const history = historyJson as {
  years: number[];
  byId: Record<string, (number | null)[]>;
  ageById: Record<string, (number | null)[]>;
  tenureById: Record<string, (number | null)[]>;
  tenureIndustryMedian: (number | null)[][];
};
export const worklife = worklifeJson as unknown as WorklifeData;
export const radar = radarJson as unknown as RadarData;
export const performance = performanceJson as unknown as PerformanceData;
export const profitHistory = profitHistoryJson as unknown as {
  years: number[];
  profit: Record<string, (number | null)[]>;
  income: Record<string, (number | null)[]>;
  employees: Record<string, (number | null)[]>;
};
export const logos = logosJson as {
  meta: { count: number; withLogo: number };
  byId: Record<string, unknown>;
};
export const summaries = summariesJson as { byId: Record<string, string> };
export const analyses = analysesJson as { byId: Record<string, AnalysisRecord> };
export const filings = filingsJson as { byId: Record<string, string> };
export const payPolicies = payPoliciesJson as { byId: Record<string, PayPolicyRecord> };

const indexById = new Map(companies.rows.map((row, index) => [row[0], index]));

/**
 * 企業 ID から `companies.rows` の添字を引く。`stats`・`radar` 等の並びもこれで引く。
 * 表は1度だけ作る——全社を回すループの中で呼ぶテストがある。
 */
export function rowIndexOf(id: string): number {
  const index = indexById.get(id);
  if (index === undefined) throw new Error(`${id} は companies.json に居ない`);
  return index;
}

export function rowOf(id: string): CompanyRow {
  return companies.rows[rowIndexOf(id)];
}

/** その会社の業種名（東証33業種）。 */
export function industryOf(id: string): string {
  return companies.industries[rowOf(id)[2]];
}

/**
 * 条件に合う会社の ID を返す。**並びは `companies.rows` の順**（毎回同じ会社が選ばれる）。
 *
 * **無ければ落とす。** 条件に合う会社がデータから消えたとき、テストが空振りして通るのではなく、
 * 前提が崩れたことを知らせる。`what` はその失敗の文面に使う（「給与の決定方針が無い会社」）。
 */
export function pickCompany(
  what: string,
  pred: (row: CompanyRow, index: number) => boolean
): string {
  const [id] = pickCompanies(what, pred, 1);
  return id;
}

/** `pickCompany` の複数版。`count` 社に満たなければ落とす。 */
export function pickCompanies(
  what: string,
  pred: (row: CompanyRow, index: number) => boolean,
  count: number
): string[] {
  const ids: string[] = [];
  for (const [index, row] of companies.rows.entries()) {
    if (pred(row, index)) ids.push(row[0]);
    if (ids.length === count) return ids;
  }
  throw new Error(`${what}が${count}社見つからない（${ids.length}社）`);
}

/**
 * `score` がいちばん大きい会社の ID。同点なら `companies.rows` の順で先の会社。
 *
 * 横スクロール・切り詰めを見る**最悪ケースの会社**をデータから選ぶのに使う（社名が
 * いちばん長い・表の列がいちばん多い 等。CLAUDE.md「最悪ケースの会社・状態を配列に足す」）。
 * 名指しすると、その会社が最悪でなくなったときに検査が空振りする。**対象にしない会社は
 * `score` で `-Infinity` を返す。** 全社が対象から外れたら落とす。
 */
export function pickMaxCompany(
  what: string,
  score: (row: CompanyRow, index: number) => number
): string {
  const scores = companies.rows.map((row, index) => score(row, index));
  const best = Math.max(...scores);
  return pickCompany(what, (_, index) => Number.isFinite(best) && scores[index] === best);
}
