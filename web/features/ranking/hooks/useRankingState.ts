"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { buildRankedCompanies } from "../lib/rank";

const INITIAL_STATE: RankingState = {
  targetAge: 35,
  industry: null,
  employeeSize: null,
  tenure: null,
  avgAgeBucket: null,
  query: "",
  visibleCount: 100,
};

export interface UseRankingStateResult {
  state: RankingState;
  setState: Dispatch<SetStateAction<RankingState>>;
  rankedCompanies: RankedCompany[];
}

export function useRankingState(companies: CompaniesData, curves: CurvesData): UseRankingStateResult {
  const [state, setState] = useState<RankingState>(INITIAL_STATE);

  const rankedCompanies = useMemo(
    () => buildRankedCompanies(companies, curves, state),
    [companies, curves, state]
  );

  return { state, setState, rankedCompanies };
}
