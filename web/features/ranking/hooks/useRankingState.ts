"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useLocationSyncedState } from "@/lib/history/useLocationSyncedState";
import type { CompaniesData, CurvesData, RankingPage, RankingState } from "../types";
import { buildRankedCompanies } from "../lib/rank";
import { buildSearchParams, INITIAL_STATE, parseSearchParams } from "../lib/urlState";
import { RANKING_STATE_CHANGED_EVENT } from "../lib/queryBroadcast";

export interface UseRankingStateResult {
  state: RankingState;
  setState: Dispatch<SetStateAction<RankingState>>;
  page: RankingPage;
  /**
   * 全件が手元にあるか（E0・ADR-0013）。**`false` の間はクライアント側で
   * 絞り込めない**ので、呼び出し側は操作を実ナビゲーションに倒す。
   */
  ready: boolean;
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
 * state と URL のクエリパラメータを両方向で同期し、いま出す1ページぶんを導く。
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
 * **`companies` は初回ロードの直後には無い**（E0・ADR-0013）。届くまでは
 * サーバーが計算した `initialPage` をそのまま出す——**そのページは現在のURLに
 * 対応している**（操作は実ナビゲーションに倒すので、届く前に state は動かない）。
 *
 * 共通ヘッダの検索欄（`features/navigation/components/HeaderSearch.tsx`）は
 * `RankingApp` の祖先ではないので、URL を経路にして `RANKING_STATE_CHANGED_EVENT`
 * で届く（`lib/queryBroadcast.ts`）。
 */
export function useRankingState(
  companies: CompaniesData | null,
  curves: CurvesData,
  initialState: RankingState,
  initialPage: RankingPage
): UseRankingStateResult {
  const [state, setState] = useLocationSyncedState(
    initialState,
    readRankingState,
    rankingSearch,
    RANKING_STATE_CHANGED_EVENT
  );

  const page = useMemo(
    () => (companies === null ? initialPage : buildRankedCompanies(companies, curves, state)),
    [companies, curves, state, initialPage]
  );

  return { state, setState, page, ready: companies !== null };
}
