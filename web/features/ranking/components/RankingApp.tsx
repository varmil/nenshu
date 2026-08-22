"use client";

import { useMemo } from "react";
import { usePageMeta } from "@/lib/seo/usePageMeta";
import { rankingPageMeta } from "@/lib/seo/ranking";
import { useRankingState } from "../hooks/useRankingState";
import { buildSearchParams, DEFAULT_TARGET_AGE } from "../lib/urlState";
import { pageRange } from "../lib/pagination";
import { populationForBasis } from "../lib/population";
import { industryCounts } from "../lib/industryCounts";
import { formatInt } from "../lib/format";
import { PAGE_SIZE } from "../types";
import type {
  CompaniesData,
  CurvesData,
  PopulationStats,
  RankingState,
  SortSelection,
  TargetAge,
} from "../types";
import { AgeSwitch } from "./AgeSwitch";
import { BasisSwitch } from "./BasisSwitch";
import { ControlBand } from "./ControlBand";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { IndustryChips } from "./IndustryChips";
import { RankingFilters } from "./RankingFilters";
import { RankingFilterSheet } from "./RankingFilterSheet";
import { SortSwitch } from "./SortSwitch";
import { RankingTable } from "./RankingTable";
import { RankingCardList } from "./RankingCardList";
import { RankingPagination } from "./RankingPagination";

