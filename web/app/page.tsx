import { RankingApp } from "@/features/ranking/components/RankingApp";
import type { CompaniesData, CurvesData, PopulationStats } from "@/features/ranking/types";
import { pickPopulationStats } from "@/features/ranking/lib/population";
import {
  INITIAL_STATE,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
} from "@/features/ranking/lib/urlState";
import { LogoIdsProvider } from "@/features/logo/components/LogoIdsProvider";
import { buildLogoMask } from "@/features/logo/lib/mask";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";
import statsData from "../public/data/stats.json";
import logosData from "../public/data/logos.json";

const companies = companiesData as CompaniesData;

/**
 * ロゴの有無だけを1,867文字の文字列にして渡す（gzip 約250B）。**`logos.json` は
 * gzip 41.7KB あり、丸ごと渡すと `/` の予算（AC-13: 75,000B）を超える。**
 * モジュールの読み込み時に1度だけ作る——`/` はリクエストごとに描画されるため。
 */
const logoMask = buildLogoMask(companies.rows, logosData.byId);

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
        // stats.json 全体（raw 130KB）ではなく母集団の9組だけを渡す。
        // ここを丸ごと渡すとトップページのHTMLが跳ね上がる（Issue #22）。
        population={pickPopulationStats(statsData as PopulationStats)}
        initialState={initialState}
      />
    </LogoIdsProvider>
  );
}
