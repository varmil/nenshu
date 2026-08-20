import type { TargetAge } from "@/features/ranking/types";
import type { CompanyAgeStats, CompanyView } from "../types";

/**
 * 年収偏差値。`50 + 10 ×（推定年収 − 母集団の平均）÷ 母集団の標準偏差`。
 *
 * **年収の分布は右に強く裾を引くため、この値は100を超える**（35歳時点の
 * キーエンスで150.0。対数変換しても107.4）。正規分布を前提にした指標を
 * 非正規分布に当てているので、単独で出さず必ず `topPercent` を隣に置き、
 * 100を超えうる理由を注記する（`docs/product/glossary.md`）。
 */
export function deviationScore(value: number, mean: number, sd: number): number {
  if (sd <= 0) return 50;
  return 50 + (10 * (value - mean)) / sd;
}

/** 上位◯%。`全体順位 ÷ 母集団の社数 × 100`。 */
export function topPercent(rank: number, count: number): number {
  if (count <= 0) return 0;
  return (rank / count) * 100;
}

/**
 * 上位◯%の表示。
 *
 * 0.1%未満は「上位0.1%未満」にする。1位は0.054%で、「上位0.1%」と丸めると
 * 2位以下と区別がつかず、「上位0.05%」と桁を増やしても読者に理由が伝わらない。
 */
export function formatTopPercent(percent: number): string {
  if (percent < 0.1) return "上位0.1%未満";
  return `上位${percent.toFixed(1)}%`;
}

/** 偏差値の表示。小数第1位まで。 */
export function formatDeviation(deviation: number): string {
  return deviation.toFixed(1);
}

/** 全体平均との差。符号を必ず付ける。 */
export function formatDiffFromMean(diffYen: number): string {
  const sign = diffYen >= 0 ? "＋" : "−";
  return `${sign}${Math.round(Math.abs(diffYen) / 10000).toLocaleString("ja-JP")}万円`;
}

/**
 * 表示基準の現在値に対応する1件を引く。`null` は実測値（ADR-0007）。
 *
 * `view.ts`（`buildCompanyView`）ではなくこちらに置いている。`CompanyDetail` は
 * Client Component で、`view.ts` を import すると 1,867行を走査する
 * `buildCompanyView` がクライアントバンドルに死にコードとして混ざるため。
 */
export function statsForBasis(view: CompanyView, targetAge: TargetAge | null): CompanyAgeStats {
  const found = view.byBasis.find((s) => s.targetAge === targetAge);
  if (found === undefined) {
    throw new Error(`表示基準 ${targetAge ?? "実測値"} が byBasis にありません`);
  }
  return found;
}
