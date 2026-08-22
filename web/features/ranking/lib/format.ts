/**
 * 円 → 画面に出る万円の整数。**`formatManYen` と同じ丸め**を、比較にも使えるように
 * 数値のまま取り出したもの（C4）。
 *
 * 企業詳細ページの「30歳で600万円に達します」は、表の各行と同じ値で判定していないと
 * **表が「600万円」と出している行を文が数えない**（599万9,600円のような会社で起きる）。
 * 丸め方を書き写さず、この1か所を両方から使う。
 */
export function toManYen(yen: number): number {
  return Math.round(yen / 10000);
}

export function formatManYen(yen: number): string {
  return `${toManYen(yen).toLocaleString("ja-JP")}万円`;
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
