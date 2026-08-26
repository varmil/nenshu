import type { AnchorHTMLAttributes } from "react";

export type NavLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  /**
   * 受け取るが**何もしない。** `next/link` の頃の呼び出し側をそのまま動かすために
   * 残してある。**先読みはもともと切ってあり**（本番のトップページ表示だけで34件の
   * リクエストが飛んだ。`RankingTable.tsx`）、素の `a` 要素にはその概念が無い。
   */
  prefetch?: boolean;
};

/**
 * ページ間の遷移はすべてこれを使う。**素の `a` 要素**（F1・Issue #209・ADR-0014）。
 *
 * **`next/link` を外した。** 遷移は素の HTML 取得になり、着いた先ではページごと
 * 作り直される——それが Astro の遷移で、**静的アセットで返せる**ことの前提でもある
 * （アセットは `RSC: 1` 付きのリクエストにも `text/html` を返すので、RSC の
 * クライアント遷移とは両立しなかった。`docs/framework/intent.md`）。
 *
 * **JS を1バイトも持たない。** 遷移中のバーは `NavProgressBar` が `document` で
 * 1本のリスナーとして拾う——**このコンポーネントに `onClick` を置くと、島の外で
 * 描かれたリンク（`/about` の本文など）では拾えない。**
 *
 * 残してあるのは呼び出し側の綴りを変えないためで、`eslint.config.mjs` は
 * 引き続き素の `a` を直接書かせない（バーが出なくなるため）。
 */
export function NavLink({ children, prefetch: _prefetch, ...props }: NavLinkProps) {
  return <a {...props}>{children}</a>;
}
