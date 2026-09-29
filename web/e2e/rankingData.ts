import type { Page } from "@playwright/test";
import { rankingPageData } from "../features/ranking/lib/pageData";
import { pageRange } from "../features/ranking/lib/pagination";
import { formatInt } from "../features/ranking/lib/format";
import { PAGE_SIZE } from "../features/ranking/types";

/**
 * ランキングの E2E が期待値を作るときの入口（refresh の D0・Issue #870）。
 *
 * **1位の会社・件数・何ページ目の何行目かは、そのURLのデータから作る**
 * （`rankingPageData`＝`/` が画面を組むのと同じ関数）。社数や社名を書き写すと、
 * 毎日の更新で1社動いただけで落ちる。行数は PAGE_SIZE で頭打ちなので、絞り込みが
 * 効いたかの判定には件数表示を使う（Issue #103）。
 */

/** そのURLで `/` が描く1ページぶん。`query` は `?` を付けない。 */
export const pageDataOf = (query: string) => rankingPageData(new URLSearchParams(query));

/** そのURLの1行目の会社。 */
export const firstOf = (query: string) => pageDataOf(query).bootstrap.page.companies[0];

/** 件数表示（`RankingApp` の「◯社 中 ◯〜◯社目」、0件なら「0社」）。数はそのURLのデータから取る。 */
export function countLabel(query: string): string {
  const { bootstrap, initialState } = pageDataOf(query);
  const total = bootstrap.page.totalCount;
  if (total === 0) return "0社";
  const { from, to } = pageRange(initialState.page, total, PAGE_SIZE);
  return `${formatInt(total)}社 中 ${formatInt(from)}〜${formatInt(to)}社目`;
}

/** 件数表示の要素。完全一致で引く（桁の少ない件数が、桁の多い件数に部分一致しないように）。 */
export const countText = (page: Page, query: string) =>
  page.getByText(countLabel(query), { exact: true });
