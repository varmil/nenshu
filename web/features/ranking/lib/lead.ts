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
 * `h1` 直下のリード文のうち、**モバイルでも出す部分**。年齢そろえのときに PC でだけ
 * 足す1文（元になる金額の説明）は含まない。
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
      : `${facts.fiscalPeriod}の平均年間給与を業種の賃金カーブで${state.targetAge}歳時点に補正した`;
  return `${basis}${scope}。従業員${formatInt(facts.minEmployees)}人以上が対象。`;
}
