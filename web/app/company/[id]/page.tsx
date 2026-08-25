import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/features/company/components/CompanyDetail";
import { buildCompanyView, findRowIndex } from "@/features/company/lib/view";
import { buildWorklifeView } from "@/features/company/lib/worklife";
import {
  decodeWorklife,
  type WorklifeData,
  type WorklifeRecord,
} from "@/lib/data/worklife";
import { representativeUnitLabel, representativeValue } from "@/features/company/lib/radar";
import type {
  CompanyRadarInput,
  PerformanceData,
  RadarAxisData,
  RadarAxisInput,
  RadarData,
} from "@/features/company/lib/radar";
import { companyMetadata } from "@/lib/seo/company";
import type {
  CompanyStatsData,
  CompanyView,
  ProfitHistory,
  SalaryHistory,
} from "@/features/company/types";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import historyData from "../../../public/data/history.json";
import worklifeData from "../../../public/data/worklife.json";
import radarData from "../../../public/data/radar.json";
import performanceData from "../../../public/data/performance.json";
import profitHistoryData from "../../../public/data/profit-history.json";
import logosData from "../../../public/data/logos.json";
import { LogoIdsProvider } from "@/features/logo/components/LogoIdsProvider";

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
 * 代表値の規則は `radar.ts` の `representativeValue` で、ビルド時に順位を
 * 決めたときと同じ関数を通す——**別の規約で選ぶと図の頂点と値が食い違う。**
 */
function radarFor(id: string, record: WorklifeRecord | null): CompanyRadarInput {
  const index = findRowIndex(companies, id);
  const row = companies.rows[index];
  const axis = (
    data: RadarAxisData,
    value: number | null,
    unitLabel = ""
  ): RadarAxisInput => ({
    value,
    rank: data.rank[index] ?? -1,
    population: data.population,
    unitLabel,
  });
  return {
    paidLeave: axis(
      radar.paidLeave,
      representativeValue(record?.paidLeaveAll ?? null, record?.paidLeaveUnits ?? []),
      // **その値がどの雇用管理区分のものかを添える**（アートボード 6b の `正社員`）。
      representativeUnitLabel(record?.paidLeaveAll ?? null, record?.paidLeaveUnits ?? [])
    ),
    // 在籍年数は `companies.rows` の6番目（`buildCompanyView` の分解と同じ並び）。
    tenure: axis(radar.tenure, (row?.[5] as number) ?? null),
    profit: axis(radar.profit, performance.perEmployee[index] ?? null),
    overtime: axis(
      radar.overtime,
      representativeValue(record?.overtimeAll ?? null, record?.overtimeUnits ?? []),
      representativeUnitLabel(record?.overtimeAll ?? null, record?.overtimeUnits ?? [])
    ),
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

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * 1,867社ぶんを**ビルド時に生成する**（R1・ADR-0012）。
 *
 * リクエスト時に Worker がやるのは、事前生成した結果をアセットから引いて返すこと
 * だけになる。実測（`wrangler dev --local`・40リクエストの平均）で
 * `/company/8282` の CPU が 25.5〜28.7ms → 15.6〜15.8ms。**Workers 無料枠の
 * 10ms/リクエストを超えて `exceededCpu` で落ちていたのはこのページ**（Issue #118）。
 *
 * **`dynamicParams = false`。** 一覧に無いIDは 404 になる。`companies.json` に
 * 無い会社のページを描く理由が無く、開けてしまうとクローラが無限に歩ける。
 *
 * **`force-static` なので `searchParams` は読めない。** 表示基準（年齢そろえ）は
 * URL に出さず、クライアントの状態としてだけ持つことにした（ADR-0012）。
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return companies.rows.map((row) => ({ id: row[0] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = buildCompanyView(companies, curves, stats, (await params).id);
  if (view === null) return { title: "見つかりませんでした" };

  // 文言は `lib/seo/company.ts` が持つ。**ビルド時に1度決まればそれきりで、
  // クライアントは書き換えない**——表示基準が URL に出ないので、URL とメタデータが
  // 食い違いようが無い（ADR-0012。U16 が企業詳細で直していたのはこの食い違いだった）。
  return companyMetadata(view, fiscalPeriodLabel(companies.meta));
}

/**
 * 企業詳細ページ。**全社をビルド時に生成する**（R1・ADR-0012）。
 *
 * 順位と母集団統計は `stats.json` にビルド時に確定させてある。ここで走る計算は
 * この1社ぶんの8年齢＝16回の補間だけで、それもビルド時に済む。
 */
export default async function CompanyPage({ params }: Props) {
  const view = buildCompanyView(companies, curves, stats, (await params).id);
  if (view === null) notFound();

  // **1社ぶんを1度だけ読み戻す。** レーダーの2軸と働きやすさの節が同じ行を使う。
  const worklifeRecord = worklifeRecordFor(view.id);

  return (
    <LogoIdsProvider ids={logoIdsOnPage(view)}>
      <CompanyDetail
        view={view}
        radar={radarFor(view.id, worklifeRecord)}
        worklife={buildWorklifeView(worklifeRecord)}
        history={historyFor(view.id)}
        profitHistory={profitHistoryFor(view.id)}
        fiscalPeriod={fiscalPeriodLabel(companies.meta)}
      />
    </LogoIdsProvider>
  );
}
