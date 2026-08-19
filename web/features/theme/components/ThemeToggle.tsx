"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/design-system/ui/button";
import { applyTheme, readAppliedTheme, syncSystemTheme, toggleTheme } from "../lib/theme";

/*
 * ライト/ダークの切替（Issue #68、`docs/site-chrome/spec.md` 3）。
 *
 * **どちらのモードかを JavaScript で判定して描き分けない。** 両方の中身を常に出し、
 * どちらを見せるかは `dark:` バリアント（＝ `<html>` の `dark` クラス）に任せる。
 * クラスは `themeScript.ts` のインラインスクリプトが最初の描画より前に確定させて
 * いるので、**サーバーのHTMLがそのまま正しい見た目になり、ハイドレーションを
 * 待つ必要が無い。**
 *
 * 以前は現在のモードを useSyncExternalStore で読み、サーバー側では null を返して
 * アイコンを出していなかった。その結果 **ボタンが約86ms ものあいだ空のまま残り、
 * ハイドレーション後にアイコンが現れる**（実測）ちらつきになっていた。
 *
 * 押した時のモードは DOM から読めばよく（`readAppliedTheme`）、描画のための
 * state は持たない。
 */
export function ThemeToggle() {
  // 読者がまだ選んでいない間は OS の設定に従うので、セッション中の変化にも追従する。
  // ここでは state を更新しない——見た目は CSS が決めるので再描画が要らない。
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => syncSystemTheme(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => applyTheme(toggleTheme(readAppliedTheme()))}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
      {/*
        アクセシブル名も CSS で切り替える。aria-label は属性なので CSS から
        変えられず、JSで出し分けるとアイコンと同じちらつきが戻ってしまう。
        `sr-only` は display を指定しないので `hidden` / `dark:block` と併用できる。
        display:none の側はアクセシブル名の計算から外れるため、読み上げは常に1つ。
      */}
      <span className="sr-only dark:hidden">ダークモードに切り替える</span>
      <span className="sr-only hidden dark:block">ライトモードに切り替える</span>
    </Button>
  );
}
