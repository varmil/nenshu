"use client";

import { useRankingState } from "../hooks/useRankingState";
import { DEFAULT_TARGET_AGE } from "../lib/urlState";
import { pageRange } from "../lib/pagination";
import { populationForBasis } from "../lib/population";
import { formatInt } from "../lib/format";
import { PAGE_SIZE } from "../types";
import type {
  CompaniesData,
  CurvesData,
  PopulationStats,
  RankingState,
  SortKey,
  TargetAge,
} from "../types";
import { AgeSwitch } from "./AgeSwitch";
import { BasisSwitch } from "./BasisSwitch";
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
  const handleSortChange = (sort: SortKey) => applyFilter({ sort });
  const handlePageChange = (page: number) => setState((prev) => ({ ...prev, page }));

  const isRaw = state.targetAge === null;
  const basisPopulation = populationForBasis(population, state.targetAge);
  const range = pageRange(state.page, totalCount, PAGE_SIZE);

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
          <h1 className="text-2xl font-bold">
            {isRaw ? "平均年収ランキング" : `${state.targetAge}歳年収ランキング`}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isRaw
              ? "有価証券報告書に載っている平均年間給与（単体）そのままで1,867社を並べています。年齢は会社ごとに違うため、若い会社は低めに出ます。"
              : `有価証券報告書1,867社の平均年収を、業種ごとの賃金カーブで${state.targetAge}歳時点に補正して並べています。`}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <BasisSwitch value={state.targetAge} onChange={handleBasisChange} label="並べ方" />
          <div className="overflow-x-auto">
            {/*
              実測値のときも年齢スイッチは消さずに無効化する（ADR-0007）。
              「年齢そろえ」に切り替えると何が使えるようになるかを見せておく。
            */}
            <AgeSwitch value={state.targetAge} onChange={handleAgeChange} disabled={isRaw} />
          </div>
        </div>
      </header>

      {/* PC は左に絞り込みを常設した2カラム、モバイルは1カラム＋シート（アートボード 4a / 2a）。 */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[13.5rem_1fr] md:items-start md:gap-6">
        <aside className="hidden md:sticky md:top-4 md:block">
          <h2 className="mb-3 text-sm font-medium">絞り込み</h2>
          <RankingFilters {...filterProps} />
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RankingFilterSheet {...filterProps} />
            <SortSwitch value={state.sort} onChange={handleSortChange} />
          </div>
          <ActiveFilterChips state={state} onChange={applyFilter} />
          <p className="text-muted-foreground text-xs">
            {totalCount === 0
              ? "0社"
              : `${formatInt(totalCount)}社 中 ${formatInt(range.from)}〜${formatInt(range.to)}社目`}
          </p>

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
                populationCount={population.count}
              />
              <RankingCardList
                companies={rankedCompanies}
                targetAge={state.targetAge}
                pageMaxSalary={pageMaxSalary}
                population={basisPopulation}
                populationCount={population.count}
              />
              <RankingPagination
                state={state}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>

      <IndustryChips
        industries={companies.industries}
        current={state.industry}
        onSelect={(industry) => applyFilter({ industry })}
      />
    </div>
  );
}
