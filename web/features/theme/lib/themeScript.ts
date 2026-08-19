import { DARK_CLASS, THEME_STORAGE_KEY } from "./theme";

// 初回描画より前に `<html>` のクラスを確定させるインラインスクリプト（Issue #68）。
//
// **これが無いと、OS がダークの読者に一瞬ライトの画面が見える**（FOUC）。
// SSR の HTML はエッジで24時間キャッシュされるためモードを焼けず（spec.md 3.3）、
// かといって React のハイドレーション後に付けたのでは最初の描画に間に合わない。
// そこで `<body>` の先頭に素の `<script>` として置き、HTML パーサを止めて
// 最初のペイント前に実行させる。
//
// `next/script` を使わないのは、strategy がどれも「描画をブロックしない」ことを
// 目的にしており、ここで欲しい性質（ブロックしてでも先に走る）と逆のため。
//
// `buildClarityScript`（`lib/analytics/clarity.ts`）と同じく、文字列を組み立てて
// `dangerouslySetInnerHTML` に渡す形にしている。

/**
 * 保存値があればそれ、無ければ OS の設定を見て `<html>` に `dark` を付ける。
 *
 * 全体を try/catch で囲むのは、localStorage が使えない環境（プライベートモード・
 * サードパーティ Cookie ブロック等）で例外が出てもページを壊さないため。
 * その場合は OS の設定だけで決まる。
 */
export function buildThemeScript(): string {
  return `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle(${JSON.stringify(DARK_CLASS)},d)}catch(e){}})();`;
}
