import { describe, it, expect } from "vitest";
import { buildSearchParams, parseSearchParams, rankingHref, INITIAL_STATE } from "./urlState";
import type { RankingState } from "../types";

function stateFor(overrides: Partial<RankingState>): RankingState {
  return { ...INITIAL_STATE, ...overrides };
}

const parse = (query: string) => parseSearchParams(new URLSearchParams(query));

describe("parseSearchParams", () => {
  /*
   * 読めるものは読み、URL に無いものは返さない（呼び出し側が INITIAL_STATE に重ねる）。
   * 並び替えは**軸だけのURLなら3軸とも降順**（既定の向き。U15 の直後に揃えた）で、
   * 書き出さない綴りの `-desc` も読めば通る——既定を降順に揃える前に配った
   * `?sort=age-desc` が既定の並びに倒れないため。
   */
  it.each<[string, Partial<RankingState>]>([
    // AC-7
    ["age=45&ind=銀行業", { targetAge: 45, industry: "銀行業" }],
    [
      "emp=1000-&ten=-13&aage=40-43",
      { employeeSize: "1000plus", tenure: "under13", avgAgeBucket: "40to43" },
    ],
    ["q=商船", { query: "商船" }],
    ["page=2", { page: 2 }],
    ["sort=salary", { sort: { key: "salary", order: "desc" } }],
    ["sort=age", { sort: { key: "age", order: "desc" } }],
    ["sort=emp", { sort: { key: "employees", order: "desc" } }],
    ["sort=age-desc", { sort: { key: "age", order: "desc" } }],
    ["sort=emp-asc", { sort: { key: "employees", order: "asc" } }],
    ["sort=salary-asc", { sort: { key: "salary", order: "asc" } }],
    ["", {}],
  ])("「%s」を復元する", (query, expected) => {
    expect(parse(query)).toEqual(expected);
  });

  /*
   * 不正・未知の値は無視して既定に倒す（エラー画面は出さない）。`age` が読めなければ
   * 実測値になる（ADR-0007）。並び替えは向きだけが読めないときも軸ごと捨てる。
   */
  it.each([
    "age=33",
    "age=abc",
    "age=999",
    "emp=abc&ten=xyz&aage=?",
    "page=0",
    "page=-1",
    "page=abc",
    "page=1.5",
    "sort=zzz",
    "sort=age-zzz",
    "sort=zzz-asc",
    "sort=age-",
  ])("不正な「%s」は無視する", (query) => {
    expect(parse(query)).toEqual({});
  });

  // ADR-0007: `age` の有無そのものが表示基準を表す。
  it("ageが無いURLは実測値（targetAge=null）になる", () => {
    expect(INITIAL_STATE.targetAge).toBeNull();
    expect(stateFor(parse("ind=銀行業")).targetAge).toBeNull();
  });
});

describe("buildSearchParams", () => {
  it("初期値と同じ項目はクエリに出さない（実測値・年収が高い順・1ページ目）", () => {
    expect(buildSearchParams(INITIAL_STATE).toString()).toBe("");
    expect(
      buildSearchParams(stateFor({ sort: { key: "salary", order: "desc" }, page: 1 })).toString()
    ).toBe("");
  });

  // ADR-0007: 35歳を既定として省いていた頃と違い、年齢そろえなら35歳でも出す。
  // 省くと実測値のURLと区別が付かなくなる。
  it("年齢そろえの35歳は age=35 を出す", () => {
    expect(buildSearchParams(stateFor({ targetAge: 35 })).toString()).toBe("age=35");
  });

  /*
   * 並びは age → ind → emp → ten → aage → q → sort → page に固定（カノニカル化）。
   * フィルタを適用した順序に関係なく同じ絞り込みなら同じ文字列になる。
   * **正規形の文字列を parse → build して同じ文字列に戻る**ことで、読み書きの対応と
   * 並びの両方を固定する。並び替えは既定の向きなら軸だけ、逆向きなら `-asc` を足す
   * （3軸とも既定が降順なので、書き出す綴りに `-desc` は現れない）。
   */
  it.each([
    // 全項目。バケット系は範囲表記。
    "age=45&ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&emp=300-1000&ten=17-&aage=43-&q=%E5%95%86%E8%88%B9&page=3",
    // 実測値（age なし）
    "ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&emp=1000-&q=%E4%B8%89%E4%BA%95&page=2",
    "emp=-300&ten=-13&aage=-40",
    "sort=age",
    "sort=emp",
    "sort=age-asc",
    "sort=salary-asc",
    "sort=emp-asc",
    // sort は q の後、page の前
    "age=35&ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&sort=age&page=2",
  ])("正規形「%s」は往復して同じ文字列に戻る", (query) => {
    expect(buildSearchParams(stateFor(parse(query))).toString()).toBe(query);
  });

  it("オブジェクトの鍵の順序によらず同じ並びで出す", () => {
    const a = stateFor({ industry: "銀行業", employeeSize: "1000plus", query: "三井" });
    const b: RankingState = {
      ...INITIAL_STATE,
      query: "三井",
      employeeSize: "1000plus",
      industry: "銀行業",
    };
    expect(buildSearchParams(b).toString()).toBe(buildSearchParams(a).toString());
  });
});

/*
 * 全社ぶんのデータが届く前の操作は実ナビゲーションに倒れる（E0・#174・ADR-0013）。
 * その行き先を作るのが `rankingHref` で、**倒れた先が同じ state に戻らないと、
 * 押した絞り込みが効いていない画面が返る。**
 */
describe("rankingHref", () => {
  it("既定の状態は `/`（`/?` にしない）", () => {
    expect(rankingHref(INITIAL_STATE)).toBe("/");
  });

  it("state が付けばクエリ付きになる", () => {
    expect(rankingHref(stateFor({ targetAge: 35 }))).toBe("/?age=35");
    expect(rankingHref(stateFor({ page: 2 }))).toBe("/?page=2");
  });

  /*
   * 実ナビゲーションの行き先は、サーバーが同じ画面を返せるURLでなければならない
   * （`/` はどのURLでも正しく SSR できる・ADR-0004）。往復で state が戻ることで
   * それを固定する。
   */
  it.each([
    { targetAge: 30 as const, industry: "銀行業" },
    { query: "トヨタ", page: 3 },
    { sort: { key: "age", order: "asc" } as RankingState["sort"] },
  ])("往復して同じ state に戻る（%o）", (overrides) => {
    const state = stateFor(overrides);
    const href = rankingHref(state);
    const search = href.startsWith("/?") ? href.slice(2) : "";
    expect(stateFor(parse(search))).toEqual(state);
  });
});
