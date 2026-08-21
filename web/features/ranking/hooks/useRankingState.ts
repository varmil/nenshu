"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useLocationSyncedState } from "@/lib/history/useLocationSyncedState";
import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { buildRankedCompanies } from "../lib/rank";
import { buildSearchParams, INITIAL_STATE, parseSearchParams } from "../lib/urlState";
import { RANKING_STATE_CHANGED_EVENT } from "../lib/queryBroadcast";

export interface UseRankingStateResult {
  state: RankingState;
  setState: Dispatch<SetStateAction<RankingState>>;
  rankedCompanies: RankedCompany[];
  totalCount: number;
  /** 年収バーの基準（そのページの1位の金額）。 */
  pageMaxSalary: number;
}

/** URL → state。URLに無い項目は初期値（＝実測値・絞り込みなし・1ページ目）に倒す。 */
function readRankingState(params: URLSearchParams): RankingState {
  return { ...INITIAL_STATE, ...parseSearchParams(params) };
}

/** state → 検索文字列。既定値は出さないので、同じ絞り込みは常に同じ文字列になる。 */
function rankingSearch(state: RankingState): string {
  return buildSearchParams(state).toString();
}

/**
 * state と URL のクエリパラメータを両方向で同期する。
 *
 * 同期そのものは `lib/history/useLocationSyncedState` が持つ（企業詳細ページの
 * 表示基準と同じ規則で動かすため。Issue #108）。ここはランキングの語彙
 * （`RankingState` ⇄ `?age=&ind=…`）を与えて、派生値を導出するだけにしてある。
 *
 * 初期状態はサーバー（`app/page.tsx`）がリクエストの `searchParams` から計算済みの
 * `initialState` として渡ってくる（SSR、`docs/ranking/ssr-migration/design.md`）。
 * **通常の表示ではこれが URL と一致している。一致しないのは戻る/進むでの復元**——
 * Next.js はルーターキャッシュに載っている RSC ツリーをそのまま返すため、
 * `initialState` は「そのツリーを作ったときのURL」の値になる。フックはマウント時に
 * URL を読み直してこれを直す。
 *
 * 共通ヘッダの検索欄（`features/navigation/components/HeaderSearch.tsx`）は
 * `RankingApp` の祖先ではないので、URL を経路にして `RANKING_STATE_CHANGED_EVENT`
 * で届く（`lib/queryBroadcast.ts`）。
 */
export function useRankingState(
  companies: CompaniesData,
  curves: CurvesData,
  initialState: RankingState
): UseRankingStateResult {
  const [state, setState] = useLocationSyncedState(
    initialState,
    readRankingState,
    rankingSearch,
    RANKING_STATE_CHANGED_EVENT
  );

  const { companies: rankedCompanies, totalCount, pageMaxSalary } = useMemo(
    () => buildRankedCompanies(companies, curves, state),
    [companies, curves, state]
  );

  return { state, setState, rankedCompanies, totalCount, pageMaxSalary };
}
