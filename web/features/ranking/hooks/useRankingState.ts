"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CompaniesData, CurvesData, RankedCompany, RankingState } from "../types";
import { buildRankedCompanies } from "../lib/rank";
import { buildSearchParams, INITIAL_STATE, parseSearchParams } from "../lib/urlState";

const QUERY_URL_UPDATE_DEBOUNCE_MS = 300;

export interface UseRankingStateResult {
  state: RankingState;
  setState: Dispatch<SetStateAction<RankingState>>;
  rankedCompanies: RankedCompany[];
  totalCount: number;
}

function readStateFromLocation(): RankingState {
  const parsed = parseSearchParams(new URLSearchParams(window.location.search));
  return { ...INITIAL_STATE, ...parsed };
}

/**
 * state と URL のクエリパラメータを両方向で同期する。
 *
 * 初期状態はサーバー（`app/page.tsx`）がリクエストの`searchParams`からすでに
 * 計算済みの`initialState`として渡ってくる（SSR、`docs/ranking/ssr-migration/design.md`
 * 参照）。ハイドレート前のHTMLとこの初期値が最初から一致しているため、
 * マウント時にURLを読み直して補正する処理は不要——static export時代（U5〜PR #36）は
 * この補正が必須で、ブラウザのペイントに間に合わせるための`useLayoutEffect`化まで
 * 必要だったが、SSR化によりその複雑さごと不要になった。
 *
 * `next/navigation`の`useRouter`/`useSearchParams`は使わない（RSCペイロード再フェッチ
 * によるネットワーク発生・競合状態の問題。U5で確認済み、`docs/ranking/url-sync/design.md`
 * 参照）。`window.history.pushState`/`replaceState`を直接呼ぶ。
 *
 * - URL → state: `popstate`（ブラウザの戻る/進む）でだけ読み直す。`pushState`/
 *   `replaceState`は`popstate`を発火させないため、自分自身の書き込みで読み取りが
 *   再トリガーされることはない。
 * - state → URL: stateが変わるたびに発火し、現在のURLと異なる場合だけhistoryを
 *   更新する（同一なら何もしない。マウント直後はinitialStateとURLが一致している
 *   ため、この分岐で自然に何もしない）。queryだけが変わった場合は`replaceState`
 *   +デバウンス、それ以外は即座に`pushState`（1操作=1履歴エントリ）。
 */
export function useRankingState(
  companies: CompaniesData,
  curves: CurvesData,
  initialState: RankingState
): UseRankingStateResult {
  const [state, setState] = useState<RankingState>(initialState);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onPopState = () => {
      setState(readStateFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
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

  const { companies: rankedCompanies, totalCount } = useMemo(
    () => buildRankedCompanies(companies, curves, state),
    [companies, curves, state]
  );

  return { state, setState, rankedCompanies, totalCount };
}
