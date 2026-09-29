/**
 * 止める線の閾値（refresh の D8・#878・`docs/refresh/routine/design.md`）。
 *
 * **値は `pipeline/refresh/thresholds.json` の1か所に置く。** Python（数字の差分更新）と
 * TypeScript（ビルド・女性活躍DB の取り込み）の両方がそこから読む。閾値は定期実行の
 * 「通る基準」に入り（spec 1.12）、**このファイルを変える PR は自動でマージされない**——
 * 基準を変える PR をファイルで見分けるために、散らばっていた定数を寄せた。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Thresholds = {
  /** 線 B（読み違いを疑う。spec 1.11）。前の期から ±`rereadChange`、前の期の値が無くて上位 `rereadTop` 社 */
  numbers: { rereadChange: number; rereadTop: number };
  /** 社数が前回のビルドから減ってよい割合と、決算期の幅の上限（か月） */
  build: { maxCountDropRatio: number; maxPeriodRangeMonths: number };
  /** 女性活躍DB の突合できた社数が前の版から減ってよい割合 */
  worklife: { maxMatchedDropRatio: number };
};

export const THRESHOLDS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../refresh/thresholds.json"
);

export const THRESHOLDS: Thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, "utf-8"));
