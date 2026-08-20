import { describe, it, expect } from "vitest";
import { buildRankedCompanies } from "./rank";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import type { CompaniesData, CurvesData, RankingState } from "../types";

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
    sort: "salary",
    page: 1,
    ...overrides,
  };
}

describe("buildRankedCompanies", () => {
  // ADR-0007 で既定になった表示基準。補正を一切通さないので estimatedSalary は null。
  it("AC-1: 初期状態（実測値・絞り込みなし）で上位100件、1位はキーエンスで有報のまま2,178万円", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null)
    );
    expect(ranked).toHaveLength(100);
    expect(totalCount).toBe(companies.rows.length);
    expect(ranked[0].name).toBe("株式会社キーエンス");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].estimatedSalary).toBeNull();
    expect(Math.round(ranked[0].avgSalary / 10000)).toBe(2178);
  });

  it("実測値では有報の平均年間給与の降順に並ぶ", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(null));
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].avgSalary).toBeLessThanOrEqual(ranked[i - 1].avgSalary);
      expect(ranked[i].estimatedSalary).toBeNull();
    }
  });

  // 平均年齢の高い会社が実測値では上に来る。これが「年齢そろえ」を用意する理由そのもの。
  it("実測値と35歳そろえで並びが変わる", () => {
    const raw = buildRankedCompanies(companies, curves, stateFor(null)).companies;
    const at35 = buildRankedCompanies(companies, curves, stateFor(35)).companies;
    expect(raw.map((c) => c.id)).not.toEqual(at35.map((c) => c.id));

    // 三菱商事（平均42.3歳）は実測値のほうが順位が高い。
    const rankOf = (list: typeof raw, id: string) => list.find((c) => c.id === id)?.rank;
    expect(rankOf(raw, "8058")).toBeLessThan(rankOf(at35, "8058")!);
  });

  it("AC-2前半: 35歳そろえで1位はキーエンスの推定年収2,178万円", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35));
    expect(ranked[0].name).toBe("株式会社キーエンス");
    expect(Math.round(ranked[0].estimatedSalary! / 10000)).toBe(2178);
  });

  // 2点モデル（ADR-0005）では平均年齢が違う会社どうしの順序が動きうるので、
  // 旧式（同業種内は完全に不変）より重なりは減る。実測37社に対して閾値を35社に置く。
  it("AC-2後半: 60歳時点の上位50社に、35歳時点の上位50社が35社以上含まれる", () => {
    const top50at35 = new Set(
      buildRankedCompanies(companies, curves, stateFor(35)).companies.slice(0, 50).map((c) => c.id)
    );
    const top50at60 = buildRankedCompanies(companies, curves, stateFor(60)).companies.slice(0, 50);

    const overlap = top50at60.filter((c) => top50at35.has(c.id)).length;
    expect(overlap).toBeGreaterThanOrEqual(35);
  });

  it("1ページの件数はPAGE_SIZE（100）で切り出される", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35));
    expect(ranked).toHaveLength(100);
  });

  it("pageで正しいオフセットが切り出される（2ページ目は101〜200位）", () => {
    const page1 = buildRankedCompanies(companies, curves, stateFor(35, { page: 1 })).companies;
    const page2 = buildRankedCompanies(companies, curves, stateFor(35, { page: 2 })).companies;
    expect(page2[0].rank).toBe(101);
    expect(page2.map((c) => c.id)).not.toEqual(page1.map((c) => c.id));
  });

  it("総ページ数を超えるpageは最終ページにクランプする", () => {
    const ranked = buildRankedCompanies(companies, curves, stateFor(35, { industry: "海運業", page: 999 }));
    expect(ranked.totalCount).toBe(7);
    expect(ranked.companies).toHaveLength(7);
  });

  it("0件のときtotalCountが0でcompaniesも空になる", () => {
    const ranked = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "鉱業", query: "存在しない社名" })
    );
    expect(ranked.totalCount).toBe(0);
    expect(ranked.companies).toHaveLength(0);
  });

  it("AC-3: 業種で「海運業」を選ぶと7社になり、順位が1から振り直される", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "海運業" })
    );
    expect(totalCount).toBe(7);
    expect(ranked).toHaveLength(7);
    expect(ranked[0].rank).toBe(1);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("AC-4: 従業員数で「1,000人以上」を選ぶと616社になる", () => {
    const { totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { employeeSize: "1000plus" })
    );
    expect(totalCount).toBe(616);
  });

  it("AC-5: 業種と平均年齢を重ねると、業種のみより件数が減る", () => {
    const industryOnly = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "情報・通信業" })
    );
    const combined = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "情報・通信業", avgAgeBucket: "under40" })
    );
    expect(combined.totalCount).toBeLessThan(industryOnly.totalCount);
  });

  it("AC-6: 「商船三井」で検索すると「株式会社　商船三井」が結果に含まれる", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35, { query: "商船三井" }));
    expect(ranked.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });

  it("検索はフィルタとANDで結合する（業種フィルタ単独より件数が減る）", () => {
    const industryOnly = buildRankedCompanies(companies, curves, stateFor(35, { industry: "海運業" }));
    const combined = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "海運業", query: "商船三井" })
    );
    expect(combined.totalCount).toBeLessThan(industryOnly.totalCount);
    expect(combined.companies.some((c) => c.name === "株式会社　商船三井")).toBe(true);
  });
});

