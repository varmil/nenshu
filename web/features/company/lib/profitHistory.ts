import { formatInt, toManYen } from "@/features/ranking/lib/format";
import type { ProfitHistory } from "../types";

/**
 * 経常利益の書式（P2・アートボード 6e）。**億円で出す。**
 *
 * サイトの他の金額は万円で通しているが、経常利益はキーエンスで 6,357億円、
 * 中小でも数十億円になる。万円にすると `63,575,600万円` と8桁が並び、
 * **桁を数えないと大きさが読めない。** 年収と混ざる心配は無い——この列だけが
 * 会社全体の利益で、隣の「稼ぐ力」は1人当たりの万円になる。
 *
 * **赤字は負のまま出す**（59社）。捨てると「データが無い」と区別できなくなる。
 */
export function formatOku(yen: number): string {
  const oku = Math.abs(yen) / 100_000_000;
  const sign = yen < 0 ? MINUS : "";
  // 10億円未満は小数第1位まで（`0億円` だと値が無いのと見分けがつかない）。
  if (oku < 10) return `${sign}${oku.toFixed(1)}億円`;
  return `${sign}${formatInt(oku)}億円`;
}

/**
 * 赤字の符号は**全角のマイナス**（spec 5. の未決事項に対する P2 の答え）。
 *
 * 画面の他の増減——全体平均との差（`formatDiffFromMean`）・推移の前年比
 * （`formatRate`）——が `＋` / `−` を使っており、ここだけ ASCII の `-` にすると
 * **同じページに2種類のマイナスが並ぶ。** 和文の中では字面も揃わない。
 */
const MINUS = "−";

/** 万円・符号つき。**赤字は負のまま出す**（捨てるとデータ無しと区別できない）。 */
export function formatSignedManYen(yen: number): string {
  const man = toManYen(yen);
  return `${man < 0 ? MINUS : ""}${formatInt(Math.abs(man))}万円`;
}

/**
 * 推移の増減を1文にする（P2）。**平均年収推移の `buildHistorySummary` と同じ形**
 * ——最初と最後の値を拾い、差を万円で言う。
 *
 * **値が2つ揃わなければ文を出さない**（`null` を返す）。1点しか無い会社で
 * 「0年で±0万円」と書いても意味がない。
 */
export function buildProfitSummary(history: ProfitHistory): string | null {
  const present = history.profit
    .map((value, i) => ({ value, year: history.years[i] }))
    .filter((p): p is { value: number; year: number } => p.value !== null);
  if (present.length < 2) return null;

  const first = present[0];
  const last = present[present.length - 1];
  const diff = toManYen(last.value) - toManYen(first.value);
  const span = last.year - first.year;
  const sign = diff > 0 ? "＋" : diff < 0 ? MINUS : "±";
  return (
    `${span}年で${sign}${formatInt(Math.abs(diff))}万円` +
    `（${first.year}年 ${formatSignedManYen(first.value)} → ` +
    `${last.year}年 ${formatSignedManYen(last.value)}）。`
  );
}
