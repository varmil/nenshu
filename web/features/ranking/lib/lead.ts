import { listedIndustry } from "@/lib/seo/ranking";
import { formatInt } from "./format";
import type { RankingState } from "../types";

/** リード文に入る数と時点。どれも `meta` から引く（直書きしない。spec 1.4・5.3）。 */
export interface RankingLeadFacts {
  /** `fiscalPeriodLabel(meta)`。 */
  fiscalPeriod: string;
  /** 掲載社数（`meta.count`）。 */
  total: number;
  /** 掲載条件の従業員数の線（`meta.excluded.minEmployees`）。 */
  minEmployees: number;
  industries: readonly string[];
  /** 業種ごとの社数。母集団の内訳なので、ほかの絞り込みでは変わらない。 */
  industryCount: (industry: string) => number;
}

/**
 * `h1` 直下のリード文。PC でもモバイルでも同じ文を出す。
 *
 * **どちらの表示基準でも「有価証券報告書」を入れる。** 金額の出どころを示す語で、
 * 口コミベースの数字と並んだときに読者が見分ける手がかりになる（検索結果でも本文でも
 * 同じ。`lib/seo/ranking.ts` の description と同じ理由）。年齢そろえは以前、この語を
 * PC でだけ足す2文目（`hidden md:inline`）に置いていて、モバイルの画面には1つも
 * 出ていなかった。1文目に入れたので2文目は外した——同じことを2回言うことになる。
 *
 * **社数は見出しと同じ範囲を数える。** 業種で絞っていれば `銀行業の82社`、そうで
 * なければ掲載社数。見出しが `銀行業の平均年収ランキング` なのに直下が `2,961社` だと、
 * 銀行業が2,961社あるように読める。33業種に無い `ind` は見出しと同じく無視する。
 *
 * **動詞は「比べた」。「並べた」にしない**——並び替えで平均年齢順・従業員数順にしても
 * リード文は変わらないので、金額で並べたと書くと並び替えた画面で嘘になる。
 *
 * **時点は1文目に置く**（S3・`docs/site-chrome/spec.md` 5.1）。
 */
export function rankingLead(
  state: Pick<RankingState, "targetAge" | "industry">,
  facts: RankingLeadFacts
): string {
  const industry = listedIndustry(state.industry, facts.industries);
  const scope =
    industry !== null
      ? `${industry}の${formatInt(facts.industryCount(industry))}社`
      : `${formatInt(facts.total)}社`;
  const basis =
    state.targetAge === null
      ? `${facts.fiscalPeriod}の有価証券報告書の平均年間給与（単体）で比べた`
      : `${facts.fiscalPeriod}の有価証券報告書の平均年間給与を、業種の賃金カーブで${state.targetAge}歳時点に補正した`;
  return `${basis}${scope}。従業員${formatInt(facts.minEmployees)}人以上が対象。`;
}
