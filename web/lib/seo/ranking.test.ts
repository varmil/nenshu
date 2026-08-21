import { describe, expect, it } from "vitest";
import type { CompaniesData } from "@/features/ranking/types";
import { agePath, industryPath, rankingCanonical, rankingMetadata } from "./ranking";

const INDUSTRIES = ["銀行業", "電気機器", "海運業"];

const companies = {
  meta: { version: "test", count: 1867, generatedAt: "2026-08-20T06:22:46.573Z" },
  industries: INDUSTRIES,
  curveKeys: [],
  rows: [],
} as unknown as CompaniesData;

const COUNT_BY_INDUSTRY: Record<string, number> = {
  銀行業: 82,
  電気機器: 150,
  海運業: 7,
};
const count = (industry: string) => COUNT_BY_INDUSTRY[industry] ?? 0;

function canonicalOf(query: string): string {
  return rankingCanonical(new URLSearchParams(query), companies, count).path;
}

describe("rankingCanonical — ADR-0006 のインデックス戦略", () => {
  it("フィルタ無しは `/`", () => {
    expect(canonicalOf("")).toBe("/");
  });

  it("`?age=N` は自己canonical（8件）", () => {
    expect(canonicalOf("age=25")).toBe("/?age=25");
    expect(canonicalOf("age=60")).toBe("/?age=60");
  });

  it("`?ind=X` は自己canonical。業種名はパーセントエンコードする", () => {
    expect(canonicalOf("ind=銀行業")).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD");
  });

  it("`?age=N&ind=X` は業種側へ寄せる（U8 で決め直し。ADR-0006 追記）", () => {
    // 業種は行の部分集合を決めるので `/?ind=X` と同じ会社が並ぶ。一方 `/?age=N` は
    // 1,867社の別ページで、重複しているのは業種側である。
    expect(canonicalOf("age=35&ind=銀行業")).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD");
  });

  it("emp・ten・aage・q・sort が効いていれば `/` へ寄せる", () => {
    expect(canonicalOf("emp=1000-")).toBe("/");
    expect(canonicalOf("ten=13-17")).toBe("/");
    expect(canonicalOf("aage=-40")).toBe("/");
    expect(canonicalOf("q=キーエンス")).toBe("/");
    expect(canonicalOf("sort=age")).toBe("/");
    // 年齢・業種と組み合わさっても寄せ先は `/`（インデックス対象は41件だけ）。
    expect(canonicalOf("age=35&ind=銀行業&emp=1000-")).toBe("/");
    // ページ送りも一緒に落ちる。
    expect(canonicalOf("emp=1000-&page=2")).toBe("/");
    expect(canonicalOf("q=銀行&page=3")).toBe("/");
  });

  it("既定値と同じクエリは「効いていない」とみなす", () => {
    expect(canonicalOf("page=1")).toBe("/");
    expect(canonicalOf("sort=salary")).toBe("/");
    expect(canonicalOf("q=")).toBe("/");
    expect(canonicalOf("age=35&page=1")).toBe("/?age=35");
  });

  it("不正な値は寄せる判断に使わない", () => {
    // parseSearchParams が既定値に倒すので、URLとしては `/` と同じページになる。
    expect(canonicalOf("age=33")).toBe("/");
    expect(canonicalOf("age=abc")).toBe("/");
    expect(canonicalOf("emp=xyz")).toBe("/");
    expect(canonicalOf("page=0")).toBe("/");
  });

  it("33件のリストに無い業種名は `/` へ寄せる（0件のページを正規URLにしない）", () => {
    expect(canonicalOf("ind=存在しない業種")).toBe("/");
    expect(canonicalOf("age=35&ind=存在しない業種")).toBe("/?age=35");
  });
});