export function RankingApp({
  companies,
  curves,
  population,
  initialState,
}: {
  companies: CompaniesData;
  curves: CurvesData;
  population: PopulationStats;
  initialState: RankingState;
}) {
  const { state, setState, rankedCompanies, totalCount, pageMaxSalary } = useRankingState(
    companies,
    curves,
    initialState
  );

  /**
   * 絞り込みの変更はすべてここを通す。**`page` を1に戻すのをここ1か所に閉じる**——
   * 呼び出し側ごとに書いていると、増やしたフィルタで戻し忘れる。
   */
  const applyFilter = (patch: Partial<RankingState>) => {
    setState((prev) => ({ ...prev, ...patch, page: 1 }));
  };

  const handleAgeChange = (targetAge: TargetAge) => applyFilter({ targetAge });
  const handleBasisChange = (basis: "raw" | "age") =>
    applyFilter({ targetAge: basis === "raw" ? null : DEFAULT_TARGET_AGE });
  // 軸と向きは1つの値なので、そのまま差分として当たる（`types.ts` の `SortSelection`）。
  const handleSortChange = (sort: SortSelection) => applyFilter({ sort });
  const handlePageChange = (page: number) => setState((prev) => ({ ...prev, page }));

  const isRaw = state.targetAge === null;
  const basisPopulation = populationForBasis(population, state.targetAge);
  const range = pageRange(state.page, totalCount, PAGE_SIZE);
  // 業種ごとの社数は絞り込みで変わらない（母集団の内訳）ので、データが同じ間は数え直さない。
  const counts = useMemo(() => industryCounts(companies), [companies]);

  /**
   * 画面の状態に対応する title・description・canonical を DOM に反映する（U16）。
   *
   * **状態そのものではなく、状態が書くURLから組み立てる。** サーバー
   * （`app/page.tsx` の `generateMetadata`）が見るのは `searchParams` なので、
   * 同じ入口を通しておかないと「操作して着いたURL」と「そのURLを直接開いたとき」で
   * 文言がずれうる。`buildSearchParams` は `useRankingState` が URL に書くのと
   * 同じ関数である。
   */
  const countOf = useMemo(() => {
    const byIndustry = new Map(companies.industries.map((name, i) => [name, counts[i]]));
    return (industry: string) => byIndustry.get(industry) ?? 0;
  }, [companies, counts]);
  usePageMeta(rankingPageMeta(buildSearchParams(state), companies, countOf));

  const filterProps = {
    state,
    onChange: applyFilter,
    industries: companies.industries,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        {/* 「計算方法」への導線は共通ヘッダ（SiteHeader）に移した。ここでは重複させない。 */}
        <div className="flex flex-col gap-1">
          {/* 見出しはモバイル 20px / PC 30px（アートボード 5c / 5a）。 */}
          <h1 className="text-xl font-bold md:text-3xl">
            {isRaw ? "平均年収ランキング" : `${state.targetAge}歳年収ランキング`}
          </h1>
          {/*
            **モバイルは先頭の1文だけを出す**（アートボード 5c、公開後の指摘）。
            2文まとめて出すと 390px で3行になり、本文が下に押し出されていた。
            同じ文を2つ書いて出し分けるのではなく、続きの1文だけを PC で足す。
          */}
          <p className="text-muted-foreground text-xs md:text-sm">
            {isRaw ? (
              <>
                有価証券報告書の平均年間給与（単体）で1,867社。
                <span className="hidden md:inline">
                  年齢は会社ごとに違うため、若い会社は低めに出ます。
                </span>
              </>
            ) : (
              <>
                {`業種の賃金カーブで${state.targetAge}歳時点に補正した1,867社。`}
                <span className="hidden md:inline">
                  元になる金額は有価証券報告書の平均年間給与です。
                </span>
              </>
            )}
          </p>
        </div>
        {/*
          表示基準と年齢は「何の列か」が分かる帯に入れる（U13、アートボード 5a）。
          年齢の帯は実測値のとき破線＋減光になる——**消さずに残す**のが AC-11。
        */}
        {/*
          説明文もモバイルは1文だけ（公開後の指摘）。帯の中で折り返すと、スイッチと
          説明のどちらが主役なのか読み取りにくくなる。
        */}
        <ControlBand
          label="並べ方"
          hint={
            isRaw ? (
              <>
                有価証券報告書の数値のまま。
                <span className="hidden md:inline">年齢の違いは補正していません。</span>
              </>
            ) : (
              <>
                業種の賃金カーブで補正した推定値です。
                <span className="hidden md:inline">全社を同じ年齢に置き換えています。</span>
              </>
            )
          }
        >
          <BasisSwitch value={state.targetAge} onChange={handleBasisChange} label="並べ方" />
        </ControlBand>
        <ControlBand
          label="年齢"
          tone={isRaw ? "dashed" : "solid"}
          hint={isRaw ? "「年齢そろえ」のときだけ使います" : undefined}
        >
          <AgeSwitch value={state.targetAge} onChange={handleAgeChange} disabled={isRaw} />
        </ControlBand>
      </header>

      {/* PC は左に絞り込みを常設した2カラム、モバイルは1カラム＋シート（アートボード 5a / 5c）。 */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[13.5rem_1fr] md:items-start md:gap-6">
        {/*
          **「適用中」は PC ではサイドバーの先頭に置く**（アートボード 5a）。効いている
          条件と、それを外す場所が同じ列に並ぶ。モバイルはサイドバーごとシートに
          隠れるので、`aside` の中身のうちチップだけを本文の上に残す——**2つ描いて
          出し分けない**。同じ解除ボタンが2つ存在すると、片方が隠れていても
          「同じ名前の要素が2つ」になり、テストからも読み上げからも曖昧になる。
        */}
        <aside className="md:sticky md:top-4 md:flex md:flex-col md:gap-4">
          <ActiveFilterChips state={state} onChange={applyFilter} />
          <div className="hidden md:block">
            <RankingFilters {...filterProps} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          {/*
            件数（左）と並び替え（右）を同じ行に置く。モバイルでは並び替えの列が
            全幅を取るので、件数が次の行へ回る（アートボード 5c と同じ並び）。
          */}
          <div className="flex flex-wrap items-center gap-2">
            {/*
              `flex-wrap`。390px では並び替え3つと「絞り込み」が1行に収まるが、
              360px では収まらない。**折り返させる**——横スクロールを出すと
              ページ全体が横に動く（U3 で踏んだ）。
            */}
            <div className="order-1 flex w-full min-w-0 flex-wrap items-center gap-1.5 md:order-2 md:ml-auto md:w-auto">
              <span aria-hidden="true" className="text-muted-foreground hidden text-xs md:inline">
                並び替え
              </span>
              <SortSwitch value={state.sort} onChange={handleSortChange} />
              <RankingFilterSheet {...filterProps} />
            </div>
            <p className="text-muted-foreground order-2 text-xs md:order-1">
              {totalCount === 0 ? (
                "0社"
              ) : (
                <>
                  <span className="text-foreground font-semibold">{formatInt(totalCount)}社</span>{" "}
                  中 {formatInt(range.from)}〜{formatInt(range.to)}社目
                </>
              )}
            </p>
          </div>

          {totalCount === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              条件に一致する企業が見つかりませんでした。フィルタや検索条件を緩めてお試しください。
            </p>
          ) : (
            <>
              <RankingTable
                companies={rankedCompanies}
                targetAge={state.targetAge}
                pageMaxSalary={pageMaxSalary}
                population={basisPopulation}
              />
              <RankingCardList
                companies={rankedCompanies}
                targetAge={state.targetAge}
                pageMaxSalary={pageMaxSalary}
                population={basisPopulation}
              />
              <RankingPagination
                state={state}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </>
          )}

          {/*
            業種チップは本文カラムの中（アートボード 5a）。U12 では2カラムの外に
            全幅で置いていたため、サイドバーの下の空白と地続きに見えていた。
          */}
          <IndustryChips
            industries={companies.industries}
            counts={counts}
            current={state.industry}
            onSelect={(industry) => applyFilter({ industry })}
          />
        </div>
      </div>
    </div>
  );
}
