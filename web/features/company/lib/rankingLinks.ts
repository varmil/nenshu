import { formatInt } from "@/features/ranking/lib/format";
import { industryPath } from "@/lib/seo/paths";
import type { CompanyAgeStats, CompanyView } from "../types";

/** 「ランキングで比べる」の1行。`note` は行き先の中でのこの会社の順位。 */
export interface RankingLink {
  label: string;
  path: string;
  note: string;
}

/**
 * 企業詳細の最下部に置く、ランキングへ戻る2本（C20・spec 1.24、Claude Design の 1b）。
 *
 * **業種が先、全体が後。** 読者が次に知りたいのは同業の中の位置のほうで、カードの2段目
 * （`buildCardFacts` の `standing`）も業界内順位を左に置いている。
 *
 * - **行き先はパンくずと同じ `industryPath()` と `/`**（ADR-0006）。どちらもインデックス対象の
 *   自己 canonical URL で、ここで組み立て直すと sitemap・canonical と1文字ずれても気づけない
 * - **行き先に表示基準を載せない。** 表示基準は URL に出さない（R1・ADR-0012）ので、
 *   年齢そろえ中も行き先は既定の実測値のファセットになる
 * - **順位は表示中の基準の値を添える**（`current` から取る）。カードの順位と同じ数字にしておかないと、
 *   同じ画面に同じ会社の順位が2通り並ぶ
 */
export function buildRankingLinks(
  view: Pick<CompanyView, "tse33" | "industryCount" | "totalCount">,
  current: Pick<CompanyAgeStats, "rankIndustry" | "rankAll">
): RankingLink[] {
  return [
    {
      label: `${view.tse33}の平均年収ランキング`,
      path: industryPath(view.tse33),
      note: `この会社は${formatInt(view.industryCount)}社中${formatInt(current.rankIndustry)}位`,
    },
    {
      label: "全業種の平均年収ランキング",
      path: "/",
      note: `この会社は${formatInt(view.totalCount)}社中${formatInt(current.rankAll)}位`,
    },
  ];
}
