"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/design-system/ui/button";
import { applyTheme, readAppliedTheme, syncSystemTheme, toggleTheme } from "../lib/theme";

/*
 * ライト/ダークの切替（Issue #68、`docs/site-chrome/spec.md` 3）。
 *
 * 現在のモードは React の state ではなく **`<html>` のクラスが正**。初期値を
 * サーバーから渡せない（SSR の HTML はエッジで24時間キャッシュされるため
 * spec.md 3.3）ので、クラスは `themeScript.ts` のインラインスクリプトが最初の
 * 描画より前に確定させており、React はそれを後から読むだけになる。
 *
 * この「React の外にある状態を読む」ために useSyncExternalStore を使う。
 * useEffect + setState でも書けるが、それは
 * react-hooks/set-state-in-effect が禁じている形（実際に lint に止められた）。
 */

/** `<html>` の class 属性の変化を購読する。自分の applyTheme も含めて拾える。 */
function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // 読者がまだ選んでいない間は OS の設定に従うので、セッション中の変化にも追従する。
  // クラスを書き換えれば上の MutationObserver が拾うので、ここで onStoreChange は呼ばない。
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = (event: MediaQueryListEvent) => syncSystemTheme(event.matches);
  media.addEventListener("change", onMediaChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onMediaChange);
  };
}

const getSnapshot = () => readAppliedTheme();

/**
 * サーバー描画とハイドレーション中に使う値。
 *
 * サーバーはモードを知りえないので null を返し、アイコンを出さない。ここで仮に
 * 太陽を描くと、ダークの読者にだけ一瞬まちがったアイコンが見える。
 * ハイドレーション後に useSyncExternalStore が getSnapshot の値へ切り替える。
 */
const getServerSnapshot = () => null;

export function ThemeToggle() {
  const theme = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => applyTheme(toggleTheme(theme ?? readAppliedTheme()))}
      // 押すと何になるかを読み上げる。現在の状態ではなく次の状態を言う。
      aria-label={theme === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える"}
      data-theme-state={theme ?? "unknown"}
    >
      {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : null}
    </Button>
  );
}
