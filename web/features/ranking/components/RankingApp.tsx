"use client";

import { useRankingState } from "../hooks/useRankingState";
import type { CompaniesData, CurvesData, TargetAge } from "../types";
import { AgeSwitch } from "./AgeSwitch";
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">年齢補正年収ランキング</h1>
        <div className="overflow-x-auto">
          <AgeSwitch value={state.targetAge} onChange={handleAgeChange} />
        </div>
      </header>
      <RankingTable companies={rankedCompanies} targetAge={state.targetAge} />
      <RankingCardList companies={rankedCompanies} targetAge={state.targetAge} />
    </div>
  );
}
