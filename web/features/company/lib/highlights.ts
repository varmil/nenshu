import {
  classifyAvgAgeBucket,
  classifyEmployeeSize,
  classifyTenure,
} from "@/features/ranking/lib/filter";
import {
  formatDecimal1,
  formatInt,
  formatManYen,
  toManYen,
} from "@/features/ranking/lib/format";
import { formatDeviation } from "./stats";
import type { TargetAge } from "@/features/ranking/types";
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

  // 括弧に添えるのは偏差値（アートボード 4b の要点）。**上位◯%は出さない**
  // ——モックに無いものを足さない、という運営者の指示。
  items.push(
    `${basis}は${formatManYen(current.salary)}。全${formatInt(view.totalCount)}社中` +
      `${formatInt(current.rankAll)}位（偏差値${formatDeviation(current.deviation)}）で、` +
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
 * 到達金額の段（万円）。**丸い数字だけを置く**——「643万円に達します」と書いても
 * 読者の頭に残る水準にならない。
 *
 * 800万円までは100万円刻み、その上は段を広げる。1,867社の推定年収は8点の最大値で
 * 中位772万円・上位10%が1,049万円・最大2,699万円に散っているので、上まで100万円刻みを
 * 続けると高い会社だけ段が10個以上並び、逆に200万円刻みにすると大半の会社（600〜900万円台）で
 * 何も言えなくなる。
 */
const SALARY_MILESTONES = [300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000, 2500, 3000];

/** 文に載せる到達年齢の上限。3つを超えると1文が読めない長さになる。 */
const MILESTONE_LIMIT = 3;

/** ある年齢で初めて届いた段。金額は**万円**（表と同じ丸めの値）。 */
export interface SalaryMilestone {
  age: TargetAge;
  manYen: number;
}

/**
 * 8点の推定年収が、どの年齢でどの段に届くか（C4・Issue #146、親 #145）。
 *
 * **判定は画面に出ている万円の値で行う**（`toManYen`）。円のまま比べると、表が
 * 「600万円」と描いている行（599万9,600円）を文が数えず、表と文が食い違う。
 *
 * **25歳で既に上回っている段は数えない。** 8点の左端より前のデータを持っていないので、
 * そこで「達する」と書くと、25歳より前のどこかで届いたはずのものを25歳のこととして
 * 書くことになる。
 *
 * **同じ年齢で複数の段に届いたら、いちばん大きい段だけを採る。** 「30歳で500万円、
 * 30歳で600万円」と並べても年齢の情報は増えない。
 *
 * **到達済みの水準は下がっても戻らない**（末尾の60歳で下がる会社が多い）。走査中の最大値を
 * 基準にするので、いったん届いた段を後ろの年齢でもう一度数えることはない。
 */
export function findSalaryMilestones(byAge: CompanyAgeStats[]): SalaryMilestone[] {
  const found: SalaryMilestone[] = [];
  if (byAge.length === 0) return found;

  let reached = toManYen(byAge[0].salary);
  for (const stats of byAge.slice(1)) {
    const manYen = toManYen(stats.salary);
    const crossed = SALARY_MILESTONES.filter((step) => step > reached && step <= manYen);
    if (crossed.length > 0 && stats.targetAge !== null) {
      found.push({ age: stats.targetAge, manYen: crossed[crossed.length - 1] });
    }
    reached = Math.max(reached, manYen);
  }

  return found;
}

/**
 * 文に載せる3つを選ぶ。**両端は落とさない**——最初の段は「いつ届き始めるか」、
 * 最後の段は「どこまで行くか」で、間の段より情報が多い。4つ以上あるときは真ん中を1つ足す。
 */
function pickMilestones(all: SalaryMilestone[]): SalaryMilestone[] {
  if (all.length <= MILESTONE_LIMIT) return all;
  return [all[0], all[Math.floor((all.length - 1) / 2)], all[all.length - 1]];
}

/**
 * 年齢別の推定年収に添える説明文（C3、アートボード 4b）。
 *
 * **`buildHighlights` と同じ線を守る——数値から機械的に導ける事実だけ。** 表と
 * チャートに出ている8点を、読者が自分で見つけなくてよい形に言い直すだけである。
 *
 * 3文を返しうる。**到達年齢**（C4・親 Issue #145。「30歳で600万円、35歳で700万円、
 * 40歳で800万円に達します」）、最高水準の年齢、伸びが最大の5歳区間。**該当しない
 * ものは出さない**——段に1つも届かない会社では到達年齢の文を、伸びが1度も無い会社では
 * 最後の文を落とす。
 *
 * **切り出しの「◯◯の推定年収を年齢別に見ると」は必ず1文目が持つ。** 到達年齢の文が
 * 落ちたときは最高水準の文がそれを引き継ぐ（節の地の文が社名から始まらなくなるのを避ける）。
 *
 * **末尾が下がる理由は書かない（Issue #95）。** 「60歳で下がるのは統計側の賃金カーブが
 * 定年前後で下向きになるため」は、この会社の数値から導ける事実ではなく補正の仕組みの
 * 説明で、上の線から外れる。仕組みの話は `/about` にある。
 */
export function buildCurveSummary(byAge: CompanyAgeStats[], name: string): string[] {
  if (byAge.length < 2) return [];

  const peak = byAge.reduce((best, s) => (s.salary > best.salary ? s : best), byAge[0]);

  let jump = { from: byAge[0], to: byAge[1], diff: byAge[1].salary - byAge[0].salary };
  for (let i = 1; i < byAge.length - 1; i++) {
    const diff = byAge[i + 1].salary - byAge[i].salary;
    if (diff > jump.diff) jump = { from: byAge[i], to: byAge[i + 1], diff };
  }

  const milestones = pickMilestones(findSalaryMilestones(byAge));
  const sentences: string[] = [];

  if (milestones.length > 0) {
    sentences.push(
      `${name}の推定年収を年齢別に見ると、` +
        milestones
          .map((m) => `${m.age}歳で${m.manYen.toLocaleString("ja-JP")}万円`)
          .join("、") +
        "に達します。"
    );
    sentences.push(
      `最も高い水準は${peak.targetAge}歳の${formatManYen(peak.salary)}です。`
    );
  } else {
    // 段に1つも届かない会社（8点が最も低い段の中に収まる。実データで8社）。
    // 到達年齢の文を省いたぶん、切り出しの「年齢別に見ると」は最高水準の文が引き継ぐ。
    sentences.push(
      `${name}の推定年収を年齢別に見ると、${peak.targetAge}歳の` +
        `${formatManYen(peak.salary)}が最も高い水準になります。`
    );
  }

  if (jump.diff > 0) {
    sentences.push(
      `5歳刻みで比べると${jump.from.targetAge}歳から${jump.to.targetAge}歳の伸びが最も大きく、` +
        `＋${formatManYen(jump.diff)}でした。`
    );
  }

  return sentences;
}

/**
 * 「有価証券報告書の実測値」の節に置く地の文（C4・spec 1.17）。
 *
 * **新しい数値は1つも出さない。** すぐ下の4セル（平均年収・平均年齢・在籍年数・
 * 従業員数）をそのまま1文にしたものである。数値は `dl` の `dd` に入っており、
 * 読み上げでも検索結果の抜粋でも「ラベルと値の対」以上には読めない——同じ内容が
 * 文としても置いてあれば、どちらの経路でも意味のある形で届く。
 *
 * **決算期はここに書かない。** 節の見出し（`有価証券報告書の実測値（2026年3月期）`）が
 * 持っている（S3・Issue #134）。1画面に1回。
 *
 * **表示基準に依らず同じ文になる。** 実測値そのものなので、年齢そろえを選んでも
 * 変わらない（推移の節と同じ扱い）。
 */
export function buildActualsSummary(view: CompanyView): string {
  return (
    `有価証券報告書によると、${view.name}の平均年収は${formatManYen(view.avgSalary)}、` +
    `平均年齢は${formatDecimal1(view.avgAge)}歳、平均勤続年数は${formatDecimal1(view.avgTenure)}年、` +
    `従業員数は${formatInt(view.employees)}人です。`
  );
}

/**
 * 10年推移の最高値（C4・`docs/timeseries/spec.md` 2.1）。
 *
 * **最新年が最高値の会社では出さない**（1,852社中1,287社）。`buildHistorySummary` の
 * 1文目が最新年の金額を既に書いているので、同じ数字を2度並べることになる。
 * 最高値が途中の年にある会社（565社）でだけ、その年と金額を足す。
 */
export function buildHistoryPeak(years: number[], values: (number | null)[]): string | null {
  const present = values
    .map((value, i) => ({ year: years[i], value }))
    .filter((entry): entry is { year: number; value: number } => entry.value !== null);
  if (present.length < 2) return null;

  const peak = present.reduce((best, e) => (e.value > best.value ? e : best), present[0]);
  const last = present[present.length - 1];
  if (peak.year === last.year) return null;

  return `この10年で最も高かったのは${peak.year}年の${formatManYen(peak.value)}です。`;
}
