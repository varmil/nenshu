import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildData, dominantFiscalPeriod, pickPopulation } from "./build-data";
import { interpolate } from "./lib/curve";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { parseUnifiedCsv, type UnifiedRow } from "./lib/csv";
import { makeId } from "./lib/slug";
import { parseCsv } from "../worklife/csv";
import { decodeRow, type WorklifeRow } from "../worklife/json";

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

  // S3（Issue #134、`docs/site-chrome/spec.md` 5.）。決算期は画面と title・description の
  // 何箇所にも出るので、CSV から導いて `meta` に載せる。ここが崩れると全ページの
  // 「いつのデータか」が一斉に嘘になる。
  it("meta に決算期が入る。値は CSV の period_end の最頻", () => {
    expect(result.companies.meta.fiscalPeriod).toBe("2026-03");

    const counts = new Map<string, number>();
    for (const row of sourceRows) {
      const period = row.periodEnd.slice(0, 7);
      counts.set(period, (counts.get(period) ?? 0) + 1);
    }
    // 1つで代表できることの実測。3月期が1,865社、4月期が2社（ヤガミ・ダイサン）。
    expect(counts.get("2026-03")).toBe(1865);
    expect(counts.get("2026-04")).toBe(2);
  });

  // **Python（`pipeline/salary/curves.py`）と TypeScript（`web/.../salary.ts`）の
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

  /*
   * 分布（C2・`docs/company/spec.md` 1.13）。**階級は表示基準ごとに違う**——
   * 25歳そろえは 249〜788万円、実測値は 332〜2,178万円で、同じ区切りを当てると
   * 片方は9ビンのうち7つが空になる。
   */
  it("stats.json の分布が9ビンで、合計が母集団の社数になる", () => {
    expect(result.stats.distribution).toHaveLength(result.stats.bases.length);
    for (const d of result.stats.distribution) {
      expect(d.counts).toHaveLength(9);
      expect(d.counts.reduce((a, b) => a + b, 0)).toBe(result.stats.count);
      expect(d.width).toBeGreaterThan(0);
    }
  });

  it("stats.json の実測値の中位が有報の平均年間給与の中央値と一致する", () => {
    const values = result.companies.rows.map((row) => row[6] as number).sort((a, b) => a - b);
    expect(result.stats.distribution[0].median).toBe(values[Math.floor(values.length / 2)]);
  });

  it("stats.json の階級幅が表示基準ごとに選び直される", () => {
    const raw = result.stats.distribution[0];
    const at25 = result.stats.distribution[result.stats.bases.indexOf(25)];
    expect(at25.width).toBeLessThan(raw.width);
  });

  // 両端のビンは外側を吸収する。中の7ビンだけで母集団を覆えている必要はない。
  it("stats.json の分布は真ん中のビンに偏りすぎない", () => {
    for (const d of result.stats.distribution) {
      const nonEmpty = d.counts.filter((n) => n > 0).length;
      expect(nonEmpty).toBeGreaterThanOrEqual(7);
    }
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

  /**
   * 働きやすさ指標（W0・Issue #149）。**行の並びが `companies.rows` と一致すること**が
   * ここでいちばん大事な検証になる——ずれると別の会社の残業時間を出す。
   */
  describe("worklife.json", () => {
    it("行の並びが companies.rows と一致する（ずれると別の会社の数字を出す）", () => {
      expect(result.worklife.rows).toHaveLength(result.companies.rows.length);
      expect(result.worklife.notes).toHaveLength(result.companies.rows.length);

      const idIndex = new Map(result.companies.rows.map((row, i) => [String(row[0]), i]));
      const csv = parseCsv(readFileSync(join(ROOT, "data/worklife_2026.csv"), "utf-8"));
      const header = csv[0];
      for (const line of csv.slice(1)) {
        const cells: Record<string, string> = {};
        header.forEach((name, i) => (cells[name] = line[i] ?? ""));
        const i = idIndex.get(cells.id);
        expect(i, `${cells.id} が companies に無い`).toBeDefined();
        const decoded = decodeRow(result.worklife.rows[i!] as WorklifeRow, result.worklife.pool);
        expect(decoded.overtimeAll).toBe(cells.overtime_all === "" ? null : Number(cells.overtime_all));
        expect(decoded.asOf).toBe(cells.as_of);
      }
    });

    it("突合できなかった会社には 0 が入る（欠測を数値の 0 と混ぜない）", () => {
      const idIndex = new Map(result.companies.rows.map((row, i) => [String(row[0]), i]));
      // 8306（三菱UFJフィナンシャル・グループ）は持株会社なので突合できない（ADR-0009）
      const i = idIndex.get("8306")!;
      expect(result.worklife.rows[i]).toBe(0);
      expect(result.worklife.notes[i]).toBe(0);
    });

    it("突合できた会社数が CSV の行数と一致する", () => {
      const csv = parseCsv(readFileSync(join(ROOT, "data/worklife_2026.csv"), "utf-8"));
      expect(result.worklife.meta.matched).toBe(csv.length - 1);
      expect(result.worklife.meta.matched).toBe(1548);
    });

    it("トヨタ自動車の値が読み戻せる", () => {
      const i = result.companies.rows.findIndex((row) => row[0] === "7203");
      const d = decodeRow(result.worklife.rows[i] as WorklifeRow, result.worklife.pool);
      expect(d.overtimeAll).toBe(20.3);
      expect(d.overtimeScope).toBe("対象正社員");
      expect(d.wageGapAll).toBe(67);
      expect(d.wageGapRegular).toBe(66.8);
      expect(d.wageGapNonRegular).toBe(59.7);
      expect(d.asOf).toBe("2026年3月時点");
      expect(result.worklife.notes[i]).toContain("計算の前提");
    });

    it("雇用管理区分が畳まれずに読み戻せる（三菱商事）", () => {
      const i = result.companies.rows.findIndex((row) => row[0] === "8058");
      const d = decodeRow(result.worklife.rows[i] as WorklifeRow, result.worklife.pool);
      expect(d.overtimeAll).toBe(10.5);
      // 総合職と派遣社員を平均した値には意味がない。4区分をそのまま持つ
      expect(d.overtimeUnits).toEqual([
        { unit: "総合職", value: 14.1 },
        { unit: "一般職", value: 3.3 },
        { unit: "嘱託その他", value: 3.2 },
        { unit: "派遣社員", value: 5.6 },
      ]);
    });

    it("区分を持たない会社は対のぶんだけ要素が増えない", () => {
      const i = result.companies.rows.findIndex((row) => row[0] === "7203");
      const row = result.worklife.rows[i] as WorklifeRow;
      // 固定9 + 残業の件数1 + 有給の件数1 = 11（トヨタは残業に区分を持たない）
      expect(row.length).toBeLessThanOrEqual(9 + 1 + 2 * 5 + 1 + 2 * 5);
      expect(row[9]).toBe(0);
    });

    it("gzip後サイズが上限(160KB)以内", () => {
      expect(result.worklifeGzipSize).toBeLessThanOrEqual(160 * 1024);
    });
  });

  /**
   * 稼ぐ力＝一人当たり経常利益（P0・#155・`docs/performance/spec.md` AC-1〜AC-4）。
   */
  describe("performance.json", () => {
    const indexOf = (id: string) => result.companies.rows.findIndex((row) => row[0] === id);

    it("AC-1 1,864社ぶんの値が入る（取れなかったのは3社）", () => {
      expect(result.performance.meta.count).toBe(1867);
      expect(result.performance.meta.matched).toBe(1864);
      expect(result.performance.meta.years).toEqual([2022, 2023, 2024, 2025, 2026]);
    });

    it("perEmployee が companies.rows と同じ並び・同じ長さ", () => {
      // **ずれると別の会社の稼ぐ力を出す。** stats.json・worklife.json と同じ制約。
      expect(result.performance.perEmployee.length).toBe(result.companies.rows.length);
      expect(result.performance.perEmployee[indexOf("6861")]).toBe(40620698);
    });

    it("AC-2 銀行業・保険業・その他金融業が欠けない", () => {
      // 営業利益が無いことを理由に欠損にしない。三菱UFJフィナンシャル・グループ。
      expect(result.performance.perEmployee[indexOf("8306")]).toBeGreaterThan(0);
      for (const name of ["銀行業", "保険業", "その他金融業"]) {
        const median = result.performance.industryMedian[result.companies.industries.indexOf(name)];
        expect(median, name).not.toBeNull();
        expect(median!, name).toBeGreaterThan(0);
      }
    });

    it("AC-3 赤字は負のまま残る（捨てるとデータ無しと区別できない）", () => {
      // ソフトバンクグループ。5期の中央値が負になる会社は59社ある。
      expect(result.performance.perEmployee[indexOf("9984")]).toBeLessThan(0);
      expect(result.performance.perEmployee.filter((v) => v !== null && v < 0).length).toBe(59);
    });

    it("AC-3 連結の従業員数が無い会社は単体で代用する", () => {
      // `sourceRows` と `companies.rows` は同じ並びなので添字がそのまま使える。
      const missing = sourceRows.flatMap((row, i) => (row.employeesConsolidated === null ? [i] : []));
      expect(missing.length).toBe(191);
      // 代用しないとこの191社が丸ごと欠ける。
      const filled = missing.filter((i) => result.performance.perEmployee[i] !== null);
      expect(filled.length).toBeGreaterThan(150);
    });

    it("業種中央値が industries と同じ並び・同じ長さ", () => {
      expect(result.performance.industryMedian.length).toBe(result.companies.industries.length);
      // **中央値であって平均ではない**——電気機器はキーエンスが桁で外れる。
      const electric =
        result.performance.industryMedian[result.companies.industries.indexOf("電気機器")]!;
      expect(electric).toBe(1810637);
      expect(result.performance.perEmployee[indexOf("6861")]! / electric).toBeGreaterThan(20);
    });

    it("業種によって中央値が桁で違う（併記が要る理由）", () => {
      const median = (name: string) =>
        result.performance.industryMedian[result.companies.industries.indexOf(name)]!;
      expect(median("海運業") / median("輸送用機器")).toBeGreaterThan(15);
    });

    it("AC-4 gzip後サイズが上限(32KB)以内", () => {
      expect(result.performanceGzipSize).toBeLessThanOrEqual(32 * 1024);
    });
  });

  /**
   * レーダー4軸の順位（P1・#167・`docs/performance/spec.md` 2.1）。
   * **平均年収の軸は入らない**——表示基準で変わるので `stats.json` から出す。
   */
  describe("radar.json", () => {
    const indexOf = (id: string) => result.companies.rows.findIndex((row) => row[0] === id);
    const AXES = ["paidLeave", "tenure", "profit", "overtime"] as const;

    it("4軸が companies.rows と同じ並び・同じ長さ", () => {
      expect(result.radar.meta.axes).toEqual([...AXES]);
      for (const key of AXES) {
        expect(result.radar[key].rank.length, key).toBe(result.companies.rows.length);
      }
    });

    it("値そのものは持たない（ADR-0011。別のファイルから引ける）", () => {
      // 二重に持つと `radar.json` の `JSON.parse` が倍になる（0.264ms → 0.524ms）。
      for (const key of AXES) {
        expect(Object.keys(result.radar[key]).sort(), key).toEqual(["population", "rank"]);
      }
      expect(Object.keys(result.radar).sort()).toEqual([
        "meta",
        "overtime",
        "paidLeave",
        "profit",
        "tenure",
      ]);
    });

    it("平均年収の軸は持たない（表示基準で変わるため）", () => {
      expect(result.radar.meta.axes).not.toContain("salary");
      expect(Object.keys(result.radar)).not.toContain("salary");
    });

    it("母集団は軸ごとに違う（有給と残業は6割前後しか公表がない）", () => {
      expect(result.radar.tenure.population).toBe(1867);
      expect(result.radar.profit.population).toBe(1864);
      // 全体値か、区分がちょうど1つの会社だけが軸に乗る（代表を選ばないため）。
      expect(result.radar.paidLeave.population).toBeGreaterThan(800);
      expect(result.radar.paidLeave.population).toBeLessThan(1200);
      expect(result.radar.overtime.population).toBeGreaterThan(800);
      expect(result.radar.overtime.population).toBeLessThan(1200);
    });

    it("キーエンスは残業が掲載なし、有給は区分1つぶんが乗る", () => {
      const i = indexOf("6861");
      expect(result.radar.overtime.rank[i]).toBe(-1);
      // 区分「正社員」1件だけなので軸に乗る（アートボード 6a がそう描いている）。
      expect(result.radar.paidLeave.rank[i]).toBeGreaterThan(0);
    });

    it("区分が2つ以上の会社は軸に乗せない（新日本空調の有給）", () => {
      // 営業・管理系 67.4 / 技術系 60.8。**どちらかを代表に選ばない**（spec 2.2b）。
      expect(result.radar.paidLeave.rank[indexOf("1952")]).toBe(-1);
    });

    it("在籍年数の1位は実データの最長の会社", () => {
      // 向きの規則そのものは `web/features/company/lib/radar.test.ts` が
      // 固定している。ここは実データに当たっていることだけを見る。
      const longest = sourceRows.reduce((a, b) => (a.avgTenure >= b.avgTenure ? a : b));
      const i = sourceRows.indexOf(longest);
      expect(result.radar.tenure.rank[i]).toBe(1);
    });

    it("稼ぐ力の1位は perEmployee が最大の会社", () => {
      let best = -1;
      let bestValue = -Infinity;
      result.performance.perEmployee.forEach((v, i) => {
        if (v !== null && v > bestValue) {
          bestValue = v;
          best = i;
        }
      });
      expect(result.radar.profit.rank[best]).toBe(1);
    });

    it("gzip後サイズが上限(48KB)以内", () => {
      expect(result.radarGzipSize).toBeLessThanOrEqual(48 * 1024);
    });
  });
});

