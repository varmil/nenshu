import { describe, it, expect } from "vitest";
import { buildRankedCompanies, displaySalary } from "./rank";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import { PAGE_SIZE } from "../types";
import type { CompaniesData, CurvesData, RankingState, SortSelection } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

function stateFor(
  targetAge: RankingState["targetAge"],
  overrides: Partial<RankingState> = {}
): RankingState {
  return {
    targetAge,
    industry: null,
    employeeSize: null,
    tenure: null,
    avgAgeBucket: null,
    query: "",
    sort: { key: "salary", order: "desc" },
    page: 1,
    ...overrides,
  };
}

const rank = (state: RankingState) => buildRankedCompanies(companies, curves, state);

describe("buildRankedCompanies", () => {
  // ADR-0007 で既定になった表示基準。補正を一切通さないので estimatedSalary は null。
  it("AC-1: 初期状態（実測値・絞り込みなし）で上位30件、1位はヒューリックで有報のまま2,295万円", () => {
    const { companies: ranked, totalCount } = rank(stateFor(null));
    expect(ranked).toHaveLength(PAGE_SIZE);
    expect(totalCount).toBe(companies.rows.length);
    expect(ranked[0].name).toBe("ヒューリック株式会社");
    expect(ranked[0].rank).toBe(1);
    expect(Math.round(ranked[0].avgSalary / 10000)).toBe(2295);
    // 有報の平均年間給与の降順で、推定は1つも通さない。
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].avgSalary).toBeLessThanOrEqual(ranked[i - 1].avgSalary);
    }
    expect(ranked.every((c) => c.estimatedSalary === null)).toBe(true);
  });

  // 平均年齢の高い会社が実測値では上に来る。これが「年齢そろえ」を用意する理由そのもの。
  it("実測値と35歳そろえで並びが変わる", () => {
    const raw = rank(stateFor(null)).companies;
    const at35 = rank(stateFor(35)).companies;
    expect(raw.map((c) => c.id)).not.toEqual(at35.map((c) => c.id));

    // 三菱商事（平均42.3歳）は実測値のほうが順位が高い。
    const rankOf = (list: typeof raw, id: string) => list.find((c) => c.id === id)?.rank;
    expect(rankOf(raw, "8058")).toBeLessThan(rankOf(at35, "8058")!);
  });

  // **実測値と年齢そろえで1位が入れ替わる**（E2 で母集団を広げた後）。実測値は
  // ヒューリック（平均39.0歳・2,295万円）、35歳そろえは平均32.4歳のＭ＆Ａキャピタル
  // パートナーズが上に来る。キーエンスは平均年齢がちょうど35.0歳なので金額が動かない。
  it("AC-2前半: 35歳そろえで1位はＭ＆Ａキャピタルパートナーズの推定年収2,330万円", () => {
    const { companies: ranked } = rank(stateFor(35));
    expect(ranked[0].name).toBe("Ｍ＆Ａキャピタルパートナーズ株式会社");
    expect(Math.round(ranked[0].estimatedSalary! / 10000)).toBe(2330);
  });

  /*
   * `buildRankedCompanies` は1ページぶんしか返さないので、PAGE_SIZE より広い範囲を
   * 見るテストはページを継ぎ足して作る（PAGE_SIZE = 30 では1ページに50社入らない）。
   */
  const topN = (targetAge: 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60, n: number) => {
    const acc: ReturnType<typeof buildRankedCompanies>["companies"] = [];
    for (let page = 1; acc.length < n; page++) {
      acc.push(...rank(stateFor(targetAge, { page })).companies);
    }
    return acc.slice(0, n);
  };

  // 2点モデル（ADR-0005）では平均年齢が違う会社どうしの順序が動きうるので、
  // 旧式（同業種内は完全に不変）より重なりは減る。実測37社に対して閾値を35社に置く。
  it("AC-2後半: 60歳時点の上位50社に、35歳時点の上位50社が35社以上含まれる", () => {
    const top50at35 = new Set(topN(35, 50).map((c) => c.id));
    const top50at60 = topN(60, 50);

    const overlap = top50at60.filter((c) => top50at35.has(c.id)).length;
    expect(overlap).toBeGreaterThanOrEqual(35);
  });

  it("pageで正しいオフセットが切り出される（2ページ目は31〜60位）", () => {
    const page1 = rank(stateFor(35, { page: 1 })).companies;
    const page2 = rank(stateFor(35, { page: 2 })).companies;
    expect(page2[0].rank).toBe(PAGE_SIZE + 1);
    expect(page2.map((c) => c.id)).not.toEqual(page1.map((c) => c.id));
  });

  it("総ページ数を超えるpageは最終ページにクランプする", () => {
    const ranked = rank(stateFor(35, { industry: "海運業", page: 999 }));
    expect(ranked.totalCount).toBe(9);
    expect(ranked.companies).toHaveLength(9);
  });

  it("AC-8: 0件のとき totalCount は0で、companies も空・バーの基準も0になる", () => {
    const ranked = rank(stateFor(35, { industry: "鉱業", query: "存在しない社名" }));
    expect(ranked.totalCount).toBe(0);
    expect(ranked.companies).toHaveLength(0);
    expect(ranked.pageMaxSalary).toBe(0);
  });

  // 従業員数・平均年齢の区分と AND の結合は `filter.test.ts`（AC-4・AC-5）が持つ。
  it("AC-6: 検索は業種とANDで結合し、「商船三井」で「株式会社　商船三井」が引ける", () => {
    const industryOnly = rank(stateFor(35, { industry: "海運業" }));
    const combined = rank(stateFor(35, { industry: "海運業", query: "商船三井" }));
    expect(combined.totalCount).toBeLessThan(industryOnly.totalCount);
    expect(combined.companies.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });
});

