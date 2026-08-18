export function formatManYen(yen: number): string {
  return `${Math.round(yen / 10000).toLocaleString("ja-JP")}万円`;
}

/**
 * 万円・小数第1位まで。計算方法ページで式を1本たどって見せるときに使う。
 *
 * 万円単位に丸めた値どうしで足し引きすると、読者が電卓を叩いた答えが
 * 表示している推定年収と1万円ずれる。桁を1つ増やすと合う。
 */
export function formatManYen1(yen: number): string {
  return `${(yen / 10000).toFixed(1)}万円`;
}

export function formatDecimal1(n: number): string {
  return n.toFixed(1);
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}
