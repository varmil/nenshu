"use client";

import { useMemo } from "react";
import { useRankingState } from "../hooks/useRankingState";
import { DEFAULT_TARGET_AGE } from "../lib/urlState";
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
  SortKey,
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
  const handleSortChange = (sort: SortKey) => applyFilter({ sort });
  const handlePageChange = (page: number) => setState((prev) => ({ ...prev, page }));

  const isRaw = state.targetAge === null;
  const basisPopulation = populationForBasis(population, state.targetAge);
  const range = pageRange(state.page, totalCount, PAGE_SIZE);
  // 業種ごとの社数は絞り込みで変わらない（母集団の内訳）ので、データが同じ間は数え直さない。
  const counts = useMemo(() => industryCounts(companies), [companies]);

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
          <h1 className="text-3xl font-bold">
            {isRaw ? "平均年収ランキング" : `${state.targetAge}歳年収ランキング`}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isRaw
              ? "有価証券報告書に載っている平均年間給与（単体）そのままで1,867社を並べています。年齢は会社ごとに違うため、若い会社は低めに出ます。"
              : `有価証券報告書1,867社の平均年収を、業種ごとの賃金カーブで${state.targetAge}歳時点に補正して並べています。`}
          </p>
        </div>
        {/*
          表示基準と年齢は「何の列か」が分かる帯に入れる（U13、アートボード 5a）。
          年齢の帯は実測値のとき破線＋減光になる——**消さずに残す**のが AC-11。
        */}
        <ControlBand
          label="並べ方"
          hint={
            isRaw
              ? "有価証券報告書の数値のまま。年齢の違いは補正していません。"
              : "業種ごとの賃金カーブで、全社を同じ年齢に置き換えた推定値です。"
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