describe("rankingCanonical — ページ送り", () => {
  // `/?page=2` は `/` の複製ではなく別の30社が並ぶ。先頭ページへ寄せると、
  // 1,837社への内部リンク経路（ページ2〜63の中にしか無い）を細める。
  it("ページ2以降は自己canonical にする", () => {
    expect(canonicalOf("page=2")).toBe("/?page=2");
    expect(canonicalOf("page=63")).toBe("/?page=63");
  });

  it("インデックス対象のファセットにはページを付けたまま寄せる", () => {
    expect(canonicalOf("age=35&page=2")).toBe("/?age=35&page=2");
    expect(canonicalOf("ind=銀行業&page=2")).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&page=2");
    // 年齢と業種の組み合わせは業種側へ。ページはそのまま乗せる。
    expect(canonicalOf("age=35&ind=銀行業&page=2")).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&page=2");
  });

  it("`buildSearchParams` と同じ並び（page が最後）になっている", () => {
    // ランキング側が作るURLと canonical の文字列が食い違わないため。
    expect(canonicalOf("page=2&age=35")).toBe("/?age=35&page=2");
  });

  it("総ページ数を超える page は落とす", () => {
    // 1,867社 / 30件 = 63ページ。`?page=999` は最終ページと同じ7社を200で返すので、
    // 自己canonical にすると実在しないURLを正規URLとして申告することになる。
    expect(canonicalOf("page=64")).toBe("/");
    expect(canonicalOf("page=999")).toBe("/");
    // 業種で絞ると総ページ数が減る。銀行業82社なら3ページまで。
    expect(canonicalOf("ind=銀行業&page=3")).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&page=3");
    expect(canonicalOf("ind=銀行業&page=4")).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD");
    // 年齢は金額を書き換えるだけで行は減らないので、総ページ数は全体と同じ。
    expect(canonicalOf("age=35&page=63")).toBe("/?age=35&page=63");
    expect(canonicalOf("age=35&page=64")).toBe("/?age=35");
  });

  it("0・負数・不正値は1ページ目に倒す", () => {
    expect(canonicalOf("page=0")).toBe("/");
    expect(canonicalOf("page=-3")).toBe("/");
    expect(canonicalOf("page=abc")).toBe("/");
  });
});

describe("agePath / industryPath", () => {
  it("sitemap と canonical が同じ関数を通るので文字列が一致する", () => {
    expect(agePath(35)).toBe("/?age=35");
    expect(industryPath("電気機器")).toBe("/?ind=%E9%9B%BB%E6%B0%97%E6%A9%9F%E5%99%A8");
  });
});

describe("rankingMetadata", () => {
  it("`/` はブランド先頭で、社数はデータから引く", () => {
    const meta = rankingMetadata(new URLSearchParams(""), companies, count);
    expect(meta.alternates?.canonical).toBe("/");
    // 社数を直書きしない。年1回のデータ更新でタイトルだけ古い数字になるのを防ぐ。
    expect(meta.title).toBe("OpenReport | 有価証券報告書ベースの平均年収ランキング 1,867社");
    expect(meta.description).toContain("1,867社");
    // 既定は実測値なので推定の語を出さない（AC-9）。
    expect(meta.description).not.toContain("推定年収のランキング");
  });

  it("有価証券報告書は全ページの description に入る", () => {
    for (const query of ["", "age=35", "ind=銀行業", "emp=1000-", "q=キーエンス"]) {
      const meta = rankingMetadata(new URLSearchParams(query), companies, count);
      // `/` へ寄るURLは `/` の description を返すので、どの入力でも必ず入っている。
      expect(meta.description, query).toContain("有価証券報告書");
    }
  });

  it("タイトルに有価証券報告書を入れるのは `/` だけ", () => {
    // 8件・33件のファセットページは「◯歳」「業種名」に文字数を使う。
    expect(rankingMetadata(new URLSearchParams("age=35"), companies, count).title).not.toContain(
      "有価証券報告書"
    );
    expect(rankingMetadata(new URLSearchParams("ind=銀行業"), companies, count).title).not.toContain(
      "有価証券報告書"
    );
  });

  it("年齢そろえの description には推定であることを書く（AC-9）", () => {
    const meta = rankingMetadata(new URLSearchParams("age=35"), companies, count);
    expect(meta.title).toBe("35歳年収ランキング | OpenReport");
    expect(meta.description).toContain("推定");
  });

  it("業種ページは実測値なので推定の語を出さない（AC-9）", () => {
    const meta = rankingMetadata(new URLSearchParams("ind=銀行業"), companies, count);
    expect(meta.title).toBe("銀行業の平均年収ランキング | OpenReport");
    expect(meta.description).toContain("82社");
    expect(meta.description).not.toContain("推定");
  });

  it("ページ2以降は title にページ番号を足す", () => {
    // 63枚が同一タイトルだと Search Console の重複タイトル警告に埋もれる。
    expect(rankingMetadata(new URLSearchParams("page=3"), companies, count).title).toBe(
      "OpenReport | 有価証券報告書ベースの平均年収ランキング（3ページ目）"
    );
    expect(rankingMetadata(new URLSearchParams("age=35&page=2"), companies, count).title).toBe(
      "35歳年収ランキング（2ページ目） | OpenReport"
    );
    expect(rankingMetadata(new URLSearchParams("ind=銀行業&page=2"), companies, count).title).toBe(
      "銀行業の平均年収ランキング（2ページ目） | OpenReport"
    );
  });

  it("寄せ先の title を返す。非正規URLに固有の title を作らない", () => {
    const meta = rankingMetadata(new URLSearchParams("age=35&ind=銀行業"), companies, count);
    expect(meta.alternates?.canonical).toBe("/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD");
    expect(meta.title).toBe("銀行業の平均年収ランキング | OpenReport");
  });
});
