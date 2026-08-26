"use client";

import { useEffect } from "react";
import type { PageMeta } from "./pageMeta";
import { absoluteUrl } from "./site";

/**
 * すでに head にある要素だけを書き換える。**無ければ作らない。**
 *
 * head を描いているのは `src/components/PageHead.astro` で、**そこに無いものを
 * こちらで足すと、どのページがどの `meta` を持つかの正が2か所になる。**
 * 既にある要素の属性を書き換えるぶんには衝突しない——head ごと描き直されるのは
 * ページを移るときだけで、そのときは文書ごと入れ替わる。
 */
function setAttributeIfPresent(selector: string, name: string, value: string): void {
  const element = document.head.querySelector(selector);
  if (element !== null && element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * `PageMeta` を実際の DOM に反映する。ブラウザでしか呼べない。
 *
 * **`og:` も一緒に書き換える**（S2・Issue #116）。SNS のクローラが読むのは
 * サーバーが返す最初のHTMLなので、ここを直しても共有カードの見え方は変わらない。
 * それでも書くのは、**`og:url` と canonical が同じ文字列であること**（AC-11）が
 * DOM の上でも保たれていてほしいため——片方だけ動く状態を作ると、次に読む人が
 * どちらが正か判断できなくなる。`og:site_name`・`og:type`・`og:locale`・
 * `og:image` は状態で変わらないので触らない。
 */
export function applyPageMeta(meta: PageMeta): void {
  if (document.title !== meta.title) document.title = meta.title;
  setAttributeIfPresent('meta[name="description"]', "content", meta.description);
  setAttributeIfPresent('meta[property="og:title"]', "content", meta.title);
  setAttributeIfPresent('meta[property="og:description"]', "content", meta.description);
  // canonical はサーバーも `absoluteUrl()` で絶対URLにして出す（F1 で
  // `metadataBase` から移った）。こちらも同じ関数に通す——相対のまま書くと
  // 同じURLが2つの表記で存在することになる。
  const url = absoluteUrl(meta.canonical);
  setAttributeIfPresent('link[rel="canonical"]', "href", url);
  setAttributeIfPresent('meta[property="og:url"]', "content", url);
}

/**
 * 画面の状態に対応するメタデータを DOM に反映する（U16・Issue #135）。
 *
 * **依存に置くのはオブジェクトではなく3つの文字列。** 呼び出し側は描画のたびに
 * `PageMeta` を組み直してよく（毎回別のオブジェクトになる）、それで effect が
 * 走り直さないようにするため。
 *
 * **F1（#209・ADR-0014）で見張りをやめた。** Next.js の頃はページのメタデータが
 * 本文の後ろを流れてきて、React が届いた時点で head へ移していた。そのため
 * 読み込み直後（実測でおよそ1秒以内）に表示基準を切り替えると、**こちらが書いた
 * 直後に React のハイドレーションが `<title>` の中の文字だけを元に戻し**、
 * `description` と `canonical`（属性なので戻らない）とタイトルが食い違った——
 * 直そうとしている症状そのものだった。だから `MutationObserver` で head を見張り、
 * 食い違っていたら書き直していた。
 *
 * **Astro では head を React が触らない。** `<title>` を描くのは
 * `src/components/PageHead.astro` で、島は body の中の div にしか取り付かない。
 * 書き戻す主体が居ないので見張る相手も居ない（切り替えの直後から2秒間、100ms
 * ごとに `document.title` を読んで確かめた）。
 *
 * **「自分のパスを離れたら書かない」も要らなくなった。** ページを移ると文書ごと
 * 入れ替わるので、行き先のメタデータを前のページのもので塗り替える経路が無い
 * （`lib/history/pathname.ts` が購読をやめたのと同じ理由）。
 *
 * `useEffect` で足りる。タイトルはページの中に描かれないので、`useLayoutEffect` に
 * しても読者の目に映るものは変わらない。
 */
export function usePageMeta(meta: PageMeta): void {
  const { title, description, canonical } = meta;
  useEffect(() => {
    applyPageMeta({ title, description, canonical });
  }, [title, description, canonical]);
}
