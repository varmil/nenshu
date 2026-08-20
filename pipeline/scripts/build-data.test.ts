import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildData } from "./build-data";
import { interpolate } from "./lib/curve";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { parseUnifiedCsv, type UnifiedRow } from "./lib/csv";
import { makeId } from "./lib/slug";

const ROOT = join(__dirname, "..");

describe("buildData", () => {
  let outDir: string;
  let result: ReturnType<typeof buildData>;
  let sourceRows: UnifiedRow[];

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "nenshu-build-data-"));
    result = buildData(outDir);
    sourceRows = parseUnifiedCsv(
      readFileSync(join(ROOT, "data/ranking_unified_2026.csv"), "utf-8")
    );
    return () => rmSync(outDir, { recursive: true, force: true });
  });

  it("companies.json が1,867行を持つ", () => {
    expect(result.companies.rows.length).toBe(1867);
  });

  // **Python（`pipeline/salary35/curves.py`）と TypeScript（`web/.../salary.ts`）の
  // 実装が一致していることの検証。** CSVの `salary35` 列は Python が
  // `curves.estimate_salary`（ADR-0005の2点モデル）で計算した値で、ここでは
  // **サイトが実際に使っている `estimateSalary` をそのまま呼んで**突き合わせる。
  // 式を書き写すと web 側の変更を取り逃すので、実物を import する。
  //
  // 丸めにも注意が要る。Python の組み込み round() は偶数丸めで JavaScript の
  // Math.round と違うため、Python 側は floor(x + 0.5) を使っている。
  it("2点モデル（ADR-0005）で再計算した35歳時点の推定年収がCSVのsalary35と全1,867社で一致する", () => {
    const { agePoints, curves } = result.curves;
    const mismatches: string[] = [];

    for (const row of sourceRows) {
      // カーブは千円単位。給与と足し引きするので円に揃える（ADR-0005）。
      const series = curveValuesInYen(curves[row.industry]);
      const recomputed = estimateSalary(row.avgSalary, row.avgAge, series, agePoints, 35);
      if (recomputed !== row.salary35) {
        mismatches.push(`${row.name}: recomputed=${recomputed} csv=${row.salary35}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("id が1,867件すべて一意", () => {
    const ids = result.companies.rows.map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ここから4件は公開URL `/company/[id]` の安定性を固定する（ADR-0006）。
  // 書類ID由来のIDは毎年の有報提出で変わるため、一度公開したURLが年1回
  // リセットされてしまう。証券コード／EDINETコードはどちらも年をまたいで変わらない。
  it("証券コードを持つ会社の id は証券コードそのもの", () => {
    const withSecCode = sourceRows.filter((r) => r.secCode !== "");
    expect(withSecCode.length).toBe(1760);
    for (const row of withSecCode) {
      expect(makeId(row)).toBe(row.secCode);
    }
  });

  it("証券コードを持たない107社の id はEDINETコード（E＋5桁）", () => {
    const withoutSecCode = sourceRows.filter((r) => r.secCode === "");
    expect(withoutSecCode.length).toBe(107);
    for (const row of withoutSecCode) {
      expect(makeId(row)).toMatch(/^E\d{5}$/);
    }
  });

  it("書類ID由来の id が1件も残っていない", () => {
    // 旧 makeId が作っていた形（社名のASCII部分＋小文字化した書類ID）。
    // 例: みずほ銀行の `s100yfah`、JERA の `jera-s100ycjz`。
    const docIdShaped = result.companies.rows
      .map((r) => r[0])
      .filter((id) => /s1\d{2}[0-9a-z]{4}$/.test(id));
    expect(docIdShaped).toEqual([]);
  });

  it("代表的な会社の id が固定されている", () => {
    const idOf = (name: string) => {
      const row = result.companies.rows.find((r) => r[1] === name);
      if (row === undefined) throw new Error(`${name} が見つからない`);
      return row[0];
    };
    expect(idOf("株式会社キーエンス")).toBe("6861");
    expect(idOf("三菱商事株式会社")).toBe("8058");
    expect(idOf("トヨタ自動車株式会社")).toBe("7203");
    // 非上場。旧IDは書類ID由来の `s100yfah` だった。
    expect(idOf("株式会社みずほ銀行")).toBe("E03532");
  });

  it("makeId は証券コードもEDINETコードも無ければ例外を投げる", () => {
    expect(() => makeId({ secCode: "", edinetCode: "", name: "架空株式会社" })).toThrow(
      /架空株式会社/
    );
  });

  // stats.json は企業詳細ページ（`/company/[id]`）が使う母集団統計。順位を
  // リクエストごとに計算しないための事前計算で、companies.json と行の並びが
  // 一致していることが正しさの前提になる。
  it("stats.json が9表示基準（実測値＋8年齢） × 1,867社ぶんの順位を持つ", () => {
    const { bases, count, rankAll, rankIndustry, population, industryCounts } = result.stats;
    // 先頭の null が実測値。ADR-0007。
    expect(bases).toEqual([null, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(count).toBe(1867);
    expect(rankAll.length).toBe(1867);
    expect(rankIndustry.length).toBe(1867);
    expect(population.length).toBe(9);
    expect(industryCounts.length).toBe(result.companies.industries.length);
    expect(industryCounts.reduce((a, b) => a + b, 0)).toBe(1867);
    for (const row of rankAll) expect(row.length).toBe(9);
    for (const row of rankIndustry) expect(row.length).toBe(9);
  });

  it("stats.json の順位が各表示基準の金額の降順と一致する", () => {
    const { agePoints, curves } = result.curves;
    const { bases, rankAll, rankIndustry, industryCounts } = result.stats;
    const rows = result.companies.rows;

    for (let k = 0; k < bases.length; k++) {
      const basis = bases[k];
      // 実測値の列は補正を通さず avgSalary そのもの。
      const estimates = rows.map((row) =>
        basis === null
          ? row[6]
          : estimateSalary(
              row[6],
              row[4],
              curveValuesInYen(curves[result.companies.curveKeys[row[3]]]),
              agePoints,
              basis
            )
      );
      for (let i = 0; i < rows.length; i++) {
        // 同額は同順位（自分より高い会社の数 ＋ 1）。
        const higher = estimates.filter((e) => e > estimates[i]).length;
        expect(rankAll[i][k]).toBe(higher + 1);

        const higherInIndustry = rows.filter(
          (row, j) => row[2] === rows[i][2] && estimates[j] > estimates[i]
        ).length;
        expect(rankIndustry[i][k]).toBe(higherInIndustry + 1);
        expect(rankIndustry[i][k]).toBeLessThanOrEqual(industryCounts[rows[i][2]]);
      }
    }
  });

  it("stats.json の母集団統計が実データと一致する", () => {
    const { agePoints, curves } = result.curves;
    const rows = result.companies.rows;
    const estimates = rows.map((row) =>
      estimateSalary(
        row[6],
        row[4],
        curveValuesInYen(curves[result.companies.curveKeys[row[3]]]),
        agePoints,
        35
      )
    );
    const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
    // 母標準偏差（n で割る）。対象は掲載している1,867社そのもの。
    const sd = Math.sqrt(
      estimates.reduce((s, x) => s + (x - mean) ** 2, 0) / estimates.length
    );
    const at35 = result.stats.population[result.stats.bases.indexOf(35)];
    expect(at35.mean).toBe(Math.round(mean));
    expect(at35.sd).toBe(Math.round(sd));
  });

  // 実測値（ADR-0007 で既定になった表示基準）の母集団統計。年齢そろえのそれとは
  // 別の分布なので、平均も標準偏差も別の値になる。
  it("stats.json の実測値の母集団統計が有報の平均年間給与そのものと一致する", () => {
    const rows = result.companies.rows;
    const values = rows.map((row) => row[6]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length);

    const raw = result.stats.population[0];
    expect(result.stats.bases[0]).toBeNull();
    expect(raw.mean).toBe(Math.round(mean));
    expect(raw.sd).toBe(Math.round(sd));
  });

  it("stats.json の実測値の全体1位が有報の平均年間給与が最も高い会社になる", () => {
    const rows = result.companies.rows;
    const topIndex = rows.reduce((best, row, i) => (row[6] > rows[best][6] ? i : best), 0);
    expect(result.stats.rankAll[topIndex][0]).toBe(1);
    expect(rows[topIndex][1]).toBe("株式会社キーエンス");
  });

  it("補間は代表年齢の範囲外で端の値に頭打ちになる", () => {
    const points = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67];
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(interpolate(points, values, 18)).toBe(100);
    expect(interpolate(points, values, 70)).toBe(1000);
    expect(interpolate(points, values, 29.5)).toBeCloseTo(250, 5);
  });

  it("companies.json のgzip後サイズが100KB以内", () => {
    const bytes = readFileSync(result.companiesPath);
    const gzipped = gzipSync(bytes);
    expect(gzipped.length).toBeLessThanOrEqual(100 * 1024);
  });

  it("industries（表示用tse33）とcurveKeys（内部の産業大分類）が独立した配列で、行はそれぞれ別のインデックスを持つ", () => {
    // 「建設業」のように tse33 と産業大分類の名称が偶然一致するものがあるため、
    // 値の非重複ではなく構造（別配列・別インデックス列）で分離を確認する。
    const { industries, curveKeys, rows } = result.companies;
    expect(industries).not.toBe(curveKeys);
    for (const row of rows) {
      const [, , tse33Idx, curveIdx] = row;
      expect(industries[tse33Idx]).toBeDefined();
      expect(curveKeys[curveIdx]).toBeDefined();
    }
  });

  // history.json は企業詳細ページの「平均年収推移（過去10年間）」が読む
  // （T0・`docs/timeseries/spec.md` 1.4）。/ は読まない（Issue #22）。
  it("AC-2: history.json が10年ぶんで、各社の配列長が years と揃っている", () => {
    const { years, byId } = result.history;
    expect(years).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);

    const ids = Object.keys(byId);
    expect(ids.length).toBeGreaterThanOrEqual(1850);
    for (const id of ids) {
      expect(byId[id].length).toBe(years.length);
    }
  });

  it("AC-2: 年ごとの社数が下限を満たす", () => {
    const { years, byId } = result.history;
    const countFor = (year: number) => {
      const k = years.indexOf(year);
      return Object.values(byId).filter((v) => v[k] !== null).length;
    };
    expect(countFor(2026)).toBeGreaterThanOrEqual(1850);
    expect(countFor(2017)).toBeGreaterThanOrEqual(1600);
  });

  // 同じ有報から取った同じ数字なので、ここがずれていたら抽出が壊れている。
  it("AC-3: history.json の2026年が companies.json の平均年収と全社で一致する", () => {
    const { years, byId } = result.history;
    const k = years.indexOf(2026);
    const rows = result.companies.rows;

    // 2026年は全社ぶん揃っていなければならない（同じ有報・同じ抽出関数なので、
    // 1社でも欠けるか値がずれたら抽出が壊れている）。
    for (const row of rows) {
      const values = byId[row[0]];
      expect(values).toBeDefined();
      expect(values[k]).toBe(row[6]);
    }
    expect(rows.length).toBe(1867);
  });

  // 誤読はたいてい隣の年から浮く。桁の切り方を間違えると10倍・4倍に飛ぶ。
  it("AC-2: 隣接する年で極端に動く組が 0.1% 未満", () => {
    const { byId } = result.history;
    let pairs = 0;
    const jumps: string[] = [];
    for (const [id, values] of Object.entries(byId)) {
      for (let i = 1; i < values.length; i++) {
        const a = values[i - 1];
        const b = values[i];
        if (a === null || b === null) continue;
        pairs++;
        if (b / a > 1.8 || b / a < 0.55) jumps.push(`${id}:${a}→${b}`);
      }
    }
    expect(pairs).toBeGreaterThan(15000);
    expect(jumps.length / pairs).toBeLessThan(0.001);
  });

  it("AC-4: 欠けている年は null で、内挿されていない", () => {
    const { byId } = result.history;
    const withGap = Object.values(byId).filter((v) => v.some((x) => x === null));
    // 古い年ほど欠ける（上場が新しい会社など）。欠けが1社も無いのは抽出の取りこぼし。
    expect(withGap.length).toBeGreaterThan(0);

    // null を残していることの確認。内挿していれば null は消えている。
    for (const values of withGap) {
      expect(values.some((x) => x === null)).toBe(true);
    }
  });

  it("AC-4: 全年が null の会社は載せない", () => {
    for (const values of Object.values(result.history.byId)) {
      expect(values.some((x) => x !== null)).toBe(true);
    }
  });

  it("AC-5: history.json のgzip後サイズが150KB以内", () => {
    expect(result.historyGzipSize).toBeLessThanOrEqual(150 * 1024);
  });
});
