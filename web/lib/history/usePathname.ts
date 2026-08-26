"use client";

import { useSyncExternalStore } from "react";
import { installPathnameWatch, pathnameStore } from "./pathname";

/**
 * いま居るパスを読み、**変わったら再レンダーする**（F0・Issue #208）。
 * `next/navigation` の `usePathname` の置き換え。
 *
 * **サーバーでは空文字を返す。** `=== "/"` は自然に false になるので、
 * 「ランキングに居るか」の判定はサーバーでは常に「居ない」になる。**このサイトの
 * 使い方ではそれで正しい**——パスを見ているのはどちらもイベントの中の分岐で、
 * markup はパスに依らない（だからハイドレーションもずれない）。
 *
 * **配線はここで済ませる。** 呼ぶ側に `installPathnameWatch` を書かせると、
 * 新しく使い始めた場所で忘れたときに**落ちずに反応しなくなるだけ**なので
 * 気づけない。
 */
export function usePathname(): string {
  installPathnameWatch(pathnameStore);
  return useSyncExternalStore(
    pathnameStore.subscribe,
    pathnameStore.getPathname,
    () => ""
  );
}

/** いまランキング（`/`）に居るか。**綴りを1か所に寄せる。** */
export function useIsRankingPath(): boolean {
  return usePathname() === "/";
}
