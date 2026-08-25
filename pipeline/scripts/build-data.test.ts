import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildData, fiscalPeriodRange } from "./build-data";
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

  it("companies.json が2,961行を持つ", () => {
    expect(result.companies.rows.length).toBe(2961);
  });

  // S3（Issue #134）と E1（`docs/expansion/spec.md` 1.4）。決算期は画面と
  // title・description の何箇所にも出るので、CSV から導いて `meta` に載せる。
  // ここが崩れると全ページの「いつのデータか」が一斉に嘘になる。
  it("meta に決算期の幅が入る。値は CSV の period_end の最古と最新", () => {
    expect(result.companies.meta.fiscalPeriodRange).toEqual({ from: "2025-03", to: "2026-05" });

    const counts = new Map<string, number>();
    for (const row of sourceRows) {
      const period = row.periodEnd.slice(0, 7);
      counts.set(period, (counts.get(period) ?? 0) + 1);
    }
    // 実測（E2 で母集団を直近12か月に広げた後・ADR-0011）。**最頻を代表として
    // 名乗るのはやめた**（E1）が、偏っていること自体は `/about` が断る。
    // **3月期は 63.5% しかない**——旧ガード（過半に届かなければ落とす）はここを
    // 通ってしまうので、幅そのものをガードにしてある。
    expect(counts.get("2026-03")).toBe(1880);
    expect(counts.get("2025-12")).toBe(387);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(2961);
  });

  // E1。企業詳細は1社ぶんなので幅ではなく実際の決算期を出せる。
  it("会社ごとの決算期を文字列プールの添字で持つ", () => {
    // 14種類（`2025-03` 〜 `2026-05`）。**`YYYY-MM` をそのまま行に並べず添字にする**
    // ——種類が少ないので、プールにすればトップページの HTML が4分の1で済む。
    expect(result.companies.periods).toEqual([
      "2025-03", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10",
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
    ]);

    const idx = result.companies.periods;
    result.companies.rows.forEach((row, i) => {
      expect(idx[row[9]]).toBe(sourceRows[i].periodEnd.slice(0, 7));
    });
  });

  // **Python（`pipeline/salary/curves.py`）と TypeScript（`web/.../salary.ts`）の
  // 実装が一致していることの検証。** CSVの `salary35` 列は Python が
  // `curves.estimate_salary`（ADR-0005の2点モデル）で計算した値で、ここでは
  // **サイトが実際に使っている `estimateSalary` をそのまま呼んで**突き合わせる。
  // 式を書き写すと web 側の変更を取り逃すので、実物を import する。
  //
  // 丸めにも注意が要る。Python の組み込み round() は偶数丸めで JavaScript の
  // Math.round と違うため、Python 側は floor(x + 0.5) を使っている。
  it("2点モデル（ADR-0005）で再計算した35歳時点の推定年収がCSVのsalary35と全2,961社で一致する", () => {
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

  it("id が2,961件すべて一意", () => {
    const ids = result.companies.rows.map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ここから4件は公開URL `/company/[id]` の安定性を固定する（ADR-0006）。
  // 書類ID由来のIDは毎年の有報提出で変わるため、一度公開したURLが年1回
  // リセットされてしまう。証券コード／EDINETコードはどちらも年をまたいで変わらない。
  it("証券コードを持つ会社の id は証券コードそのもの", () => {
    const withSecCode = sourceRows.filter((r) => r.secCode !== "");
    expect(withSecCode.length).toBe(2819);
    for (const row of withSecCode) {
      expect(makeId(row)).toBe(row.secCode);
    }
  });

  it("証券コードを持たない142社の id はEDINETコード（E＋5桁）", () => {
    const withoutSecCode = sourceRows.filter((r) => r.secCode === "");
    expect(withoutSecCode.length).toBe(142);
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

  /*
   * E2（`docs/expansion/spec.md` AC-2）。**寄せ方が走査順に依存すると会社が消える。**
   * 窓を12か月に広げると、同じ年に有報を複数出す会社が現れる——りそな銀行と
   * 三井住友信託銀行は窓の中にそれぞれ4件持ち、**「後に見つかったものが勝つ」で
   * 「従業員の状況」を持たない書類が残って母集団から消えていた**（実測）。
   * `edinet.doc_rank`（期末の新しいほう、同じなら docID が大きいほう）で選び直す。
   */
  it("AC-2: EDINETコードが1社1行で、同じ年に有報を複数出す会社も残っている", () => {
    const codes = sourceRows.map((r) => r.edinetCode);
    expect(codes.filter((c) => c === "")).toEqual([]);
    expect(new Set(codes).size).toBe(codes.length);

    // りそな銀行・三井住友信託銀行。**「従業員の状況」を持つ書類から作られている**
    // ことは、金額と平均年齢が入っていることで分かる（持たない書類なら欠ける）。
    for (const code of ["E03538", "E03627"]) {
      const row = sourceRows.find((r) => r.edinetCode === code);
      expect(row, code).toBeDefined();
      expect(row!.avgSalary, code).toBeGreaterThan(0);
      expect(row!.avgAge, code).toBeGreaterThan(0);
    }
  });

  /*
   * E2（AC-4）。**掲載の条件は窓を広げても変えていない**（ADR-0011）。社数を目標に
   * ここを緩めると、載っている数字の意味が薄まる。
   */
  it("AC-4: 全行が掲載条件（単体従業員100人以上・平均年齢20〜65歳・平均年間給与100万円超）を満たす", () => {
    for (const row of sourceRows) {
      expect(row.employeesNonConsolidated, row.name).toBeGreaterThanOrEqual(100);
      expect(row.avgAge, row.name).toBeGreaterThanOrEqual(20);
      expect(row.avgAge, row.name).toBeLessThanOrEqual(65);
      expect(row.avgSalary, row.name).toBeGreaterThan(1_000_000);
    }
  });

  /*
   * E2（AC-1）。**決算期で会社が消えない。** 以前の窓（6/1〜7/10）は3月期決算の
   * 提出ピークに貼り付いており、この5社は1社も入っていなかった。
   */
  it("AC-1: 決算期が3月でない会社が母集団に入っている", () => {
    const byName = new Map(result.companies.rows.map((r) => [r[1], r]));
    for (const name of [
      "キヤノン株式会社",
      "日本たばこ産業株式会社",
      "楽天グループ株式会社",
      "イオン株式会社",
      "株式会社ファーストリテイリング",
    ]) {
      const row = byName.get(name);
      expect(row, name).toBeDefined();
      // 決算期は3月ではない（`periods` への添字から引く）。
      expect(result.companies.periods[row![9]].slice(5), name).not.toBe("03");
    }
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
  it("stats.json が9表示基準（実測値＋8年齢） × 2,961社ぶんの順位を持つ", () => {
    const { bases, count, rankAll, rankIndustry, population, industryCounts } = result.stats;
    // 先頭の null が実測値。ADR-0007。
    expect(bases).toEqual([null, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(count).toBe(2961);
    expect(rankAll.length).toBe(2961);
    expect(rankIndustry.length).toBe(2961);
    expect(population.length).toBe(9);
    expect(industryCounts.length).toBe(result.companies.industries.length);
    expect(industryCounts.reduce((a, b) => a + b, 0)).toBe(2961);
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
      // **同額は同順位（自分より高い会社の数 ＋ 1）。** 素朴に「自分より高い
      // 要素を数える」と 2,961社 × 9基準で O(n²) になり、E2 で母集団を広げた
      // あと5秒の既定タイムアウトを超えた（実測9.8秒）。**照合の規則は変えず**、
      // 降順に並べて「その値が最初に現れる位置」を引く形にしてある。
      const rankTable = (indexes: number[]) => {
        const sorted = [...indexes].sort((a, b) => estimates[b] - estimates[a]);
        const rank = new Map<number, number>();
        sorted.forEach((index, position) => {
          if (!rank.has(estimates[index])) rank.set(estimates[index], position + 1);
        });
        return rank;
      };

      const allIndexes = rows.map((_, i) => i);
      const rankAllExpected = rankTable(allIndexes);
      const byIndustry = new Map<number, number[]>();
      for (const i of allIndexes) {
        const members = byIndustry.get(rows[i][2]);
        if (members === undefined) byIndustry.set(rows[i][2], [i]);
        else members.push(i);
      }
      const rankIndustryExpected = new Map<number, Map<number, number>>();
      for (const [industry, members] of byIndustry) {
        rankIndustryExpected.set(industry, rankTable(members));
      }

      for (let i = 0; i < rows.length; i++) {
        expect(rankAll[i][k]).toBe(rankAllExpected.get(estimates[i]));
        expect(rankIndustry[i][k]).toBe(
          rankIndustryExpected.get(rows[i][2])!.get(estimates[i])
        );
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
    expect(rows[topIndex][1]).toBe("ヒューリック株式会社");
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
  it("AC-3: history.json の2026年が companies.json の平均年収と一致する（推移を持つ会社ぶん）", () => {
    const { years, byId } = result.history;
    const k = years.indexOf(2026);
    const rows = result.companies.rows;

    // 推移を持つ会社では、2026年が欠けていることも値がずれていることも許さない
    // （同じ有報・同じ抽出関数なので、ずれたら抽出が壊れている）。
    let covered = 0;
    for (const row of rows) {
      const values = byId[row[0]];
      if (values === undefined) continue;
      expect(values[k]).toBe(row[6]);
      covered += 1;
    }

    // **母集団を広げたぶん（E2・#173）は 10年推移が追随していない**——新しく
    // 入った1,094社は `history.json` に1行も無い。追随は E4（#176）で、そこで
    // この数が 2,961 に上がる。**「全社ぶん揃っている」に戻さず数で固定するのは、
    // 追随したことをテストの側でも見えるようにするため**（spec AC-8）。
    expect(covered).toBe(1867);
    expect(rows.length).toBe(2961);
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
      expect(result.worklife.meta.matched).toBe(2367);
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

    // **切り出しの発動条件は Worker バンドルであってこのファイル単体ではない**
    // （`docs/worklife/overview.md`）。E5（#177）で 2,369社ぶんになり 186.2KB。
    it("gzip後サイズが上限(220KB)以内", () => {
      expect(result.worklifeGzipSize).toBeLessThanOrEqual(220 * 1024);
    });
  });

  /**
   * 稼ぐ力＝一人当たり経常利益（P0・#155・`docs/performance/spec.md` AC-1〜AC-4）。
   */
  describe("performance.json", () => {
    const indexOf = (id: string) => result.companies.rows.findIndex((row) => row[0] === id);

    it("AC-1 1,865社ぶんの値が入る", () => {
      expect(result.performance.meta.count).toBe(2961);
      // **欠損0件。** 経常利益の要素名は3つの綴りがあり（`OrdinaryIncomeLoss` /
      // `OrdinaryIncome` / 会社独自の名前空間の `OrdinaryProfit`）、標準名だけを
      // 見ていた頃は13書類が取れず、東京製鐵は2013〜2017年しか残らなかった。
      // 経常利益そのものは全1,867社で取れる。**2社だけ落としている**——
      // 最後に開示したのが8年前で、「直近5期」が2014〜2018年になってしまう会社。
      expect(result.performance.meta.matched).toBe(1865);
      // **年の和集合であって「5年ぶん」ではない。** 会社ごとに「持っている年のうち
      // 新しい5つ」を採るので、開示が飛んでいる会社（2026・2025・2024・2021・2019）が
      // いると範囲は広がる。見るのは最新年と、直近5年を含むことの2つ。
      expect(result.performance.meta.years.at(-1)).toBe(2026);
      for (const year of [2022, 2023, 2024, 2025, 2026]) {
        expect(result.performance.meta.years, String(year)).toContain(year);
      }
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
      expect(missing.length).toBe(371);
      // 代用しないとこの371社が丸ごと欠ける。**埋まるのは稼ぐ力を持つ会社ぶんだけ**
      // ——新しく入った会社（E2・#173）は `performance.json` にまだ無く、追随は
      // E6（#182）になる。
      const filled = missing.filter((i) => result.performance.perEmployee[i] !== null);
      expect(filled.length).toBeGreaterThan(150);
    });

    it("業種中央値が industries と同じ並び・同じ長さ", () => {
      expect(result.performance.industryMedian.length).toBe(result.companies.industries.length);
      // **中央値であって平均ではない**——電気機器はキーエンスが桁で外れる。
      const electric =
        result.performance.industryMedian[result.companies.industries.indexOf("電気機器")]!;
      expect(electric).toBe(1912611);
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

    it("値そのものは持たない（別のファイルから引ける）", () => {
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

    // **母集団を広げると公表率は下がる**（E2・E5）。新しく入った会社には非上場・
    // 新規上場が多く、女性活躍DBへの掲載が任意なため——有給 42.8%・残業 48.0%。
    it("母集団は軸ごとに違う（有給と残業は掲載が任意なので半数に満たない）", () => {
      expect(result.radar.tenure.population).toBe(2961);
      expect(result.radar.profit.population).toBe(1865);
      // 全体値か、区分がちょうど1つの会社だけが軸に乗る（代表を選ばないため）。
      // W2（#185）で 0 と入力ミスの100%を落としたぶん、両軸とも母集団が減った。
      expect(result.radar.paidLeave.population).toBe(1264);
      expect(result.radar.overtime.population).toBe(1413);
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

  /**
   * 稼ぐ力の10年推移（P2・#168・`docs/performance/spec.md` 2.3）。
   */
  describe("profit-history.json", () => {
    it("3本とも years と同じ長さ", () => {
      const { years, profit, income, employees } = result.profitHistory;
      expect(years.length).toBeGreaterThan(0);
      for (const id of Object.keys(profit)) {
        expect(profit[id].length, id).toBe(years.length);
        expect(income[id].length, id).toBe(years.length);
        expect(employees[id].length, id).toBe(years.length);
      }
    });

    it("年は昇順にそろっている", () => {
      const { years } = result.profitHistory;
      expect([...years].sort((a, b) => a - b)).toEqual(years);
    });

    it("キーは companies.json の id（証券コード／EDINETコード）", () => {
      const ids = new Set(result.companies.rows.map((row) => row[0]));
      for (const id of Object.keys(result.profitHistory.profit)) {
        expect(ids.has(id), id).toBe(true);
      }
    });

    it("稼ぐ力は その年の経常利益 ÷ その年の従業員数", () => {
      // **年ごとに割る。** P0 の「5期の中央値 ÷ 当期の従業員数」とは分母が違う。
      const { profit, income, employees } = result.profitHistory;
      for (const id of Object.keys(profit)) {
        profit[id].forEach((value, i) => {
          if (value === null) return;
          const expected = Math.round(
            (income[id][i] as number) / (employees[id][i] as number)
          );
          expect(value, `${id} ${i}`).toBe(expected);
        });
      }
    });

    it("従業員数が無い年は稼ぐ力も null（内挿しない）", () => {
      const { profit, employees } = result.profitHistory;
      for (const id of Object.keys(profit)) {
        profit[id].forEach((value, i) => {
          if (employees[id][i] === null) expect(value, `${id} ${i}`).toBeNull();
        });
      }
    });

    it("全年 null の会社はキーごと落とす", () => {
      for (const values of Object.values(result.profitHistory.profit)) {
        expect(values.some((v) => v !== null)).toBe(true);
      }
    });

    it("赤字は負のまま残る", () => {
      const negatives = Object.values(result.profitHistory.income).flat();
      expect(negatives.some((v) => v !== null && v < 0)).toBe(true);
    });

    it("gzip後サイズが上限(256KB)以内", () => {
      expect(result.profitHistoryGzipSize).toBeLessThanOrEqual(256 * 1024);
    });
  });
});

/**
 * 決算期の幅（E1・`docs/expansion/spec.md` 1.4）。`buildData` を通さずに境界だけを見る。
 */
describe("fiscalPeriodRange", () => {
  const rows = (...periods: string[]) => periods.map((periodEnd) => ({ periodEnd }));

  it("最古と最新を `YYYY-MM` で返す", () => {
    expect(fiscalPeriodRange(rows("2026-03-31", "2026-03-20", "2026-04-20"))).toEqual({
      from: "2026-03",
      to: "2026-04",
    });
  });

  it("全社が同じ決算期なら from と to が同じになる", () => {
    expect(fiscalPeriodRange(rows("2026-03-31", "2026-03-20"))).toEqual({
      from: "2026-03",
      to: "2026-03",
    });
  });

  // **旧ガード（最頻が過半に届かなければ落とす）は通ってしまう分布**。母集団を
  // 広げると3月期は 63.5% で、1,081社の決算期が違うまま代表を名乗ることになる。
  // 幅で出すならこれは正常系。
  it("最頻が過半でも過半でなくても落ちない", () => {
    expect(fiscalPeriodRange(rows("2026-03-31", "2026-04-20", "2026-05-31"))).toEqual({
      from: "2026-03",
      to: "2026-05",
    });
  });

  // 拡大後の実測の端（ニデックの2025-03期 〜 2026-05期 = 15か月）。
  it("拡大後の15か月の幅は通る", () => {
    expect(fiscalPeriodRange(rows("2025-03-31", "2026-05-31"))).toEqual({
      from: "2025-03",
      to: "2026-05",
    });
  });

  // 代表の過半チェックを外したぶんのガード（ADR-0011 の窓が壊れたことに気づく）。
  it("幅が24か月を超えたら落とす", () => {
    expect(() => fiscalPeriodRange(rows("2024-03-31", "2026-04-20"))).toThrow(/幅が広すぎます/);
  });

  it("period_end の形が違えば落とす", () => {
    expect(() => fiscalPeriodRange(rows("2026/03/31"))).toThrow(/YYYY-MM-DD/);
  });

  it("行が無ければ落とす", () => {
    expect(() => fiscalPeriodRange([])).toThrow(/行がありません/);
  });
});
