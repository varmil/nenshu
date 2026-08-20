import { RankingApp } from "@/features/ranking/components/RankingApp";
import type { CompaniesData, CurvesData, PopulationStats } from "@/features/ranking/types";
import { pickPopulationStats } from "@/features/ranking/lib/population";
import {
  INITIAL_STATE,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
} from "@/features/ranking/lib/urlState";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";
import statsData from "../public/data/stats.json";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = searchParamsRecordToURLSearchParams(await searchParams);
  const initialState = { ...INITIAL_STATE, ...parseSearchParams(params) };

  return (
    <RankingApp
      companies={companiesData as CompaniesData}
      curves={curvesData as CurvesData}
      // stats.json 全体（raw 130KB）ではなく母集団の9組だけを渡す。
      // ここを丸ごと渡すとトップページのHTMLが跳ね上がる（Issue #22）。
      population={pickPopulationStats(statsData as PopulationStats)}
      initialState={initialState}
    />
  );
}
