"use client";

import { useSyncExternalStore } from "react";
import { readPathname } from "./pathname";

/**
 * いま居るパスを読む（F0・Issue #208 で `next/navigation` の `usePathname` を
 * 置き換えたもの。F1・Issue #209 で購読をやめた）。
 *
 * **購読しない。** 文書が生きている間にパスが変わる経路が無いため
 * （理由は `lib/history/pathname.ts`）。`useSyncExternalStore` を通しているのは
 * **サーバーとクライアントで値を揃える**ためだけで、`subscribe` は何もしない。
 *
 * **サーバーでは空文字を返す。** `=== "/"` は自然に false になるので、
 * 「ランキングに居るか」の判定はサーバーでは常に「居ない」になる。**このサイトの
 * 使い方ではそれで正しい**——パスを見ているのはイベントの中の分岐で、
 * markup はパスに依らない（だからハイドレーションもずれない）。
 */
const noSubscribe = () => () => {};

export function usePathname(): string {
  return useSyncExternalStore(noSubscribe, readPathname, () => "");
}

/** いまランキング（`/`）に居るか。**綴りを1か所に寄せる。** */
export function useIsRankingPath(): boolean {
  return usePathname() === "/";
}
