import type { Metadata } from "next";
import { RankingApp } from "@/features/ranking/components/RankingApp";
import type { CompaniesData, CurvesData, PopulationStats } from "@/features/ranking/types";
import { industryCounts } from "@/features/ranking/lib/industryCounts";
import { pickPopulationStats } from "@/features/ranking/lib/population";
import {
  INITIAL_STATE,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
} from "@/features/ranking/lib/urlState";
import { rankingMetadata } from "@/lib/seo/ranking";
import { LogoIdsProvider } from "@/features/logo/components/LogoIdsProvider";
import { buildLogoMask } from "@/features/logo/lib/mask";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";
import populationData from "../public/data/population.json";
import logoIdsData from "../public/data/logo-ids.json";

const companies = companiesData as CompaniesData;

/**
 * ロゴの有無だけを1,867文字の文字列にして渡す（gzip 約250B）。**`logos.json` は
 * gzip 41.7KB あり、丸ごと渡すと `/` の予算（AC-13: 75,000B）を超える。**
 * モジュールの読み込み時に1度だけ作る——`/` はリクエストごとに描画されるため。
 *
 * **読むのは `logo-ids.json`（raw 11.3KB）で、`logos.json`（raw 202KB）ではない。**
 * この画面が使うのは「ロゴがあるか」だけで、寸法も出典も見ていない。丸ごと import
 * すると使わない 191KB を isolate の初回リクエストで `JSON.parse` することになる
 * （R0・`docs/runtime/spec.md` 2.・Issue #118）。
 */
const logoMask = buildLogoMask(companies.rows, new Set(logoIdsData.ids));

/**
 * 業種ごとの社数をモジュールの初期化で1度だけ数える——`generateMetadata` は
 * リクエストごとに走るので、そこで数え直すと Workers の CPU 予算（10ms）を
 * description 1行のために使うことになる。
 */
const INDUSTRY_COUNTS = industryCounts(companies);
const COUNT_BY_INDUSTRY = new Map(
  companies.industries.map((industry, index) => [industry, INDUSTRY_COUNTS[index]])
);

/**
 * title・description・canonical を searchParams から組み立てる（ADR-0006・U8）。
 * 判断は `lib/seo/ranking.ts` に閉じてあり、ここは値を渡すだけにしてある。
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = searchParamsRecordToURLSearchParams(await searchParams);
  return rankingMetadata(params, companies, (industry) => COUNT_BY_INDUSTRY.get(industry) ?? 0);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = searchParamsRecordToURLSearchParams(await searchParams);
  const initialState = { ...INITIAL_STATE, ...parseSearchParams(params) };

  return (
    <LogoIdsProvider rows={companies.rows} mask={logoMask}>
      <RankingApp
        companies={companies}
        curves={curvesData as CurvesData}
        // 母集団の9組だけを渡す。ここを丸ごと渡すとトップページのHTMLが
        // 跳ね上がる（Issue #22）。**読む側も `stats.json` 全体（raw 131KB）では
        // なく `population.json`（raw 337B）にしてある**——渡す量だけ絞っても、
        // 読む量が減らなければ isolate の初回リクエストの CPU は減らない（R0）。
        population={pickPopulationStats(populationData as PopulationStats)}
        initialState={initialState}
      />
    </LogoIdsProvider>
  );
}
