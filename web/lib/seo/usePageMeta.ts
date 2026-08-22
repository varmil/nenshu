"use client";

import { useEffect } from "react";
import type { PageMeta } from "./pageMeta";
import { absoluteUrl } from "./site";

/**
 * すでに head にある要素だけを書き換える。**無ければ作らない。**
 *
 * これらの要素は Next.js（React）が描画したものなので、こちらで足すと React が
 * 知らない要素が head に残り、別のルートへ遷移しても消えずに二重になる。
 * 逆に、既にある要素の属性を書き換えるぶんには衝突しない——同じ要素が
 * 描き直されるのはルートが変わるときだけで、そのときは新しいURLに対応する値が
 * 出てほしいタイミングそのものだからである。
 */
function setAttributeIfPresent(selector: string, name: string, value: string): void {
  const element = document.head.querySelector(selector);
  if (element !== null && element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/** `PageMeta` を実際の DOM に反映する。ブラウザでしか呼べない。 */
export function applyPageMeta(meta: PageMeta): void {
  if (document.title !== meta.title) document.title = meta.title;
  setAttributeIfPresent('meta[name="description"]', "content", meta.description);
  // canonical はサーバーが `metadataBase` で絶対URLにして出しているので、
  // こちらも絶対URLに揃える（相対のまま書くと同じURLが2つの表記で存在する）。
  setAttributeIfPresent('link[rel="canonical"]', "href", absoluteUrl(meta.canonical));
}

/**
 * 画面の状態に対応するメタデータを DOM に反映し続ける（U16・Issue #135）。
 *
 * **依存に置くのはオブジェクトではなく3つの文字列。** 呼び出し側は描画のたびに
 * `PageMeta` を組み直してよく（毎回別のオブジェクトになる）、それで effect が
 * 走り直さないようにするため。
 *
 * **書いたら終わりにできない。React が `<title>` を書き戻す。** Next.js はページの
 * メタデータを本文の後ろに流し、React が届いた時点で head へ移す。読み込み直後
 * （実測でおよそ1秒以内）に表示基準を切り替えると、**こちらが書いた直後に React の
 * ハイドレーションが `<title>` の中の文字だけを元に戻す**——`description` と
 * `canonical` は属性なので戻らず、**タイトルだけが実測値のまま残る**という、直そうと
 * している症状そのものが再現する。実測した変化の順序は次のとおり:
 *
 * ```
 * childList TITLE   ← こちらの書き込み
 * attributes META   ← 〃
 * attributes LINK   ← 〃
 * characterData #text ← React が <title> の中身を元に戻す
 * ```
 *
 * そこで head を見張り、食い違っていたら書き直す。書き戻しは読み込み直後の1回きり
 * なので、以降このコールバックは「食い違っていない」を確かめて何もしない。
 *
 * **自分のパスを離れたら書かない**（`lib/history/useLocationSyncedState.ts` と同じ線）。
 * ページ間の遷移では、行き先のメタデータが React によって描かれてから、こちらの
 * 後片付けが走ることがある。パスを見ずに書き戻すと**行き先のタイトルを前のページの
 * ものへ塗り替える**。
 *
 * **マウント時にも走る。** 通常の表示ではサーバーが出した値と同じものを書くので
 * 何も起きない（`applyPageMeta` が値を比べてから書く）。効くのは**ページを跨いだ
 * 戻る**で、Next.js がルーターキャッシュの RSC ツリーをそのまま返すため、
 * メタデータが「そのツリーを作ったときのURL」のものになっている場合がある
 * （状態の側が URL を正として直る規則と対になっている。AC-15）。
 *
 * `useEffect` で足りる。タイトルはページの中に描かれないので、`useLayoutEffect` に
 * しても読者の目に映るものは変わらない。
 */
export function usePageMeta(meta: PageMeta): void {
  const { title, description, canonical } = meta;
  useEffect(() => {
    const pathname = window.location.pathname;
    const apply = () => {
      if (window.location.pathname !== pathname) return;
      applyPageMeta({ title, description, canonical });
    };
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    return () => observer.disconnect();
  }, [title, description, canonical]);
}
