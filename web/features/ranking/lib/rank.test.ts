import { describe, it, expect } from "vitest";
import { buildRankedCompanies } from "./rank";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import { PAGE_SIZE } from "../types";
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
    sort: { key: "salary", order: "desc" },
    page: 1,
    ...overrides,
  };
}

describe("buildRankedCompanies", () => {
  // ADR-0007 で既定になった表示基準。補正を一切通さないので estimatedSalary は null。
  it("AC-1: 初期状態（実測値・絞り込みなし）で上位30件、1位はヒューリックで有報のまま2,295万円", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null)
    );
    expect(ranked).toHaveLength(PAGE_SIZE);
    expect(totalCount).toBe(companies.rows.length);
    expect(ranked[0].name).toBe("ヒューリック株式会社");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].estimatedSalary).toBeNull();
    expect(Math.round(ranked[0].avgSalary / 10000)).toBe(2295);
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

  // **実測値と年齢そろえで1位が入れ替わる**（E2 で母集団を広げた後）。実測値は
  // ヒューリック（平均39.0歳・2,295万円）、35歳そろえは平均32.4歳のＭ＆Ａキャピタル
  // パートナーズが上に来る。キーエンスは平均年齢がちょうど35.0歳なので金額が動かない。
  it("AC-2前半: 35歳そろえで1位はＭ＆Ａキャピタルパートナーズの推定年収2,330万円", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35));
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
      acc.push(...buildRankedCompanies(companies, curves, stateFor(targetAge, { page })).companies);
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

  it("1ページの件数はPAGE_SIZE（30）で切り出される", () => {
    const { companies: ranked } = buildRankedCompanies(companies, curves, stateFor(35));
    expect(PAGE_SIZE).toBe(30);
    expect(ranked).toHaveLength(PAGE_SIZE);
  });

  it("pageで正しいオフセットが切り出される（2ページ目は31〜60位）", () => {
    const page1 = buildRankedCompanies(companies, curves, stateFor(35, { page: 1 })).companies;
    const page2 = buildRankedCompanies(companies, curves, stateFor(35, { page: 2 })).companies;
    expect(page2[0].rank).toBe(PAGE_SIZE + 1);
    expect(page2.map((c) => c.id)).not.toEqual(page1.map((c) => c.id));
  });

  it("総ページ数を超えるpageは最終ページにクランプする", () => {
    const ranked = buildRankedCompanies(companies, curves, stateFor(35, { industry: "海運業", page: 999 }));
    expect(ranked.totalCount).toBe(9);
    expect(ranked.companies).toHaveLength(9);
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

  it("AC-3: 業種で「海運業」を選ぶと9社になり、順位が1から振り直される", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { industry: "海運業" })
    );
    expect(totalCount).toBe(9);
    expect(ranked).toHaveLength(9);
    expect(ranked[0].rank).toBe(1);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("AC-4: 従業員数で「1,000人以上」を選ぶと803社になる", () => {
    const { totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { employeeSize: "1000plus" })
    );
    expect(totalCount).toBe(803);
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
      buildRankedCompanies(companies, curves, stateFor(null, { sort: { key: "salary", order: "desc" } })).companies.map(
        (c) => c.id
      )
    );
  });

  it("平均年齢が若い順に並ぶ", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "age", order: "asc" } })
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].avgAge).toBeGreaterThanOrEqual(ranked[i - 1].avgAge);
    }
  });

  it("従業員数が多い順に並ぶ", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "employees", order: "desc" } })
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
      stateFor(null, { sort: { key: "age", order: "asc" } })
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

  /*
   * 逆向き（Issue #106）。**向きが効くのは全件に対してで、1ページ目の中ではない。**
   * 逆向きの先頭は「絞り込んだ集団の下の端」なので、母集団の最小値と一致する。
   */
  it("年収が低い順の先頭は、実測値の最小の会社", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "salary", order: "asc" } })
    );
    expect(ranked[0].avgSalary).toBe(Math.min(...companies.rows.map((row) => row[6])));
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].avgSalary).toBeGreaterThanOrEqual(ranked[i - 1].avgSalary);
    }
  });

  it("平均年齢が高い順・従業員数が少ない順に並ぶ", () => {
    const byAge = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "age", order: "desc" } })
    ).companies;
    expect(byAge[0].avgAge).toBe(Math.max(...companies.rows.map((row) => row[4])));
    for (let i = 1; i < byAge.length; i++) {
      expect(byAge[i].avgAge).toBeLessThanOrEqual(byAge[i - 1].avgAge);
    }

    const byEmployees = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "employees", order: "asc" } })
    ).companies;
    expect(byEmployees[0].employees).toBe(Math.min(...companies.rows.map((row) => row[7])));
    for (let i = 1; i < byEmployees.length; i++) {
      expect(byEmployees[i].employees).toBeGreaterThanOrEqual(byEmployees[i - 1].employees);
    }
  });

  it("向きを反転しても順位は金額基準のまま（1から振り直さない）", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "salary", order: "asc" } })
    );
    // 年収が低い順の1ページ目に並ぶのは最下位の30社。順位は 2,961位 から下る。
    expect(ranked[0].rank).toBe(companies.meta.count);
    expect(ranked.map((c) => c.rank)).not.toEqual(ranked.map((_, i) => i + 1));
  });

  // 年齢そろえでは金額そのものが別の系列になる（ADR-0007）。向きも同じ系列で効くこと。
  it("年齢そろえでも低い順は推定年収の昇順", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(35, { sort: { key: "salary", order: "asc" } })
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].estimatedSalary!).toBeGreaterThanOrEqual(ranked[i - 1].estimatedSalary!);
    }
  });

  it("並び替えは全件に対して効く（1ページ目を並べ替えるのではない）", () => {
    const { companies: ranked } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { sort: { key: "employees", order: "desc" } })
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
    const sorted = buildRankedCompanies(companies, curves, stateFor(null, { sort: { key: "age", order: "asc" } }));
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
   * 海運業9社の rank は1〜9で、これを分子にすると「上位11%」になってしまう。
   */
  it("絞り込むと rank は1から振り直され、populationRank は全体のまま", () => {
    const { companies: ranked, totalCount } = buildRankedCompanies(
      companies,
      curves,
      stateFor(null, { industry: "海運業" })
    );
    expect(totalCount).toBe(9);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ranked[0].populationRank).toBeGreaterThan(9);

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
