"use client";

import { RankingApp } from "./RankingApp";
import type {
  CurvesData,
  PopulationStats,
  RankingBootstrap,
  RankingState,
} from "../types";

export interface RankingIslandProps {
  bootstrap: RankingBootstrap;
  curves: CurvesData;
  population: PopulationStats;
  initialState: RankingState;
}

/**
 * ランキングの島（F1・Issue #209）。**島は1つに収める**——Astro は島ごとに props を
 * 直列化するので、分けると同じデータが2回HTMLに入る（`docs/framework/intent.md`）。
 *
 * いまは `RankingApp` 1つなので薄いが、**ここが「島の境界」だと分かる場所**を
 * 作っておく。`app/page.tsx` の頃はこの境界が `"use client"` の有無で暗黙だった。
 */
export function RankingIsland(props: RankingIslandProps) {
  return <RankingApp {...props} />;
}
