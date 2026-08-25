import type { Metadata } from "next";
import { RankingApp } from "@/features/ranking/components/RankingApp";
import type {
  CompaniesData,
  CurvesData,
  PopulationStats,
  RankingBootstrap,
} from "@/features/ranking/types";
import { industryCounts } from "@/features/ranking/lib/industryCounts";
import { pickPopulationStats } from "@/features/ranking/lib/population";
import { buildRankedCompanies } from "@/features/ranking/lib/rank";
import {
  INITIAL_STATE,
  parseSearchParams,
  searchParamsRecordToURLSearchParams,
} from "@/features/ranking/lib/urlState";
import { rankingMetadata } from "@/lib/seo/ranking";
import { JsonLd } from "@/lib/seo/JsonLd";
import { webSiteJsonLd } from "@/lib/seo/jsonLd";
import { buildLogoMask } from "@/features/logo/lib/mask";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";
import statsData from "../public/data/stats.json";
import logosData from "../public/data/logos.json";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

/**
 * ロゴの有無だけを2,961文字の文字列にして渡す（gzip 約540B）。**`logos.json` は
 * gzip 62KB あり、丸ごと渡すと `/` の予算を超える。** マスクを開くには `rows` が
 * 要るので、クライアントは全件が届いてから開く（E0）。
 */
const LOGO_MASK = buildLogoMask(companies.rows, logosData.byId);
const HAS_LOGO = new Set(Object.keys(logosData.byId));

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
 * 全件データの在り処。**クエリで版を切る**（E0・ADR-0013）——`/` はブラウザ1時間・
 * エッジ24時間キャッシュされる（ADR-0004）ので、**古いHTMLが新しいJSONを引く**
 * 組み合わせが起きる。`generatedAt` はビルドのたびに変わるので、これをクエリに
 * 置けば新しいビルドは必ず新しいURLを引く。
 *
 * **キャッシュ規則は `public/_headers` にある**（`/data/*`）。このURLは
 * `run_worker_first`（`wrangler.jsonc`）に無いので、静的アセットとして直接配られ、
 * Worker を起こさない。
 */
const DATA_URL = `/data/companies.json?v=${Date.parse(companies.meta.generatedAt)}`;

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

  /**
   * **全社ぶんの配列は渡さない**（E0・ADR-0013）。`RankingApp` は `"use client"` な
   * ので props はハイドレーション用データとして HTML に直列化される——全2,961社を
   * 渡していた頃はそれが `/` の gzip の 85.8%（78,722 B）を占め、しかも
   * `/?age=25`・`/?ind=銀行業`・`/?page=2` …の**どのURLのHTMLにも同じものが
   * 入っていた**。
   *
   * サーバーが渡すのは**そのURLで表示する1ページぶんと、絞り込みに要るメタデータ**
   * だけ。クライアントは初回に1度だけ `dataUrl` から全件を取る。
   */
  const page = buildRankedCompanies(companies, curves, initialState);
  const bootstrap: RankingBootstrap = {
    meta: companies.meta,
    industries: companies.industries,
    industryCounts: INDUSTRY_COUNTS,
    page,
    logoMask: LOGO_MASK,
    pageLogoIds: page.companies.filter((c) => HAS_LOGO.has(c.id)).map((c) => c.id),
    dataUrl: DATA_URL,
  };

  return (
    <>
      {/* サイト名と `/` のURLだけ（S2・spec 4.4）。画面に無い主張は入れない。 */}
      <JsonLd data={webSiteJsonLd()} />
      <RankingApp
        bootstrap={bootstrap}
        curves={curves}
        // stats.json 全体（raw 130KB）ではなく母集団の9組だけを渡す。
        // ここを丸ごと渡すとトップページのHTMLが跳ね上がる（Issue #22）。
        population={pickPopulationStats(statsData as PopulationStats)}
        initialState={initialState}
      />
    </>
  );
}
