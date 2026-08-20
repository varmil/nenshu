/**
 * 共通ヘッダの検索欄からランキングの状態へ、検索語を届けるための合図。
 *
 * ヘッダ（`features/navigation/SiteHeader`）はレイアウトが持っていて、
 * `RankingApp` の**祖先ではなく兄弟**にあたる。React のツリーが繋がっていないので、
 * props でも context でも渡せない。
 *
 * URL を正として扱い、ヘッダは `pushState` で書き、この合図を投げる。
 * `useRankingState` は `popstate` と同じ処理で URL を読み直す。
 * **`pushState` は `popstate` を発火しない**ので、専用の合図が要る（合成した
 * `PopStateEvent` を投げる手もあるが、由来が読めなくなるので名前を付けている）。
 *
 * これでネットワークは発生しない。`useRouter` を使うとRSCペイロードの再取得が
 * 走り、AC-7 の「操作でネットワークが発生しない」を壊す。
 */
export const RANKING_STATE_CHANGED_EVENT = "openreport:ranking-state-changed";

/** URL を書き換えたうえで、購読側に読み直しを促す。 */
export function pushRankingQuery(query: string) {
  const params = new URLSearchParams(window.location.search);
  if (query === "") params.delete("q");
  else params.set("q", query);
  // ページ番号は絞り込みが変わったら1に戻す（他のフィルタと同じ規則）。
  params.delete("page");
  const qs = params.toString();
  window.history.pushState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  window.dispatchEvent(new Event(RANKING_STATE_CHANGED_EVENT));
}

/**
 * 絞り込み・並び替え・表示基準をすべて初期状態に戻す（ヘッダのサイト名から）。
 *
 * **`/` の上でサイト名を押したときに、URL だけが `/` になって表示が変わらない**
 * という食い違いがあった。`<Link href="/">` は同じルートへの遷移なので
 * `RankingApp` が作り直されず、`useRankingState` が持っている状態がそのまま残る。
 * URL を正にしている以上、URL を書き換えたらこの合図で読み直させる。
 */
export function pushRankingReset() {
  if (window.location.pathname === "/" && window.location.search === "") return;
  window.history.pushState(null, "", "/");
  window.dispatchEvent(new Event(RANKING_STATE_CHANGED_EVENT));
}
