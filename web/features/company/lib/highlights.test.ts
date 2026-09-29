import { describe, it, expect } from "vitest";
import { TARGET_AGES } from "@/features/ranking/types";
import { formatManYen, toManYen } from "@/features/ranking/lib/format";
import {
  companies,
  curves,
  history,
  historyYearsOf,
  pickCompany,
  rowOf,
  stats,
} from "@/testing/realData";
import type { CompanyAgeStats } from "../types";
import { buildCompanyView } from "./view";
import {
  buildCurveSummary,
  buildHistoryPeak,
  buildHistorySummary,
  findSalaryMilestones,
} from "./highlights";

/**
 * 8年齢ぶん（実測値を除く）。会社を選ぶ条件と全社の突き合わせで同じ会社を何度も組むので、
 * 1社につき1度だけ組む（`buildCompanyView` は近傍の算出まで走る）。
 */
const byAgeCache = new Map<string, CompanyAgeStats[]>();
function byAge(id: string) {
  let ages = byAgeCache.get(id);
  if (ages === undefined) {
    const view = buildCompanyView(companies, curves, stats, id)!;
    ages = view.byBasis.filter((s) => s.targetAge !== null);
    byAgeCache.set(id, ages);
  }
  return ages;
}

const milestonesOf = (id: string) => findSalaryMilestones(byAge(id));

/** 8年齢の金額（万円）から、`findSalaryMilestones` が読む形を組む。 */
const agesOf = (manYen: number[]) =>
  TARGET_AGES.map((targetAge, i) => ({ targetAge, salary: manYen[i] * 10_000 }) as CompanyAgeStats);

/** 10年推移のうち値のある年（年の並び）。 */
function presentYears(id: string) {
  return historyYearsOf(id)
    .map((year, i) => ({ year, value: history.byId[id]?.[i] ?? null }))
    .filter((entry): entry is { year: number; value: number } => entry.value !== null);
}

describe("buildCurveSummary", () => {
  it("到達年齢・最高水準・伸びが最大の5歳区間を述べる", () => {
    // 到達年齢を3つまで載せるので、届く段が3つ以下の会社なら全部が文に並ぶ。
    const id = pickCompany("段に1〜3つ届く会社", (row) => {
      const count = milestonesOf(row[0]).length;
      return count >= 1 && count <= 3;
    });
    const name = rowOf(id)[1];
    const ages = byAge(id);
    const sentences = buildCurveSummary(ages, name);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toBe(
      `${name}の推定年収を年齢別に見ると、` +
        milestonesOf(id)
          .map((m) => `${m.age}歳で${formatManYen(m.manYen * 10_000)}`)
          .join("、") +
        "に達します。"
    );

    // 最高水準は8点の最大、伸びは隣り合う2点の差の最大。
    const top = ages.find((s) => s.salary === Math.max(...ages.map((a) => a.salary)))!;
    expect(sentences[1]).toContain(`最も高い水準は${top.targetAge}歳の${formatManYen(top.salary)}`);
    const steps = ages.slice(1).map((s, i) => s.salary - ages[i].salary);
    const k = steps.indexOf(Math.max(...steps));
    expect(sentences[2]).toContain(
      `${ages[k].targetAge}歳から${ages[k + 1].targetAge}歳の伸びが最も大きく`
    );
  });

  /*
   * 段に1つも届かない会社（8点が同じ段の間に収まる）。
   * **切り出しの「年齢別に見ると」は落とさない**——最高水準の文が引き継ぐ。
   *
   * そういう会社は金額の低い側に多く、`companies.rows` の後ろのほうにいるので、選ぶのに
   * 全社近くを組むことがある。タイムアウトを明示してある。
   */
  it("到達する段が無ければ到達年齢の文を出さない", () => {
    const id = pickCompany("どの段にも届かない会社", (row) => milestonesOf(row[0]).length === 0);
    const name = rowOf(id)[1];
    const sentences = buildCurveSummary(byAge(id), name);
    expect(sentences[0]).toContain(`${name}の推定年収を年齢別に見ると`);
    expect(sentences[0]).toContain("最も高い水準になります");
    expect(sentences.join("")).not.toContain("に達します");
  }, 60_000);

  /*
   * 末尾が下がる会社でも、下がる理由（補正に使う統計側のカーブが定年前後で
   * 下向き）は書かない（Issue #95）。この会社の数値から導ける事実ではないため。
   */
  it("末尾が下がっても仕組みの説明は足さない", () => {
    const id = pickCompany("60歳で55歳より下がる会社", (row) => {
      const ages = byAge(row[0]);
      return ages[ages.length - 1].salary < ages[ages.length - 2].salary;
    });
    expect(buildCurveSummary(byAge(id), rowOf(id)[1]).join("")).not.toContain("定年前後");
  });
});

