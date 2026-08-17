"use client";

import { useRankingState } from "../hooks/useRankingState";
import { AVG_AGE_OPTIONS, EMPLOYEE_SIZE_OPTIONS, TENURE_OPTIONS } from "../lib/filterOptions";
import type {
  AvgAgeBucket,
  CompaniesData,
  CurvesData,
  EmployeeSizeBucket,
  TargetAge,
  TenureBucket,
} from "../types";
import { AgeSwitch } from "./AgeSwitch";
import { FilterSelect } from "./FilterSelect";
import { FilterToggleGroup } from "./FilterToggleGroup";
import { SearchInput } from "./SearchInput";
import { RankingTable } from "./RankingTable";
import { RankingCardList } from "./RankingCardList";

export function RankingApp({
  companies,
  curves,
}: {
  companies: CompaniesData;
  curves: CurvesData;
}) {
  const { state, setState, rankedCompanies } = useRankingState(companies, curves);

  const handleAgeChange = (targetAge: TargetAge) => {
    setState((prev) => ({ ...prev, targetAge }));
  };

  const industryOptions = companies.industries.map((industry) => ({
    value: industry,
    label: industry,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">年齢補正年収ランキング</h1>
        <div className="overflow-x-auto">
          <AgeSwitch value={state.targetAge} onChange={handleAgeChange} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect
            label="業種"
            value={state.industry}
            onChange={(industry) => setState((prev) => ({ ...prev, industry }))}
            options={industryOptions}
          />
          <FilterToggleGroup
            label="従業員数"
            value={state.employeeSize}
            onChange={(employeeSize) =>
              setState((prev) => ({
                ...prev,
                employeeSize: employeeSize as EmployeeSizeBucket | null,
              }))
            }
            options={EMPLOYEE_SIZE_OPTIONS}
          />
          <FilterToggleGroup
            label="在籍年数"
            value={state.tenure}
            onChange={(tenure) =>
              setState((prev) => ({ ...prev, tenure: tenure as TenureBucket | null }))
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
              }))
            }
            options={AVG_AGE_OPTIONS}
          />
          <SearchInput
            value={state.query}
            onChange={(query) => setState((prev) => ({ ...prev, query }))}
          />
        </div>
      </header>
      <RankingTable companies={rankedCompanies} targetAge={state.targetAge} />
      <RankingCardList companies={rankedCompanies} targetAge={state.targetAge} />
    </div>
  );
}