describe("AC-12 並び替え", () => {
  it("既定は金額の降順（並び替えなし）", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(null));
    expect(ranked.map((c) => c.id)).toEqual(
      buildRankedCompanies(companies, curves, stateFor(null, { sort: "salary" })).companies.map(
        (c) => c.id
      )
    );
  });

  it("平均年齢が若い順に並ぶ", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: "age" })
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].avgAge).toBeGreaterThanOrEqual(ranked[i - 1].avgAge);
    }
  });

  it("従業員数が多い順に並ぶ", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: "employees" })
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].employees).toBeLessThanOrEqual(ranked[i - 1].employees);
    }
  });

  /*
   * spec 1.10 の要点。順位は「金額で何位か」を意味するので、並べ替えたら
   * 1から振り直す、という扱いにはしない。ここが崩れると順位が「表示順の番号」に
   * 化けて、ページをまたいだ順位が意味を持たなくなる。
   */
  it("並び替えても順位は金額基準のまま（1から振り直さない）", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: "age" })
    );
    expect(ranked.map((c) => c.rank)).not.toEqual(ranked.map((_, i) => i + 1));

    // 同じ会社の順位は、並びを変えても金額基準の順位と一致する。
    const bySalary = new Map(
      buildRankedCompanies(companies, curves, stateFor(null)).companies.map((c) => [c.id, c.rank])
    );
    for (const company of ranked) {
      const expected = bySalary.get(company.id);
      if (expected !== undefined) expect(company.rank).toBe(expected);
    }
  });

  it("並び替えは全件に対して効く（1ページ目を並べ替えるのではない）", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: "employees" })
    );
    // 従業員数の最大はトヨタ自動車（単体約7万人）。金額順の1ページ目には入らない。
    expect(ranked[0].employees).toBe(
      Math.max(...companies.rows.map((row) => row[7]))
    );
  });
});

describe("AC-13 年収バーの基準", () => {
  it("pageMaxSalary はそのページに出ている金額の最大値", () => {
    const result = buildRankedCompanies(companies, curves, stateFor(null));
    expect(result.pageMaxSalary).toBe(result.companies[0].avgSalary);
  });

  it("2ページ目では基準が取り直される", () => {
    const page1 = buildRankedCompanies(companies, curves, stateFor(null));
    const page2 = buildRankedCompanies(companies, curves, stateFor(null, { page: 2 }));
    expect(page2.pageMaxSalary).toBeLessThan(page1.pageMaxSalary);
    expect(page2.pageMaxSalary).toBe(page2.companies[0].avgSalary);
  });

  /*
   * 表示基準を切り替えると金額そのものが別の系列になる。片方の基準で両方を描くと、
   * 年齢そろえに切り替えたとき棒だけ元の縮尺で残る（最も気づきにくい壊れ方）。
   */
  it("表示基準ごとに基準が変わる", () => {
    const raw = buildRankedCompanies(companies, curves, stateFor(null));
    const at25 = buildRankedCompanies(companies, curves, stateFor(25));
    expect(at25.pageMaxSalary).not.toBe(raw.pageMaxSalary);
    expect(at25.pageMaxSalary).toBe(at25.companies[0].estimatedSalary);
  });

  it("並び替えても基準はそのページの最大のまま（先頭の行の金額とは限らない）", () => {
    const sorted = buildRankedCompanies(companies, curves, stateFor(null, { sort: "age" }));
    const max = Math.max(...sorted.companies.map((c) => c.avgSalary));
    expect(sorted.pageMaxSalary).toBe(max);
  });

  it("0件なら 0", () => {
    const empty = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { query: "存在しない社名" })
    );
    expect(empty.totalCount).toBe(0);
    expect(empty.pageMaxSalary).toBe(0);
  });
});

describe("AC-14 上位◯%の分母（populationRank）", () => {
  it("絞り込みが無ければ rank と一致する", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(null));
    for (const company of ranked) expect(company.populationRank).toBe(company.rank);
  });

  /*
   * 偏差値の隣に置く水準は母集団の中での位置でなければならない（glossary）。
   * 海運業7社の rank は1〜7で、これを分子にすると「上位14%」になってしまう。
   */
  it("絞り込むと rank は1から振り直され、populationRank は全体のまま", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { industry: "海運業" })
    );
    expect(totalCount).toBe(7);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ranked[0].populationRank).toBeGreaterThan(7);

    // 全体順位は絞り込んでも変わらない。
    const all = new Map(
      buildRankedCompanies(companies, curves, stateFor(null)).companies.map((c) => [
        c.id,
        c.populationRank,
      ])
    );
    for (const company of ranked) {
      const expected = all.get(company.id);
      if (expected !== undefined) expect(company.populationRank).toBe(expected);
    }
  });

  it("表示基準を変えると全体順位も変わる", () => {
    const raw = buildRankedCompanies(companies, curves, stateFor(null)).companies;
    const at25 = buildRankedCompanies(companies, curves, stateFor(25)).companies;
    expect(at25.map((c) => c.id)).not.toEqual(raw.map((c) => c.id));
    // 同じ順位に別の会社が入る＝母集団の中での位置が基準ごとに別物である。
    expect(at25[0].populationRank).toBe(1);
    expect(raw[0].populationRank).toBe(1);
  });
});
