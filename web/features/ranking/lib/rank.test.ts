import { describe, it, expect } from "vitest";
import { buildRankedCompanies, displaySalary } from "./rank";
import { curveValuesInYen } from "./curve";
import { estimateSalary } from "./salary";
import { companies, curves, industryOf, pickCompany, rowOf } from "@/testing/realData";
import { PAGE_SIZE } from "../types";
import type { CompanyRow, RankingState, SortSelection, TargetAge } from "../types";

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

/** 表示基準の金額（実測値なら有報のまま）。rank.ts を通さずに行から出す。 */
const salaryAt = (row: CompanyRow, targetAge: TargetAge | null) =>
  targetAge === null
    ? row[6]
    : estimateSalary(
        row[6],
        row[4],
        curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]),
        curves.agePoints,
        targetAge
      );

/*
 * `buildRankedCompanies` は1ページぶんしか返さないので、PAGE_SIZE より広い範囲を
 * 見るテストはページを継ぎ足して作る。
 */
const topN = (targetAge: TargetAge | null, n: number) => {
  const acc: ReturnType<typeof buildRankedCompanies>["companies"] = [];
  for (let page = 1; acc.length < n; page++) {
    acc.push(...rank(stateFor(targetAge, { page })).companies);
  }
  return acc.slice(0, n);
};

/** 全社の populationRank を ID で引く。全ページを継ぎ足すので、表示基準ごとに1回だけ作る。 */
const populationRankCache = new Map<TargetAge | null, Map<string, number>>();
const populationRanks = (targetAge: TargetAge | null) => {
  let ranks = populationRankCache.get(targetAge);
  if (ranks === undefined) {
    ranks = new Map(topN(targetAge, companies.rows.length).map((c) => [c.id, c.populationRank]));
    populationRankCache.set(targetAge, ranks);
  }
  return ranks;
};

