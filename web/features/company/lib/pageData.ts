import { buildCompanyView, findRowIndex } from "@/features/company/lib/view";
import { buildWorklifeView } from "@/features/company/lib/worklife";
import {
  decodeWorklife,
  type WorklifeData,
  type WorklifeRecord,
} from "@/lib/data/worklife";
import { representative } from "@/features/company/lib/radar";
import type {
  CompanyRadarInput,
  PerformanceData,
  RadarAxisData,
  RadarAxisInput,
  RadarData,
} from "@/features/company/lib/radar";
import type {
  CompanyStatsData,
  CompanyView,
  ProfitHistory,
  SalaryHistory,
} from "@/features/company/types";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { companyFiscalPeriodLabel } from "@/lib/data/period";
import companiesData from "@/public/data/companies.json";
import curvesData from "@/public/data/curves.json";
import statsData from "@/public/data/stats.json";
import historyData from "@/public/data/history.json";
import worklifeData from "@/public/data/worklife.json";
import radarData from "@/public/data/radar.json";
import performanceData from "@/public/data/performance.json";
import profitHistoryData from "@/public/data/profit-history.json";
import logosData from "@/public/data/logos.json";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;
/**
 * 10年推移（T1）。**`app/page.tsx` からは import しない**——トップページは
 * 1,867社ぶんを既に抱えており、ここを足す理由がない（Issue #22・timeseries spec 3.）。
 * 渡すのは当該1社ぶんの10件だけ。
 */
const history = historyData as { years: number[]; byId: Record<string, (number | null)[]> };

/**
 * 働きやすさ指標（W1・Issue #150）。**推移と同じくここだけが import する**
 * ——`app/page.tsx` から読むとトップページのHTMLが1,867社ぶん増える（Issue #22）。
 * 渡すのは当該1社ぶんだけ。
 */
const worklife = worklifeData as unknown as WorklifeData;

/**
 * レーダー4軸の順位（P1・Issue #167）。**平均年収の軸はここに無い**——
 * 表示基準で変わるので `stats.json` の `rankAll` から出す（AC-11）。
 */
const radar = radarData as unknown as RadarData;

/**
 * 稼ぐ力（P0・Issue #155）。**軸の金額はここから引く**——同じ数字を
 * `radar.json` にも置くと、そのファイルの `JSON.parse` が倍になる。
 */
const performance = performanceData as unknown as PerformanceData;

/**
 * 稼ぐ力の10年推移（P2・Issue #168）。**`app/page.tsx` からは読まない**
 * ——渡すのは当該1社ぶんだけ（Issue #22）。
 */
const profitHistory = profitHistoryData as unknown as {
  years: number[];
  profit: Record<string, (number | null)[]>;
  income: Record<string, (number | null)[]>;
  employees: Record<string, (number | null)[]>;
};

const logoIds = logosData.byId as Record<string, unknown>;

/**
 * この画面に出る会社（自身と、9基準ぶんの近傍10社）のうちロゴを持つIDだけを配る。
 * **ランキングと違ってマスクは送らない**——出るのは多くても91社で、1,867文字を
 * 送るほうが大きい。
 */
function logoIdsOnPage(view: CompanyView): string[] {
  const ids = new Set<string>([view.id]);
  for (const basis of view.byBasis) {
    for (const neighbor of basis.neighbors) ids.add(neighbor.id);
  }
  return [...ids].filter((id) => logoIds[id]);
}

function historyFor(id: string): SalaryHistory | null {
  const values = history.byId[id];
  return values === undefined ? null : { years: history.years, values };
}

/** 稼ぐ力の推移。全年 `null` の会社はキーごと落としてあるので `undefined` になる。 */
function profitHistoryFor(id: string): ProfitHistory | null {
  const profit = profitHistory.profit[id];
  if (profit === undefined) return null;
  return {
    years: profitHistory.years,
    profit,
    income: profitHistory.income[id] ?? [],
    employees: profitHistory.employees[id] ?? [],
  };
}

/**
 * レーダー4軸のうち、この会社ぶんだけを抜く。**`radar.json` 全体は渡さない**
 * ——1,867社×4軸を直列化するとページの予算を超える（`stats.json` の
 * `rankAll` を渡さないのと同じ理由）。
 *
 * **順位は `radar.json`、値はそれぞれの出どころから引く。**
 * 同じ数字を `radar.json` にも置くと、そのファイルの `JSON.parse` が倍になる。
 * 代表値の規則は `radar.ts` の `representative` で、ビルド時に順位を
 * 決めたときと同じ関数を通す——**別の規約で選ぶと図の頂点と値が食い違う。**
 */
