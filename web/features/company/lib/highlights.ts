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

/**
 * 年齢別の推定年収に添える説明文（C3、アートボード 4b）。
 *
 * **`buildHighlights` と同じ線を守る——数値から機械的に導ける事実だけ。** 表と
 * チャートに出ている8点を、読者が自分で見つけなくてよい形に言い直すだけである。
 *
 * 3文を返しうる。最高水準の年齢／伸びが最大の5歳区間／末尾で下がる理由。
 * **末尾が下がっていなければ3文目は出さない**（該当しない項目は出さない）。
 */
export function buildCurveSummary(byAge: CompanyAgeStats[], name: string): string[] {
  if (byAge.length < 2) return [];

  const peak = byAge.reduce((best, s) => (s.salary > best.salary ? s : best), byAge[0]);

  let jump = { from: byAge[0], to: byAge[1], diff: byAge[1].salary - byAge[0].salary };
  for (let i = 1; i < byAge.length - 1; i++) {
    const diff = byAge[i + 1].salary - byAge[i].salary;
    if (diff > jump.diff) jump = { from: byAge[i], to: byAge[i + 1], diff };
  }

  const sentences = [
    `${name}の推定年収を年齢別に見ると、${peak.targetAge}歳の` +
      `${formatManYen(peak.salary)}が最も高い水準になります。`,
  ];

  if (jump.diff > 0) {
    sentences.push(
      `5歳刻みで比べると${jump.from.targetAge}歳から${jump.to.targetAge}歳の伸びが最も大きく、` +
        `＋${formatManYen(jump.diff)}でした。`
    );
  }

  // 定年前後でカーブが下向きになる会社だけ、下がって見える理由を添える。
  const last = byAge[byAge.length - 1];
  const previous = byAge[byAge.length - 2];
  if (last.salary < previous.salary) {
    sentences.push(
      `${last.targetAge}歳で下がるのは、補正に使う統計側の賃金カーブが定年前後で下向きになるためです。`
    );
  }

  return sentences;
}
