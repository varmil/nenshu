/**
 * URL（`window.location`）を正として state を持つときの、書き込み可否の判断。
 *
 * **判断だけを純粋関数にしてある。** 実際に `history` を触るのは
 * `useLocationSyncedState` で、そちらはブラウザが要るので E2E でしか固定できない。
 * 「どういうときに書かないか」という規則そのものはここで単体テストに固定する。
 */

/** `window.location.search`（先頭の `?` 付き）を `URLSearchParams.toString()` と同じ形に揃える。 */
export function stripLeadingQuestion(search: string): string {
  return search.replace(/^\?/, "");
}

/** `pathname` と検索文字列から history に渡すURLを作る。空のときは `?` を付けない。 */
export function locationUrl(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

export interface WriteLocationInput {
  /** この state を持っているページのパス（マウント時に記録する）。未マウントは `null`。 */
  ownerPath: string | null;
  /** いま実際に居るパス（`window.location.pathname`）。 */
  currentPath: string;
  /** いまのURLの検索文字列（`window.location.search`。先頭の `?` はあってもよい）。 */
  currentSearch: string;
  /** state から作った検索文字列（`?` 無し）。 */
  nextSearch: string;
}

/**
 * state を URL へ書き戻してよいか。
 *
 * - **`ownerPath` が未設定なら書かない。** マウント直後の1回目は URL のほうが正で、
 *   state（サーバーから渡された初期値）は古いことがある（戻る/進むでの復元）。
 * - **居るパスが変わっていたら書かない。** 別ページへ遷移する途中で、抜けていく
 *   ページの state が次のページのURLを書き潰す事故を防ぐ。**Next.js は
 *   `history.pushState` を「浅い遷移」として扱う**ので、別パスを書いても
 *   ルートの描画は切り替わらない——URLだけが次のページになって画面は前のページの
 *   まま、という状態を作れてしまう（Issue #108 で実際に起きていた）。
 * - 差が無いなら書かない（同じURLで履歴を1件増やさない）。
 */
export function shouldWriteLocation({
  ownerPath,
  currentPath,
  currentSearch,
  nextSearch,
}: WriteLocationInput): boolean {
  if (ownerPath === null) return false;
  if (currentPath !== ownerPath) return false;
  return stripLeadingQuestion(currentSearch) !== nextSearch;
}
