import { formatDecimal1, formatInt } from "@/features/ranking/lib/format";
import type { CompanyAgeStats, CompanyView } from "../types";
import { formatDeviation } from "./stats";

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
 * - **2段目（`standing`）は順位と偏差値。** カードの右の位置バーと同じ話なので、
 *   その隣の段に置く。偏差値に上位◯%は添えない（モックに無いものを足さない。spec 1.4）
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
      { label: "年収偏差値", value: formatDeviation(current.deviation) },
    ],
  };
}
