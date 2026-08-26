/**
 * いま居るパスを読む（F0・Issue [#208](https://github.com/varmil/nenshu/issues/208)、
 * F1・Issue [#209](https://github.com/varmil/nenshu/issues/209)・ADR-0014）。
 *
 * **F0 では `history.pushState`/`replaceState` を包んで変化を購読していた。**
 * `next/navigation` の `usePathname` が持っていた「パスが変わったら購読側を
 * 再レンダーする」経路を、Next.js を剥がした後も残すためだった——共通ヘッダは
 * レイアウトが持っていて**クライアント遷移では作り直されない**ので、レンダー時に
 * 採ったパスがクリックの時点で古くなりえた。
 *
 * **F1 でその購読ごと消した。** Astro の遷移は素の HTML 取得で、**ヘッダを含めて
 * ページごと作り直される**（`features/navigation/components/NavLink.tsx`）。
 * 文書が生きている間にパスが変わる経路は1つも残っていない——
 *
 * - ランキングの操作（絞り込み・ページ送り・検索）は `pushState` するが、
 *   **変えるのはクエリだけでパスは `/` のまま**（`lib/history/useLocationSyncedState.ts`）
 * - `/` の上でサイト名を押すと絞り込みが解けるが、行き先も `/`（`BrandLink`）
 * - 戻る/進むでページを跨ぐときは文書ごと入れ替わる（`popstate` ではない）
 *
 * **だから読むのは1回でよい。** 包むのをやめたので、`history` は素のまま残る。
 */

/** いま居るパス。サーバー（`window` が無い）では空文字。 */
export function readPathname(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/**
 * いま居るパスが**その場で**ランキング（`/`）か。
 *
 * レンダー中に読む側は `useIsRankingPath()` を使う——同じ判定だが、
 * サーバーとクライアントで同じ値になるよう `useSyncExternalStore` を通す。
 */
export function isRankingPath(): boolean {
  return readPathname() === "/";
}
