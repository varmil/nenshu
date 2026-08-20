"use client";

import { useRankingState } from "../hooks/useRankingState";
import { DEFAULT_TARGET_AGE } from "../lib/urlState";
import { AVG_AGE_OPTIONS, EMPLOYEE_SIZE_OPTIONS, TENURE_OPTIONS } from "../lib/filterOptions";
import type {
  AvgAgeBucket,
  CompaniesData,
  CurvesData,
  EmployeeSizeBucket,
  RankingState,
  TargetAge,
  TenureBucket,
} from "../types";
import { AgeSwitch } from "./AgeSwitch";
import { BasisSwitch } from "./BasisSwitch";
import { FilterSelect } from "./FilterSelect";
import { FilterToggleGroup } from "./FilterToggleGroup";
import { SearchInput } from "./SearchInput";
import { RankingTable } from "./RankingTable";
import { RankingCardList } from "./RankingCardList";
import { RankingPagination } from "./RankingPagination";

export function RankingApp({
  companies,
  curves,
  initialState,
}: {
  companies: CompaniesData;
  curves: CurvesData;
  initialState: RankingState;
}) {
  const { state, setState, rankedCompanies, totalCount } = useRankingState(
    companies,
    curves,
    initialState
  );

  const handleAgeChange = (targetAge: TargetAge) => {
    setState((prev) => ({ ...prev, targetAge, page: 1 }));
  };

  const handleBasisChange = (basis: "raw" | "age") => {
    setState((prev) => ({
      ...prev,
      targetAge: basis === "raw" ? null : DEFAULT_TARGET_AGE,
      page: 1,
    }));
  };

  const isRaw = state.targetAge === null;

  const handlePageChange = (page: number) => {
    setState((prev) => ({ ...prev, page }));
  };

  const industryOptions = companies.industries.map((industry) => ({
    value: industry,
    label: industry,
  }));

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
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect
            label="業種"
            value={state.industry}
            onChange={(industry) => setState((prev) => ({ ...prev, industry, page: 1 }))}
            options={industryOptions}
          />
          <FilterToggleGroup
            label="従業員数"
            value={state.employeeSize}
            onChange={(employeeSize) =>
              setState((prev) => ({
                ...prev,
                employeeSize: employeeSize as EmployeeSizeBucket | null,
                page: 1,
              }))
            }
            options={EMPLOYEE_SIZE_OPTIONS}
          />
          <FilterToggleGroup
            label="在籍年数"
            value={state.tenure}
            onChange={(tenure) =>
              setState((prev) => ({ ...prev, tenure: tenure as TenureBucket | null, page: 1 }))
            }
            options={TENURE_OPTIONS}
          />
          <FilterToggleGroup
            label="平均年齢"
            value={state.avgAgeBucket}
            onChange={(avgAgeBucket) =>
              setState((prev) => ({
                ...prev,
                avgAgeBucket: avgAgeBucket as AvgAgeBucket | null,
                page: 1,
              }))
            }
            options={AVG_AGE_OPTIONS}
          />
          <SearchInput
            value={state.query}
            onChange={(query) => setState((prev) => ({ ...prev, query, page: 1 }))}
          />
        </div>
      </header>
      {totalCount === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          条件に一致する企業が見つかりませんでした。フィルタや検索条件を緩めてお試しください。
        </p>
      ) : (
        <>
          <RankingTable companies={rankedCompanies} targetAge={state.targetAge} />
          <RankingCardList companies={rankedCompanies} targetAge={state.targetAge} />
          <RankingPagination state={state} totalCount={totalCount} onPageChange={handlePageChange} />
        </>
      )}
    </div>
  );
}