/**
 * 決算期の導出（S3・Issue #134）。`buildData` を通さずに境界だけを見る。
 */
describe("dominantFiscalPeriod", () => {
  const rows = (...periods: string[]) => periods.map((periodEnd) => ({ periodEnd }));

  it("最頻の決算期を `YYYY-MM` で返す", () => {
    expect(dominantFiscalPeriod(rows("2026-03-31", "2026-03-20", "2026-04-20"))).toBe("2026-03");
  });

  it("決算期が過半に届かなければ落とす（1つで代表できないため）", () => {
    expect(() => dominantFiscalPeriod(rows("2026-03-31", "2026-04-20", "2026-05-31"))).toThrow(
      /代表できません/
    );
  });

  it("period_end の形が違えば落とす", () => {
    expect(() => dominantFiscalPeriod(rows("2026/03/31"))).toThrow(/YYYY-MM-DD/);
  });
});

/**
 * `population.json` の切り出し（R0・`docs/runtime/spec.md` AC-5・Issue #165）。
 *
 * **`/` は母集団の9組（337B）しか使わないのに `stats.json`（131KB）を丸ごと
 * 読んでいた。** import したファイルは1バイトしか使わなくても丸ごと `JSON.parse`
 * され、isolate の初回リクエストに課金される（Issue #118）。
 */
