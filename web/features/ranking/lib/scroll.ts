/**
 * ページ送りの後は、読者を一覧の先頭（＝ページ最上部）へ戻す（Issue #96）。
 *
 * ページ送りのボタンは100社ぶんの表の下にあるので、押した直後の視界は
 * 2ページ目の**末尾**になる。位置がそのままだと「押しても何も起きていない」
 * ように見える——実際には行が入れ替わっているが、その入れ替わりが画面の
 * 上のほうで起きていて目に入らない。
 *
 * **`behavior` は指定せず既定（`auto`）のまま**＝一瞬で戻す。`smooth` にすると
 * 100行ぶんの距離を流れることになり、`prefers-reduced-motion` の読者にも
 * 配慮が要る。ページ送りは離散的な操作なので、途中の景色に意味は無い。
 *
 * `window` を引数で受けるのは、テスト（node 環境の vitest）から呼べるようにする
 * ため。サーバー側で読み込まれても評価時には何も起きない。
 */
export function scrollToPageTop(scroller: Pick<Window, "scrollTo"> | undefined = globalThis.window) {
  scroller?.scrollTo({ top: 0, left: 0 });
}
