import type { CompanyRow } from "@/features/ranking/types";

/**
 * ロゴの有無だけを、`companies.rows` と同じ並びの1文字ずつの文字列にする。
 *
 * **`logos.json` を丸ごとクライアントへ渡さない**（gzip 41.7KB。`/` の予算は
 * 75,000B で現状 71,671B しか余裕が無い）。表示に要るのは「ロゴがあるか」だけ——
 * **縦横比は要らない。器の寸法が固定で、中身は `object-contain` で収まるため、
 * 画像が届いてもレイアウトは動かない**（AC-12）。
 *
 * 1,867文字＝raw 1.9KB・gzip 約250B。
 */
export function buildLogoMask(rows: readonly CompanyRow[], byId: Record<string, unknown>): string {
  return rows.map((row) => (byId[row[0]] ? "1" : "0")).join("");
}

/** マスクを id の集合に開く。クライアントで一度だけ行う。 */
export function logoIdSet(rows: readonly CompanyRow[], mask: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (mask[i] === "1") set.add(rows[i][0]);
  }
  return set;
}
