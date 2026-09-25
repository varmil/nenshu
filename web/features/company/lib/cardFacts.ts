import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import type { CompanyAgeStats, CompanyView } from "../types";

/**
 * 平均年収カードの金額の直下に置く1文（`docs/company/spec.md` 1.4）。
 *
 * **有報の平均年収と平均年齢を「◯◯の平均年収は」の形で言い直す。** 以前はここに
 * 全体平均との差（`全体平均 693万円 に対して ＋1,486万円`）を置いていたが、母集団の
 * 中の位置は同じカードの順位・偏差値・位置バー・分布が既に持っている。
 *
 * **表示基準に依らず同じ文になる。** 年齢そろえのときは金額が推定値に変わるが、
 * この文はその元になった有報の値を示す。「推定」の語は見出しが持っているので
 * ここには置かない（Issue #128。1画面に1回）。
 */
export function buildCardLead(view: CompanyView): string {
  return (
    `${view.name}の最新の有価証券報告書に基づく平均年収は ` +
    `約${formatManYen(view.avgSalary)}（平均年齢${formatDecimal1(view.avgAge)}歳）です。`
  );
}

/** 平均年収カードの1項目。`total` は順位の母数（`/2,961社`）で、値より小さく添える。 */
export interface CardFact {
  label: string;
  value: string;
  total?: string;
}

/**
 * 平均年収カードの金額の下に並べる2段（C14・#818、`docs/company/spec.md` 1.4）。
 *
 * - **1段目（`profile`）は「どういう会社の金額か」**——平均年齢と従業員数。有報の値
 *   そのままなので、表示基準を切り替えても変わらない
 * - **2段目（`standing`）は全体順位と業界内順位。** カードの右の位置バーと同じ話なので、
 *   その隣の段に置く
 *
 * **偏差値は入れない**（#831）。同じカードの右の位置バーの見出し（`全体2,961社の中の位置`）
 * の隣に `偏差値 124.8` として出ており、ここにも置くと1枚のカードに同じ値が2回並ぶ。
 * 位置バーの側に残すのは、帯の右端＝偏差値の大きさという対応をその場で見せられるから。
 *
 * **在籍年数は入れない。** 値は「有価証券報告書の実測値」の節とレーダーの「定着（在籍）」
 * の軸にある。C3 ではここにも出していたが、金額の下に数字が6つ並んで目が止まる場所が
 * 無かった（親 #817）。
 *
 * 描画のたびに組み立てる。島の props には載せない（載せると固定のラベルが HTML の
 * 属性にも入る。W2・#224 と C7・#161 で踏んだ形）。
 */
export function buildCardFacts(
  view: CompanyView,
  current: CompanyAgeStats
): { profile: CardFact[]; standing: CardFact[] } {
  return {
    profile: [
      { label: "平均年齢", value: `${formatDecimal1(view.avgAge)}歳` },
      { label: "従業員数（単体）", value: `${formatInt(view.employees)}人` },
    ],
    standing: [
      {
        label: "全体順位",
        value: `${formatInt(current.rankAll)}位`,
        total: `/${formatInt(view.totalCount)}社`,
      },
      {
        label: "業界内順位",
        value: `${formatInt(current.rankIndustry)}位`,
        total: `/${formatInt(view.industryCount)}社`,
      },
    ],
  };
}
