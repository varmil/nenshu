/*
 * 表を囲む器の overflow を打ち消すためのクラス。
 *
 * `design-system/ui/table.tsx` の `Table` は中身を `overflow-x-auto` の `<div>` で
 * 包んでいる。**CSS の仕様では、片方の軸が `visible` でもう片方が `visible` 以外の
 * ときは `visible` が `auto` に計算される**（CSS Overflow 3）。つまりこの器は
 * `overflow-y: auto` でもあり、行の高さの端数などで中身が1pxでも縦にはみ出すと
 * **表だけが縦にスクロールする小窓になる**。オーバーレイ型でないスクロールバーを使う
 * 環境（Windows の既定など）では、これが表の右端に矢印付きの帯として出る（報告あり）。
 *
 * `design-system/ui/` は CLI が生成するものを手で盛らない約束（`design-system.md`）
 * なので、プリミティブは触らず**呼び出し側から器を上書きする**。`Table` の
 * `className` は `<table>` に付くため、器には親から属性セレクタで届かせる。
 *
 * - `TABLE_NO_VERTICAL_SCROLL` — 横は必要なら送れるまま、縦だけ止める
 * - `TABLE_NO_SCROLL` — 器としてのスクロールを完全に無くす。**列幅を先に決めていて
 *   はみ出しようがない表**（`table-fixed`）にだけ使う
 */
export const TABLE_NO_VERTICAL_SCROLL = "[&_[data-slot=table-container]]:overflow-y-hidden";

export const TABLE_NO_SCROLL = "[&_[data-slot=table-container]]:overflow-visible";
