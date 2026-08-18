import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/features/company/components/CompanyDetail";
import { statsForAge } from "@/features/company/lib/stats";
import { buildCompanyView } from "@/features/company/lib/view";
import type { CompanyStatsData } from "@/features/company/types";
import { formatDecimal1, formatManYen } from "@/features/ranking/lib/format";
import {
  TARGET_AGES,
  type CompaniesData,
  type CurvesData,
  type TargetAge,
} from "@/features/ranking/types";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;

const DEFAULT_AGE: TargetAge = 35;

function parseAge(raw: string | string[] | undefined): TargetAge {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(first);
  return (TARGET_AGES as readonly number[]).includes(n) ? (n as TargetAge) : DEFAULT_AGE;
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const view = buildCompanyView(companies, curves, stats, (await params).id);
  if (view === null) return { title: "見つかりませんでした" };

  const targetAge = parseAge((await searchParams).age);
  const current = statsForAge(view, targetAge);
  return {
    title: `${view.name}の年収 | ${targetAge}歳時点の推定は${formatManYen(current.estimatedSalary)}`,
    description:
      `${view.name}（${view.tse33}）の${targetAge}歳時点の推定年収は${formatManYen(current.estimatedSalary)}。` +
      `全${view.totalCount.toLocaleString("ja-JP")}社中${current.rankAll}位、${view.tse33}${view.industryCount}社中${current.rankIndustry}位。` +
      `有価証券報告書の平均年間給与${formatManYen(view.avgSalary)}（平均年齢${formatDecimal1(view.avgAge)}歳）を年齢で補正した推定値です。`,
  };
}

/**
 * 企業詳細ページ。`generateStaticParams` は使わない——既にフルSSR＋エッジキャッシュ
 * の構成（ADR-0004）で、1,867枚を静的化する意味がないため。
 *
 * 順位と母集団統計は `stats.json` にビルド時に確定させてある。リクエスト時の計算は
 * この1社ぶんの8年齢＝16回の補間だけになる（`docs/company/company-page/design.md`）。
 */
export default async function CompanyPage({ params, searchParams }: Props) {
  const view = buildCompanyView(companies, curves, stats, (await params).id);
  if (view === null) notFound();

  return <CompanyDetail view={view} initialAge={parseAge((await searchParams).age)} />;
}
