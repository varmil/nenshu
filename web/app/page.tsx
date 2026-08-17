import { RankingApp } from "@/features/ranking/components/RankingApp";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import {
  INITIAL_STATE,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
} from "@/features/ranking/lib/urlState";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";

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
      initialState={initialState}
    />
  );
}
