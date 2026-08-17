"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { buildRankedCompanies } from "../lib/rank";
import { buildSearchParams, INITIAL_STATE, parseSearchParams } from "../lib/urlState";

const QUERY_URL_UPDATE_DEBOUNCE_MS = 300;

// static export のビルド時プリレンダーは Node 上での実行なので useLayoutEffect は
// 使えない（Reactが警告を出す）。ブラウザでだけ useLayoutEffect を使う。
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface UseRankingStateResult {
  state: RankingState;
  setState: Dispatch<SetStateAction<RankingState>>;
  rankedCompanies: RankedCompany[];
}

function readStateFromLocation(): RankingState {
  if (typeof window === "undefined") return INITIAL_STATE;
  const parsed = parseSearchParams(new URLSearchParams(window.location.search));
  return { ...INITIAL_STATE, ...parsed };
}

/**
 * state と URL のクエリパラメータを両方向で同期する。
 *
 * `next/navigation` の `useRouter`/`useSearchParams` は使わない。
 * - `useSearchParams()` は static export だとコンポーネントが
 *   `BAILOUT_TO_CLIENT_SIDE_RENDERING` によって静的HTMLから中身ごと除外される
 *   （実際にビルドして確認した）。
 * - `useRouter().push`/`.replace` はApp Routerの通常のナビゲーションとして
 *   RSCペイロードの再フェッチ（`?...&_rsc=...`というリクエスト）を伴う。これは
 *   spec.md §3の「ネットワークアクセスを伴わない」という要件に反するうえ、
 *   実際にE2Eで検証したところこの再フェッチ絡みで素早い連続操作時に状態が
 *   失われる不具合も再現した（いずれも実際にビルド・E2Eで踏んで確認した）。
 *
 * どちらも避け、`window.history.pushState`/`replaceState` を直接呼ぶ。
 * これらはNext.jsのナビゲーション機構を経由しないため、ネットワークも
 * コンポーネントの再マウントも発生しない。
 *
 * - URL → state: マウント時に一度読み、以後は `popstate`（ブラウザの戻る/進む）
 *   でだけ読み直す。`pushState`/`replaceState` は `popstate` を発火させないため、
 *   自分自身の書き込みで読み取りが再トリガーされることはない。
 *   マウント時の読み取りは `useEffect` ではなく `useIsomorphicLayoutEffect` で行う。
 *   `useEffect` だとブラウザが一度「初期値（絞り込みなし）」の状態をペイントした後に
 *   非同期で補正されるため、フィルタ付きURLを直接開いた際に一瞬絞り込み前の内容が
 *   見えてから正しい内容に描き変わるチラつきが発生する（実際に確認した）。
 *   `useLayoutEffect` はハイドレート後のDOMコミット直後・ブラウザがペイントする前に
 *   同期的に走るため、この2回目のレンダーはブラウザに一切ペイントされず、
 *   結果としてチラつきが消える。
 * - state → URL: stateが変わるたびに発火し、現在のURLと異なる場合だけ
 *   history を更新する（同一なら何もしない）。queryだけが変わった場合は
 *   `replaceState`+デバウンス、それ以外は即座に`pushState`（1操作=1履歴エントリ）。
 */
export function useRankingState(companies: CompaniesData, curves: CurvesData): UseRankingStateResult {
  const [state, setState] = useState<RankingState>(INITIAL_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 書き込みeffectの最初の発火をスキップするためのガード。マウント直後、読み取り
  // effectのsetStateがまだ反映されていない（stateが古いデフォルト値のままの）
  // 1回目のレンダーで書き込みeffectが走ると、URLをデフォルト状態で一旦上書きして
  // しまい、直接URLを開いたときの復元が壊れる（実際にE2Eで再現して踏んだ）。
  const isFirstWrite = useRef(true);

  useIsomorphicLayoutEffect(() => {
    setState(readStateFromLocation());

    const onPopState = () => {
      setState(readStateFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (isFirstWrite.current) {
      isFirstWrite.current = false;
      return;
    }

    const nextQs = buildSearchParams(state).toString();
    const currentQs = window.location.search.replace(/^\?/, "");
    if (nextQs === currentQs) return;

    const url = nextQs ? `${window.location.pathname}?${nextQs}` : window.location.pathname;
    const currentFromUrl = readStateFromLocation();
    const onlyQueryDiffers =
      state.targetAge === currentFromUrl.targetAge &&
      state.industry === currentFromUrl.industry &&
      state.employeeSize === currentFromUrl.employeeSize &&
      state.tenure === currentFromUrl.tenure &&
      state.avgAgeBucket === currentFromUrl.avgAgeBucket &&
      state.query !== currentFromUrl.query;

    clearTimeout(debounceRef.current);
    if (onlyQueryDiffers) {
      debounceRef.current = setTimeout(() => {
        window.history.replaceState(null, "", url);
      }, QUERY_URL_UPDATE_DEBOUNCE_MS);
    } else {
      window.history.pushState(null, "", url);
    }

    return () => clearTimeout(debounceRef.current);
  }, [state]);

  const rankedCompanies = useMemo(
    () => buildRankedCompanies(companies, curves, state),
    [companies, curves, state]
  );

  return { state, setState, rankedCompanies };
}