describe("buildRankedCompanies", () => {
  // ADR-0007 で既定になった表示基準。補正を一切通さないので estimatedSalary は null。
  it("AC-1: 初期状態（実測値・絞り込みなし）で上位30件、1位は有報の平均年間給与が最も高い会社", () => {
    const { companies: ranked, totalCount } = rank(stateFor(null));
    expect(ranked).toHaveLength(PAGE_SIZE);
    expect(totalCount).toBe(companies.rows.length);
    // 同額が並んだときは `companies.rows` の順で先に来る（並べ替えが安定なため）。
    const top = companies.rows.reduce((best, row) => (row[6] > best[6] ? row : best));
    expect(ranked[0].id).toBe(top[0]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].avgSalary).toBe(top[6]);
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

    // 平均年齢が35歳より上で、35歳そろえにすると自分より金額の高い会社が増える会社は、
    // 実測値のほうが順位が高い。同額の会社がいても前後が決まるように、実測値で同額を
    // 含めて数えた社数が、35歳そろえで自分より高い会社の数を超えない会社を選ぶ。
    const raws = companies.rows.map((row) => salaryAt(row, null));
    const at35s = companies.rows.map((row) => salaryAt(row, 35));
    const id = pickCompany(
      "平均年齢が35歳より上で、実測値のほうが35歳そろえより順位が高い会社",
      (row, i) =>
        row[4] > 35 &&
        raws.filter((v) => v >= raws[i]).length <= at35s.filter((v) => v > at35s[i]).length
    );
    expect(populationRanks(null).get(id)).toBeLessThan(populationRanks(35).get(id)!);
  });

  // 年齢そろえの1位は、その年齢の推定年収が最も高い会社。平均年齢の若い会社ほど
  // 年齢そろえで上がるので、実測値の1位と同じとは限らない。
  it("AC-2前半: 35歳そろえで1位は、35歳時点の推定年収が最も高い会社", () => {
    const { companies: ranked } = rank(stateFor(35));
    const at35s = companies.rows.map((row) => salaryAt(row, 35));
    const max = Math.max(...at35s);
    expect(ranked[0].estimatedSalary).toBe(max);
    expect(ranked[0].id).toBe(companies.rows[at35s.indexOf(max)][0]);
  });

  /*
   * 「年齢スイッチで順位はほとんど動かない」の根拠（spec AC-2・`/about`）。同じ業種の
   * 2社は同じカーブを引くので、平均年齢も同じなら目標年齢を変えても同じ変換が掛かる
   * だけで、前後は入れ替わらない（2点モデル・ADR-0005。平均年齢が違えば入れ替わりうる）。
   * 上位50社の重なりの社数はデータで動くので、社数ではなくこの規則を全社で見る。
   */
  it("AC-2後半: 同じカーブで平均年齢も同じ会社どうしは、35歳と60歳で順位の前後が入れ替わらない", () => {
    const at35 = populationRanks(35);
    const at60 = populationRanks(60);
    const groups = new Map<string, string[]>();
    for (const row of companies.rows) {
      const key = `${row[3]}:${row[4]}`;
      groups.set(key, [...(groups.get(key) ?? []), row[0]]);
    }
    let pairs = 0;
    const swapped: string[] = [];
    for (const ids of groups.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          pairs++;
          const [a, b] = [ids[i], ids[j]];
          if (at35.get(a)! < at35.get(b)! !== at60.get(a)! < at60.get(b)!) {
            swapped.push(`${a}/${b}`);
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
    expect(swapped).toEqual([]);
  });

  it("pageで正しいオフセットが切り出される（2ページ目は31〜60位）", () => {
    const page1 = rank(stateFor(35, { page: 1 })).companies;
    const page2 = rank(stateFor(35, { page: 2 })).companies;
    expect(page2[0].rank).toBe(PAGE_SIZE + 1);
    expect(page2.map((c) => c.id)).not.toEqual(page1.map((c) => c.id));
  });

  it("総ページ数を超えるpageは最終ページにクランプする", () => {
    const total = companies.rows.length;
    const lastPage = Math.ceil(total / PAGE_SIZE);
    expect(lastPage).toBeLessThan(999);
    const ranked = rank(stateFor(35, { page: 999 }));
    expect(ranked.totalCount).toBe(total);
    expect(ranked.companies).toHaveLength(total - (lastPage - 1) * PAGE_SIZE);
    expect(ranked.companies[0].rank).toBe((lastPage - 1) * PAGE_SIZE + 1);
  });

  it("AC-8: 0件のとき totalCount は0で、companies も空・バーの基準も0になる", () => {
    const ranked = rank(stateFor(35, { industry: "鉱業", query: "存在しない社名" }));
    expect(ranked.totalCount).toBe(0);
    expect(ranked.companies).toHaveLength(0);
    expect(ranked.pageMaxSalary).toBe(0);
  });

  // 従業員数・平均年齢の区分と AND の結合は `filter.test.ts`（AC-4・AC-5）が持つ。
  // spec の例は「商船三井」で「株式会社　商船三井」。社名に全角スペースを含む会社を
  // データから選び、スペースを抜いた語で引く。
  it("AC-6: 検索は業種とANDで結合し、全角スペースを含む社名がスペースを抜いた語で引ける", () => {
    const id = pickCompany(
      "社名に全角スペースを含み、同じ業種にほかの会社もいる会社",
      (row) =>
        row[1].includes("　") &&
        companies.rows.some((other) => other[2] === row[2] && other[0] !== row[0])
    );
    const industry = industryOf(id);
    const query = rowOf(id)[1].split("　").join("");
    const industryOnly = rank(stateFor(35, { industry }));
    const combined = rank(stateFor(35, { industry, query }));
    expect(combined.totalCount).toBeLessThan(industryOnly.totalCount);
    expect(combined.companies.some((c) => c.id === id)).toBe(true);
  });
});

describe("AC-12 並び替え", () => {
  /*
   * 既定（年収が高い順）以外の5通り。**向きが効くのは全件に対してで、1ページ目の中では
   * ない**——先頭は、金額順の1ページ目に入らない会社であっても、母集団全体の端の会社と
   * 一致する。
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

    // 年収が低い順の1ページ目に並ぶのは最下位の30社。順位は最下位（掲載社数）から下る。
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
   * （glossary）。業種で絞った rank は1から振り直されるので、これを母集団の位置として
   * 使うと、業種の1位がどれも母集団の上位に見えてしまう。
   */
  it("AC-3: 海運業に絞ると rank は1から振り直され、populationRank は全体の順位のまま", () => {
    const count = companies.rows.filter((row) => companies.industries[row[2]] === "海運業").length;
    expect(count).toBeGreaterThan(0);
    const { companies: ranked, totalCount } = rank(stateFor(null, { industry: "海運業" }));
    expect(totalCount).toBe(count);
    expect(ranked.map((c) => c.rank)).toEqual(
      Array.from({ length: Math.min(count, PAGE_SIZE) }, (_, i) => i + 1)
    );

    // 全体順位は絞り込んでも変わらない。
    const all = populationRanks(null);
    for (const company of ranked) expect(company.populationRank).toBe(all.get(company.id));
  });
});