describe("population.json", () => {
  let outDir: string;
  let result: ReturnType<typeof buildData>;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "nenshu-population-"));
    result = buildData(outDir);
  });

  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("bases・count・population が stats.json と完全に一致する", () => {
    const stats = JSON.parse(readFileSync(result.statsPath, "utf-8"));
    const population = JSON.parse(readFileSync(result.populationPath, "utf-8"));
    expect(population.bases).toEqual(stats.bases);
    expect(population.count).toEqual(stats.count);
    expect(population.population).toEqual(stats.population);
  });

  it("**順位は入っていない。** ここに rankAll が混ざると分けた意味が無くなる", () => {
    const population = JSON.parse(readFileSync(result.populationPath, "utf-8"));
    expect(Object.keys(population).sort()).toEqual(["bases", "count", "population"]);
  });

  it("`/` が読む量として小さいこと（1KB未満）", () => {
    expect(readFileSync(result.populationPath).length).toBeLessThan(1024);
  });

  it("公開中の population.json が stats.json と揃っている（生成し忘れを止める）", () => {
    const dir = join(ROOT, "../web/public/data");
    const stats = JSON.parse(readFileSync(join(dir, "stats.json"), "utf-8"));
    const population = JSON.parse(readFileSync(join(dir, "population.json"), "utf-8"));
    expect(population).toEqual(pickPopulation(stats));
  });
});