describe("findSalaryMilestones（C4・AC-14）", () => {
  /*
   * 規則そのものを見るので合成の8点で書く。25歳の464万円から30歳の610万円で500万円と
   * 600万円の2段を越えるが、同じ年齢で越えた段は大きいほうだけを採る。60歳で下がっても
   * 届いた段は数え直さない。
   */
  it("段に届いた年齢を若い順に並べる", () => {
    expect(findSalaryMilestones(agesOf([464, 610, 733, 821, 838, 836, 834, 735]))).toEqual([
      { age: 30, manYen: 600 },
      { age: 35, manYen: 700 },
      { age: 40, manYen: 800 },
    ]);
  });

  /*
   * **表の金額と文の金額が食い違わないこと。** 判定は画面に出ている万円の値
   * （`toManYen`）で行う——円のまま比べると、表が「600万円」と描いている行を
   * 文が数えないことが起こりうる。全社で突き合わせる。
   */
  it("段に届いたと書いた年齢の行は、表でもその金額以上になっている", () => {
    for (const row of companies.rows) {
      const ages = byAge(row[0]);
      for (const milestone of findSalaryMilestones(ages)) {
        const point = ages.find((s) => s.targetAge === milestone.age)!;
        expect(toManYen(point.salary)).toBeGreaterThanOrEqual(milestone.manYen);
      }
    }
  });

  // 25歳より前のデータを持っていないので、左端で既に上回っている段は数えない。
  it("25歳で既に上回っている段は数えない", () => {
    // 最も低い段は300万円。25歳でそれを越えていれば、越えている段が文から落ちることを見られる。
    const id = pickCompany(
      "25歳で300万円を越え、その後も段に届く会社",
      (row) => toManYen(byAge(row[0])[0].salary) > 300 && milestonesOf(row[0]).length > 0
    );
    const at25 = toManYen(byAge(id)[0].salary);
    expect(milestonesOf(id).every((m) => m.manYen > at25)).toBe(true);
  });

  // 末尾（60歳）で下がる会社でも、いったん届いた段を数え直さない。
  it("いったん届いた段は下がっても数え直さない", () => {
    const id = pickCompany("段に届いた後、60歳で55歳より下がる会社", (row) => {
      const ages = byAge(row[0]);
      return (
        milestonesOf(row[0]).length > 0 &&
        ages[ages.length - 1].salary < ages[ages.length - 2].salary
      );
    });
    const found = milestonesOf(id);
    const ages = found.map((m) => m.age);
    expect(new Set(ages).size).toBe(ages.length);
    expect([...found].sort((a, b) => a.manYen - b.manYen)).toEqual(found);
  });

  // 4段以上に届く会社は、文に載るのが最初・真ん中・最後の3つになる。
  it("4段以上に届いても文に載るのは3つまで", () => {
    const id = pickCompany("4段以上に届く会社", (row) => milestonesOf(row[0]).length > 3);
    const sentence = buildCurveSummary(byAge(id), rowOf(id)[1])[0];
    expect(sentence.match(/歳で/g)).toHaveLength(3);
  });
});

describe("buildHistoryPeak（C4）", () => {
  // 金額は増減の1文と同じ書式（同じ節に並ぶ2文で書式が割れない）。
  it("最高値が途中の年にあればその年と金額を書く", () => {
    const id = pickCompany("10年推移の最高値が最新年より前にある会社", (row) => {
      const present = presentYears(row[0]);
      return (
        present.length >= 2 &&
        present[present.length - 1].value < Math.max(...present.map((e) => e.value))
      );
    });
    const present = presentYears(id);
    const peak = present.find((e) => e.value === Math.max(...present.map((p) => p.value)))!;
    expect(buildHistoryPeak(historyYearsOf(id), history.byId[id])).toBe(
      `この10年で最も高かったのは${peak.year}年の${formatManYen(peak.value)}です。`
    );
  });

  // 最新年が最高値なら書かない（増減の1文が同じ数字を既に出している）。
  it("最新年が最高値なら null", () => {
    expect(buildHistoryPeak([2017, 2018], [5_000_000, 6_000_000])).toBeNull();
    const id = pickCompany("10年推移の最新年が最高値の会社", (row) => {
      const present = presentYears(row[0]);
      const last = present[present.length - 1];
      return present.length >= 2 && present.slice(0, -1).every((e) => e.value < last.value);
    });
    expect(buildHistoryPeak(historyYearsOf(id), history.byId[id])).toBeNull();
  });

  it("値が1つ以下なら null", () => {
    expect(buildHistoryPeak([2017, 2018], [null, 5_000_000])).toBeNull();
  });
});

describe("buildHistorySummary", () => {
  it("10年の増減を最初と最後の実在する年で書く", () => {
    const id = pickCompany(
      "10年推移に値が2年以上ある会社",
      (row) => presentYears(row[0]).length >= 2
    );
    const present = presentYears(id);
    const first = present[0];
    const last = present[present.length - 1];
    const summary = buildHistorySummary(historyYearsOf(id), history.byId[id])!;
    expect(summary).toContain(`${first.year}年 ${formatManYen(first.value)}`);
    expect(summary).toContain(`${last.year}年 ${formatManYen(last.value)}`);
  });

  // 端が欠けている会社は、実在する年で書く。内挿しない。
  it("先頭が欠けていればその次の実在年から書く", () => {
    const summary = buildHistorySummary([2017, 2018, 2019], [null, 5_000_000, 6_000_000])!;
    expect(summary).toContain("2018年 500万円");
    expect(summary).toContain("2019年 600万円");
    expect(summary).toContain("1年で ＋100万円");
  });

  it("値が1つ以下なら null", () => {
    expect(buildHistorySummary([2017, 2018], [null, 5_000_000])).toBeNull();
    expect(buildHistorySummary([2017, 2018], [null, null])).toBeNull();
  });

  it("減っていれば − で書く", () => {
    const summary = buildHistorySummary([2017, 2018], [6_000_000, 5_000_000])!;
    expect(summary).toContain("−100万円");
  });
});
