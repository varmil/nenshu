import {
  classifyAvgAgeBucket,
  classifyEmployeeSize,
  classifyTenure,
} from "@/features/ranking/lib/filter";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import { formatTopPercent } from "./stats";
import type { CompanyAgeStats, CompanyView } from "../types";

/**
 * 「この会社の要点」の箇条書き（`docs/company/spec.md` 1.11）。
 *
 * **数値から機械的に導ける事実だけを書く。** 会社ごとの解説文は spec 1.10 で
 * 対象外にしてある——手元にあるのは有報の5項目と賃金カーブだけで、それ以上のことは
 * 書けない。ここは新しい情報ではなく、カードに並ぶ数値の要約である。
 *
 * **該当しない項目は出さない。** 項目数を揃えるために薄い記述を足さない。
 *
 * 「若い／長い／大きい」の判定は**ランキングのフィルタと同じ三分位**を使う
 * （`features/ranking/lib/filter.ts`）。画面の別の場所で「〜40歳」と区切っている
 * のに、ここだけ別の線で「若い」と書いたら読者が混乱する。
 */
export function buildHighlights(view: CompanyView, current: CompanyAgeStats): string[] {
  const items: string[] = [];
  const basis = current.targetAge === null ? "有価証券報告書の平均年間給与" : `${current.targetAge}歳にそろえた推定年収`;

  items.push(
    `${basis}は${formatManYen(current.salary)}。全${formatInt(view.totalCount)}社中` +
      `${formatInt(current.rankAll)}位（${formatTopPercent(current.topPercent)}）で、` +
      `全体平均より${formatManYen(Math.abs(current.diffFromMean))}${
        current.diffFromMean >= 0 ? "高い" : "低い"
      }。`
  );

  items.push(
    `${view.tse33}の${formatInt(view.industryCount)}社の中では${formatInt(current.rankIndustry)}位。`
  );

  const ageBucket = classifyAvgAgeBucket(view.avgAge);
  const tenureBucket = classifyTenure(view.avgTenure);
  if (ageBucket === "under40" || tenureBucket === "under13") {
    items.push(
      `平均年齢${formatDecimal1(view.avgAge)}歳・平均勤続${formatDecimal1(view.avgTenure)}年。` +
        `掲載企業を3つに分けたとき、${ageBucket === "under40" ? "年齢" : "勤続"}は最も短い層に入る。`
    );
  } else if (ageBucket === "43plus" || tenureBucket === "17plus") {
    items.push(
      `平均年齢${formatDecimal1(view.avgAge)}歳・平均勤続${formatDecimal1(view.avgTenure)}年。` +
        `掲載企業を3つに分けたとき、${ageBucket === "43plus" ? "年齢" : "勤続"}は最も長い層に入る。`
    );
  }

  const sizeBucket = classifyEmployeeSize(view.employees);
  if (sizeBucket === "1000plus") {
    items.push(`単体で${formatInt(view.employees)}人。掲載企業のうち1,000人以上の616社に入る。`);
  } else if (sizeBucket === "under300") {
    items.push(`単体で${formatInt(view.employees)}人。掲載企業のうち300人未満の517社に入る。`);
  }

  if (view.hasBadge) {
    items.push(
      "単体従業員数が連結の10%未満で、「本社のみ」に該当する。この金額はグループ全体を代表していない。"
    );
  }

  // 実測値のときだけ、年齢そろえに切り替える意味を1行で示す。
  if (current.targetAge === null && (ageBucket === "under40" || ageBucket === "43plus")) {
    items.push(
      ageBucket === "under40"
        ? "平均年齢が低いぶん、実測値は他社より低めに出る。「年齢そろえ」で比べ直せる。"
        : "平均年齢が高いぶん、実測値は他社より高めに出る。「年齢そろえ」で比べ直せる。"
    );
  }

  return items;
}

/**
 * 10年推移に添える増減の文（`docs/timeseries/spec.md` 2.1）。
 *
 * **端の年が欠けている会社があるので、実在する最初と最後の値で書く。** 内挿しない。
 * 値が1つしか無ければ増減を書けないので `null` を返す。
 */
export function buildHistorySummary(years: number[], values: (number | null)[]): string | null {
  const present = values
    .map((value, i) => ({ year: years[i], value }))
    .filter((entry): entry is { year: number; value: number } => entry.value !== null);
  if (present.length < 2) return null;

  const first = present[0];
  const last = present[present.length - 1];
  const diff = last.value - first.value;
  const span = last.year - first.year;
  const sign = diff >= 0 ? "＋" : "−";

  return (
    `${span}年で ${sign}${formatManYen(Math.abs(diff))}` +
    `（${first.year}年 ${formatManYen(first.value)} → ${last.year}年 ${formatManYen(last.value)}）。`
  );
}