function radarFor(id: string, record: WorklifeRecord | null): CompanyRadarInput {
  const index = findRowIndex(companies, id);
  const row = companies.rows[index];
  const axis = (
    data: RadarAxisData,
    value: number | null,
    byUnit = false
  ): RadarAxisInput => ({
    value,
    rank: data.rank[index] ?? -1,
    population: data.population,
    byUnit,
  });
  // **区分ごとの公表かどうかも一緒に受け取る**（W2・#185）。値と別々に判定すると、
  // 図の頂点と文言が別の規約で決まることになる。
  const paidLeave = representative(record?.paidLeaveAll ?? null, record?.paidLeaveUnits ?? []);
  const overtime = representative(record?.overtimeAll ?? null, record?.overtimeUnits ?? []);
  return {
    paidLeave: axis(radar.paidLeave, paidLeave.value, paidLeave.byUnit),
    // 在籍年数は `companies.rows` の6番目（`buildCompanyView` の分解と同じ並び）。
    tenure: axis(radar.tenure, (row?.[5] as number) ?? null),
    profit: axis(radar.profit, performance.perEmployee[index] ?? null),
    overtime: axis(radar.overtime, overtime.value, overtime.byUnit),
    profitIndustryMedian: performance.industryMedian[(row?.[2] as number) ?? -1] ?? null,
  };
}

/**
 * **掲載が無い会社でも節は出す**（spec AC-10）。`decodeWorklife` が `null` を返す
 * のは「データが無い」ことで、「節を出さない」ことではない——値を消すと
 * 「残業が少ない会社」と見分けがつかなくなる。
 */
function worklifeRecordFor(id: string): WorklifeRecord | null {
  const index = findRowIndex(companies, id);
  return index === -1 ? null : decodeWorklife(worklife, index);
}


/**
 * 企業IDからその会社の決算期を引く（E1・`docs/expansion/spec.md` 1.4）。
 * **このページは1社ぶんなので、母集団の幅ではなく実際の決算期を出す。**
 *
 * モジュールの初期化で1度だけ作る。**全社をビルド時に生成する**（ADR-0012）ので
 * リクエスト時には走らない。
 */
const FISCAL_PERIOD_BY_ID = new Map(
  companies.rows.map((row) => [row[0], companyFiscalPeriodLabel(companies, row)])
);

function fiscalPeriodFor(id: string): string {
  const label = FISCAL_PERIOD_BY_ID.get(id);
  if (label === undefined) {
    throw new Error(`企業ID ${id} の決算期が引けません`);
  }
  return label;
}

/**
 * 1社ぶんを引く。**引けなかったらビルドを落とす。**
 *
 * `dynamicParams = false` があるので、`companies.json` に無いIDは**このページに
 * 届く前に 404 になる**（`generateStaticParams` が返した一覧に無いため）。
 * つまりここで `null` が返るのは、**`generateStaticParams` と
 * `buildCompanyView` が同じ `companies.rows` を見ているのに食い違った**とき
 * ——データが自己矛盾しているときだけになる。
 *
 * 以前は `notFound()` を呼んでいたが、それは**起こらない事態を 404 として
 * 静かに配ること**になる。全社を事前生成する構成（ADR-0012）では、1社でも
 * 引けない時点でビルドが通ってはいけない。
 */
function requireCompanyView(id: string): CompanyView {
  const view = buildCompanyView(companies, curves, stats, id);
  if (view === null) {
    throw new Error(`企業ID ${id} の CompanyView を作れません（companies.json と生成した一覧が食い違っています）`);
  }
  return view;
}

export interface CompanyPageData {
  view: CompanyView;
  radar: CompanyRadarInput;
  worklife: ReturnType<typeof buildWorklifeView>;
  history: SalaryHistory | null;
  profitHistory: ProfitHistory | null;
  fiscalPeriod: string;
  logoIds: string[];
}

/**
 * 企業詳細ページが要る1社ぶんを全部そろえる（F1・Issue #209）。
 *
 * **`app/company/[id]/page.tsx` から中身をそのまま移した。** ルーティングが
 * Next.js から Astro に変わっても、**どのデータをどう組むかは1文字も変えない**
 * （spec 2.「画面に出るものを1つも変えない」）。
 */
export function companyPageData(id: string): CompanyPageData {
  const view = requireCompanyView(id);
  // **1社ぶんを1度だけ読み戻す。** レーダーの2軸と働きやすさの節が同じ行を使う。
  const worklifeRecord = worklifeRecordFor(view.id);
  return {
    view,
    radar: radarFor(view.id, worklifeRecord),
    worklife: buildWorklifeView(worklifeRecord),
    history: historyFor(view.id),
    profitHistory: profitHistoryFor(view.id),
    fiscalPeriod: fiscalPeriodFor(view.id),
    logoIds: logoIdsOnPage(view),
  };
}

/** 事前生成する全社のID（Astro の `getStaticPaths`）。 */
export function companyIds(): string[] {
  return companies.rows.map((row) => row[0]);
}
