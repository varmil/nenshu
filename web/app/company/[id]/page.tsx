import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/features/company/components/CompanyDetail";
import { buildCompanyView } from "@/features/company/lib/view";
import { companyMetadata } from "@/lib/seo/company";
import type { CompanyStatsData, CompanyView, SalaryHistory } from "@/features/company/types";
import {
  TARGET_AGES,
  type CompaniesData,
  type CurvesData,
  type TargetAge,
} from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import historyData from "../../../public/data/history.json";
import logoIdsData from "../../../public/data/logo-ids.json";
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
 * ロゴを持つ会社のID。**読むのは `logo-ids.json`（raw 11.3KB）で、`logos.json`
 * （raw 202KB）ではない。** この画面が使うのは「ロゴがあるか」だけで、寸法も
 * 出典も見ていない（見ているのは `/about` の帰属表示だけ）。丸ごと import すると
 * 使わない 191KB を isolate の初回リクエストで `JSON.parse` することになる
 * （R0・`docs/runtime/spec.md` 2.・Issue #118）。
 */
const logoIds = new Set(logoIdsData.ids);

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
  return [...ids].filter((id) => logoIds.has(id));
}

function historyFor(id: string): SalaryHistory | null {
  const values = history.byId[id];
  return values === undefined ? null : { years: history.years, values };
}

/**
 * `age` が無い・不正なら `null`（実測値・既定）に倒す。`age` の有無が表示基準を
 * 表す（ADR-0007）。ランキング側の `parseSearchParams` と同じ扱いにしてある。
 */
function parseAge(raw: string | string[] | undefined): TargetAge | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(first);
  return (TARGET_AGES as readonly number[]).includes(n) ? (n as TargetAge) : null;
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * `generateMetadata` と本体は**同じ会社の同じ数字**を出すので、計算は1リクエストに
 * 1回でよい。React の `cache()` はリクエスト単位のメモ化で、両者は同じリクエスト
 * スコープにいる（R0・AC-6・Issue #118）。
 *
 * **リクエストをまたいでは残らない。** またぐと、ある読者の会社の数字を別の読者に
 * 出すことになる。`buildCompanyView` は 0.885ms（実測・中央値）で、Workers 無料枠の
 * 予算 10ms のうち 0.9ms を同じ計算の2回目に使っていた。
 */
const companyView = cache((id: string) => buildCompanyView(companies, curves, stats, id));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const view = companyView((await params).id);
  if (view === null) return { title: "見つかりませんでした" };

  // 文言は `lib/seo/company.ts` が持つ。**クライアント（`CompanyDetail`）も同じ
  // 関数を引く**——表示基準を切り替えたときにタイトルの金額が置いていかれるため
  // （U16・親 Issue #130）。canonical に `?age=N` を付けない理由も、決算期を
  // description にだけ置く理由（S3・Issue #134）もあちらにある。
  return companyMetadata(view, parseAge((await searchParams).age), fiscalPeriodLabel(companies.meta));
}

/**
 * 企業詳細ページ。`generateStaticParams` は使わない——既にフルSSR＋エッジキャッシュ
 * の構成（ADR-0004）で、1,867枚を静的化する意味がないため。
 *
 * 順位と母集団統計は `stats.json` にビルド時に確定させてある。リクエスト時の計算は
 * この1社ぶんの8年齢＝16回の補間だけになる（`docs/company/company-page/design.md`）。
 */
export default async function CompanyPage({ params, searchParams }: Props) {
  const view = companyView((await params).id);
  if (view === null) notFound();

  return (
    <LogoIdsProvider ids={logoIdsOnPage(view)}>
      <CompanyDetail
        view={view}
        history={historyFor(view.id)}
        initialAge={parseAge((await searchParams).age)}
        fiscalPeriod={fiscalPeriodLabel(companies.meta)}
      />
    </LogoIdsProvider>
  );
}