describe("AC-12 並び替え", () => {
  /*
   * 既定（年収が高い順）以外の5通り。**向きが効くのは全件に対してで、1ページ目の中では
   * ない**——先頭は母集団全体の端の会社と一致する（従業員数の最大はトヨタ自動車で、
   * 金額順の1ページ目には入らない）。
   */
  const extreme = (column: number, order: "asc" | "desc") => {
    const values = companies.rows.map((row) => row[column] as number);
    return order === "asc" ? Math.min(...values) : Math.max(...values);
  };
  it.each<[SortSelection, "avgSalary" | "avgAge" | "employees", number]>([
    [{ key: "salary", order: "asc" }, "avgSalary", 6],
    [{ key: "age", order: "desc" }, "avgAge", 4],
    [{ key: "age", order: "asc" }, "avgAge", 4],
    [{ key: "employees", order: "desc" }, "employees", 7],
    [{ key: "employees", order: "asc" }, "employees", 7],
  ])("%o は全件に対して効き、先頭は母集団の端の会社", (sort, field, column) => {
    const { companies: ranked } = rank(stateFor(null, { sort }));
    expect(ranked[0][field]).toBe(extreme(column, sort.order));
    const values = ranked.map((c) => c[field]);
    expect(values).toEqual([...values].sort((a, b) => (sort.order === "asc" ? a - b : b - a)));
  });

  // 年齢そろえでは金額そのものが別の系列になる（ADR-0007）。向きも同じ系列で効くこと。
  it("年齢そろえでも低い順は推定年収の昇順", () => {
    const { companies: ranked } = rank(stateFor(35, { sort: { key: "salary", order: "asc" } }));
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].estimatedSalary!).toBeGreaterThanOrEqual(ranked[i - 1].estimatedSalary!);
    }
  });

  /*
   * spec 1.10 の要点。順位は「金額で何位か」を意味するので、並べ替えたら
   * 1から振り直す、という扱いにはしない。ここが崩れると順位が「表示順の番号」に
   * 化けて、ページをまたいだ順位が意味を持たなくなる。軸を変えたときも、向きを
   * 反転したときも同じ。
   */
  it("並び替えても順位は金額基準のまま（1から振り直さない）", () => {
    const byAge = rank(stateFor(null, { sort: { key: "age", order: "asc" } })).companies;
    expect(byAge.map((c) => c.rank)).not.toEqual(byAge.map((_, i) => i + 1));

    // 同じ会社の順位は、並びを変えても金額基準の順位と一致する。
    const bySalary = new Map(rank(stateFor(null)).companies.map((c) => [c.id, c.rank]));
    for (const company of byAge) {
      const expected = bySalary.get(company.id);
      if (expected !== undefined) expect(company.rank).toBe(expected);
    }

    // 年収が低い順の1ページ目に並ぶのは最下位の30社。順位は 2,961位 から下る。
    const reversed = rank(stateFor(null, { sort: { key: "salary", order: "asc" } })).companies;
    expect(reversed[0].rank).toBe(companies.meta.count);
  });
});

describe("AC-13 年収バーの基準", () => {
  /*
   * 基準は「そのページに出ている金額の最大値」。ページ・表示基準・並び替えのどれが
   * 変わっても取り直す。**表示基準を切り替えると金額そのものが別の系列になる**ので、
   * 片方の基準で両方を描くと、年齢そろえに切り替えたとき棒だけ元の縮尺で残る
   * （最も気づきにくい壊れ方）。並び替えでは先頭の行の金額とは限らない。
   */
  it.each<[string, RankingState]>([
    ["実測値の1ページ目", stateFor(null)],
    ["実測値の2ページ目", stateFor(null, { page: 2 })],
    ["25歳そろえ", stateFor(25)],
    ["平均年齢が若い順", stateFor(null, { sort: { key: "age", order: "asc" } })],
  ])("%s: そのページに出ている金額の最大値", (_, state) => {
    const result = rank(state);
    expect(result.pageMaxSalary).toBe(Math.max(...result.companies.map(displaySalary)));
  });

  it("ページと表示基準が変わると基準も変わる", () => {
    const page1 = rank(stateFor(null)).pageMaxSalary;
    expect(rank(stateFor(null, { page: 2 })).pageMaxSalary).toBeLessThan(page1);
    expect(rank(stateFor(25)).pageMaxSalary).not.toBe(page1);
  });
});

describe("AC-14 偏差値の母集団（populationRank）", () => {
  it("絞り込みが無ければ rank と一致する", () => {
    const { companies: ranked } = rank(stateFor(null));
    for (const company of ranked) expect(company.populationRank).toBe(company.rank);
  });

  /*
   * AC-3 と AC-14。偏差値の隣に置く水準は母集団の中での位置でなければならない
   * （glossary）。海運業9社の rank は1〜9で、これを母集団の位置として使うと
   * 「上位11%」になってしまう。
   */
  it("AC-3: 海運業に絞ると9社で rank は1から振り直され、populationRank は全体のまま", () => {
    const { companies: ranked, totalCount } = rank(stateFor(null, { industry: "海運業" }));
    expect(totalCount).toBe(9);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ranked[0].populationRank).toBeGreaterThan(9);

    // 全体順位は絞り込んでも変わらない。
    const all = new Map(rank(stateFor(null)).companies.map((c) => [c.id, c.populationRank]));
    for (const company of ranked) {
      const expected = all.get(company.id);
      if (expected !== undefined) expect(company.populationRank).toBe(expected);
    }
  });
});
