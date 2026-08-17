export function formatManYen(yen: number): string {
  return `${Math.round(yen / 10000).toLocaleString("ja-JP")}万円`;
}

export function formatDecimal1(n: number): string {
  return n.toFixed(1);
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}
