import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/features/company/components/CompanyDetail";
import { buildCompanyView } from "@/features/company/lib/view";
import { companyMetadata } from "@/lib/seo/company";
import type { CompanyStatsData, CompanyView, SalaryHistory } from "@/features/company/types";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import historyData from "../../../public/data/history.json";
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

const logoIds = logosData.byId as Record<string, unknown>;

/**
 * この画面に出る会社（自身と、9基準ぶんの近傍5社）のうちロゴを持つIDだけを配る。
 * **ランキングと違ってマスクは送らない**——出るのは多くても46社で、1,867文字を
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

  return (
    <LogoIdsProvider ids={logoIdsOnPage(view)}>
      <CompanyDetail
        view={view}
        history={historyFor(view.id)}
        fiscalPeriod={fiscalPeriodLabel(companies.meta)}
      />
    </LogoIdsProvider>
  );
}
