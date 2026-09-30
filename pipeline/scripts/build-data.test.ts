import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildData,
  checkCountDrop,
  datasetVersion,
  fiscalPeriodRange,
  MAX_COUNT_DROP_RATIO,
  TENURE_MEDIAN_MIN_COMPANIES,
} from "./build-data";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import {
  parsePerformanceHistoryCsv,
  parseSalaryHistoryCsv,
  parseUnifiedCsv,
  type UnifiedRow,
} from "./lib/csv";
import { isLapsed, readLedger } from "./lib/ledger";
import { HISTORY_SPAN, historyWindowYears } from "./lib/historyWindow";
import { parseCsv } from "../worklife/csv";
import { decodeRow, type WorklifeRow } from "../worklife/json";

const ROOT = join(__dirname, "..");

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * `m` が `values` の中央値であることの性質——半分以上がそれ以下・半分以上がそれ以上——を、
 * 丸めのぶん `tolerance` だけ緩めて見る。**中央値を同じ式で数え直して比べない**（写しになり、
 * 同じ勘違いをすれば通る）。在籍年数の業種の中央値（AC-18）と同じ見方。
 */
const isMedianOf = (m: number, values: readonly number[], tolerance: number) =>
  values.filter((v) => v <= m + tolerance).length * 2 >= values.length &&
  values.filter((v) => v >= m - tolerance).length * 2 >= values.length;

/**
 * 条件に合う会社の添字（`companies.rows` の並び）を返す。**無ければ落とす**——状態を前提に
 * したテストが、その状態の会社がデータから消えたときに空振りして通らないように。
 * web の `web/testing/realData.ts` の `pickCompany` と同じ考え方で、こちらは `buildData` の
 * 出力（一時ディレクトリ）を相手にする。
 */
const pickIndex = (what: string, count: number, pred: (i: number) => boolean) => {
  for (let i = 0; i < count; i++) if (pred(i)) return i;
  throw new Error(`${what}が見つからない`);
};

/** `data/worklife.csv` を企業 id → 列名 → 値 で読む。 */
const readWorklifeCsv = () => {
  const csv = parseCsv(readFileSync(join(ROOT, "data/worklife.csv"), "utf-8"));
  const header = csv[0];
  const byId = new Map<string, Record<string, string>>();
  for (const line of csv.slice(1)) {
    const cells: Record<string, string> = {};
    header.forEach((name, i) => (cells[name] = line[i] ?? ""));
    byId.set(cells.id, cells);
  }
  return byId;
};

/*
 * **id の重複・各 JSON の gzip 上限・社数の急な減り（`checkCountDrop`）は `buildData` 自身が
 * 検めて例外を投げる。** そこで落ちれば `beforeAll` ごと全件が落ちるので、ここで同じ定数を
 * 書き写して確かめ直さない。
 *
 * **いまのデータの値を書き写さない**（refresh の D0・#870）。毎日の更新で社数・金額・決算期の
 * 幅は日ごとに動く。期待値は入力（CSV）から引くか、値どうしの関係で見る。状態（「決算期が
 * 3月でない」「給与の決定方針が無い」）を前提にするときは、名指しをやめて `pickIndex` で選ぶ。
 */
describe("buildData", () => {
  let outDir: string;
  let result: ReturnType<typeof buildData>;
  let sourceRows: UnifiedRow[];
  /** 企業ページのある会社の入力の行（母集団＋ランキングの外の会社・D9・D11）。`pageCompanyRows()` と同じ並び。 */
  let pageSourceRows: UnifiedRow[];

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "nenshu-build-data-"));
    result = buildData(outDir);
    // 出力の行は、入力の行からランキングの外の会社（最後の有報から24か月・単体従業員の線を割った）を
    // 除いた並び。
    const unranked = new Set(result.unranked.map((row) => row.edinetCode));
    sourceRows = parseUnifiedCsv(
      readFileSync(join(ROOT, "data/ranking_unified.csv"), "utf-8")
    ).filter((row) => !unranked.has(row.edinetCode));
    pageSourceRows = [...sourceRows, ...result.unranked];
    return () => rmSync(outDir, { recursive: true, force: true });
  });

  /**
   * **企業ページのある会社**の行（refresh の D9・#879・D11・#903）。母集団（`companies.rows`）に、
   * ランキングの外の会社（`unranked.json` の `rows`）を続けた並び。会社ごとのデータ（推移・説明文・
   * 書類 等）はこちらの全社ぶんを持つ。提出が途切れた会社はいまのデータにいないので、その側は
   * 揺らしたデータ（`tools/perturb/`）で走る。
   */
  const pageCompanyRows = () => [...result.companies.rows, ...result.unrankedData.rows];

  /**
   * 表示基準 `basis`（`null` が実測値・ADR-0007）での全社の金額。`stats.json` の検算に使う。
   * **サイトが実際に使っている `estimateSalary` をそのまま呼ぶ**（式を書き写さない）。
   */
  const amounts = new Map<number | null, number[]>();
  const amountsFor = (basis: number | null): number[] => {
    let values = amounts.get(basis);
    if (values === undefined) {
      const { agePoints, curves } = result.curves;
      values = result.companies.rows.map((row) =>
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
      amounts.set(basis, values);
    }
    return values;
  };

  // S3（Issue #134）と E1（`docs/expansion/spec.md` 1.4）。決算期は画面と
  // title・description の何箇所にも出るので、CSV から導いて `meta` に載せる。
  // ここが崩れると全ページの「いつのデータか」が一斉に嘘になる。
  // **最頻を代表として名乗るのはやめた**（E1）——E2 で母集団を直近12か月に広げると
  // 3月期でない会社が大きな割合を占め、1つの決算期では代表できない。
  it("meta に決算期の幅が入る。値は CSV の period_end の最古と最新", () => {
    const periods = sourceRows.map((row) => row.periodEnd.slice(0, 7)).sort();
    expect(result.companies.meta.fiscalPeriodRange).toEqual({
      from: periods[0],
      to: periods.at(-1),
    });
  });

  /*
   * **添字の列がずれると、別の業種・別のカーブ・別の決算期を出す。**
   *
   * - 業種（表示用の tse33）と産業大分類（賃金カーブのキー）は「建設業」のように名前が
   *   一致するものがあるので、別の配列・別の添字で持つ。取り違えると推定年収が別の
   *   業種のカーブで計算される。
   * - 会社ごとの決算期（E1）は `YYYY-MM` をそのまま行に並べず文字列プールの添字にする
   *   ——種類は社数よりずっと少ないので、トップページの HTML が4分の1で済む。企業詳細は1社ぶんなので
   *   幅ではなく実際の決算期を出せる。
   */
  it("companies.rows が CSV と同じ並びで、添字の列が元の値を指す（業種・産業大分類・決算期）", () => {
    const { industries, curveKeys, periods, rows } = result.companies;
    rows.forEach((row, i) => {
      const src = sourceRows[i];
      expect(row[1]).toBe(src.name);
      expect(industries[row[2]], src.name).toBe(src.tse33);
      expect(curveKeys[row[3]], src.name).toBe(src.industry);
      expect(periods[row[9]], src.name).toBe(src.periodEnd.slice(0, 7));
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
  it("2点モデル（ADR-0005）で再計算した35歳時点の推定年収がCSVのsalary35と全社で一致する", () => {
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

  // ここから2件は公開URL `/company/[id]` の安定性を固定する（ADR-0006・ADR-0017）。
  // ID は更新台帳から引き、ビルドのたびに計算し直さない。振り方の規則（証券コード→
  // EDINETコード、ぶつかったら EDINETコード）は `pipeline/ledger/test_ledger.py` が見る。
  it("id は更新台帳の ID で、書類ID由来の id が残っていない", () => {
    const ledger = readLedger();
    result.companies.rows.forEach((row, i) => {
      const src = sourceRows[i];
      expect(row[0], src.name).toBe(ledger.get(src.edinetCode)?.id);
      // 旧 makeId は証券コードの無い会社に書類ID由来の id を作っていた（みずほ銀行の
      // `s100yfah`、JERA の `jera-s100ycjz`）。いまの id は証券コードか EDINETコードの形。
      expect(row[0], src.name).toMatch(/^(?:[0-9A-Z]{4}|E\d{5})$/);
    });
  });

  /*
   * **社名ではなく EDINETコードで引く。** 社名は変わる（楽天は楽天グループになった）が、
   * EDINETコードは年をまたいで変わらず、振った id も変えない（ADR-0017）。ここで見ているのは
   * その会社が居ることと、id が変わっていないことだけ。
   */
  it("代表的な会社の id が固定されている", () => {
    const idOf = (edinetCode: string) => {
      const i = sourceRows.findIndex((row) => row.edinetCode === edinetCode);
      if (i < 0) throw new Error(`${edinetCode} が見つからない`);
      return result.companies.rows[i][0];
    };
    expect(idOf("E01967")).toBe("6861"); // キーエンス
    expect(idOf("E02529")).toBe("8058"); // 三菱商事
    expect(idOf("E02144")).toBe("7203"); // トヨタ自動車
    // みずほ銀行。非上場。旧IDは書類ID由来の `s100yfah` だった。
    expect(idOf("E03532")).toBe("E03532");
  });

  /*
   * 版は `companies.json` の中身から決まる（refresh の D2）。**同じ入力から作り直せば同じ版、
   * 行が1つ動けば別の版**——古い HTML が新しい JSON を引いたときに、クライアントが引き継ぎを
   * やめる突き合わせ（E0・ADR-0013）が毎日の更新でも働くように。
   */
  it("版は中身から決まり、version と generatedAt を除いた中身が同じなら同じ版になる", () => {
    const { version, generatedAt, ...meta } = result.companies.meta;
    expect(generatedAt).toEqual(expect.any(String));
    const body = { ...result.companies, meta };
    expect(version).toBe(datasetVersion(body));
    const moved = structuredClone(body);
    (moved.rows[0] as unknown as number[])[6] += 1;
    expect(datasetVersion(moved)).not.toBe(version);
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
   * 提出ピークに貼り付いており、spec が名指しする5社は1社も入っていなかった。
   *
   * 5社は居ることだけを見る（EDINETコードで引く。社名は変わりうる）。**決算期が3月で
   * ないことは会社ごとには見ない**——決算期は会社が変えられる。代わりに、直近12か月の窓
   * なら1年ぶんの決算月が揃う、という母集団の性質を見る。
   */
  it("AC-1: 決算期が3月でない会社が母集団に入っている（決算月が12か月ぶん揃う）", () => {
    const codes = new Set(sourceRows.map((row) => row.edinetCode));
    for (const [code, name] of [
      ["E02274", "キヤノン"],
      ["E00492", "日本たばこ産業"],
      ["E05080", "楽天グループ"],
      ["E03061", "イオン"],
      ["E03217", "ファーストリテイリング"],
    ]) {
      expect(codes.has(code), name).toBe(true);
    }
    // 決算月は `periods` への添字から引く。
    const months = new Set(
      result.companies.rows.map((row) => result.companies.periods[row[9]].slice(5))
    );
    expect([...months].sort()).toEqual(
      Array.from({ length: 12 }, (_, k) => String(k + 1).padStart(2, "0"))
    );
  });

  // stats.json は企業詳細ページ（`/company/[id]`）が使う母集団統計。順位を
  // リクエストごとに計算しないための事前計算で、companies.json と行の並びが
  // 一致していることが正しさの前提になる。
  it("stats.json が9表示基準（実測値＋8年齢） × 全社ぶんの順位を持つ", () => {
    const { bases, count, rankAll, rankIndustry, population, industryCounts } = result.stats;
    // 先頭の null が実測値。ADR-0007。**列がずれると別の表示基準の順位を出す。**
    expect(bases).toEqual([null, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(count).toBe(result.companies.rows.length);
    expect(rankAll.length).toBe(count);
    expect(rankIndustry.length).toBe(count);
    expect(population.length).toBe(bases.length);
    expect(industryCounts.length).toBe(result.companies.industries.length);
    expect(sum(industryCounts)).toBe(count);
    for (const row of rankAll) expect(row.length).toBe(bases.length);
    for (const row of rankIndustry) expect(row.length).toBe(bases.length);
  });

  it("stats.json の順位が各表示基準の金額の降順と一致する", () => {
    const { bases, rankAll, rankIndustry, industryCounts } = result.stats;
    const rows = result.companies.rows;

    for (let k = 0; k < bases.length; k++) {
      // 実測値の列は補正を通さず avgSalary そのもの。
      const estimates = amountsFor(bases[k]);
      // **同額は同順位（自分より高い会社の数 ＋ 1）。** 素朴に「自分より高い
      // 要素を数える」と 社数 × 9基準で O(n²) になり、E2 で母集団を広げた
      // あと5秒の既定タイムアウトを超えた（E2 の時点で実測9.8秒）。**照合の規則は変えず**、
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
        expect(rankIndustry[i][k]).toBe(rankIndustryExpected.get(rows[i][2])!.get(estimates[i]));
        expect(rankIndustry[i][k]).toBeLessThanOrEqual(industryCounts[rows[i][2]]);
      }
    }
  });

  // 実測値と年齢そろえは別の分布なので、平均も標準偏差も基準ごとに別の値になる。
  it("stats.json の母集団統計（平均・母標準偏差）が各表示基準の金額と一致する", () => {
    result.stats.bases.forEach((basis, k) => {
      const values = amountsFor(basis);
      const mean = sum(values) / values.length;
      // 母標準偏差（n で割る）。対象は掲載している会社そのもの。
      const sd = Math.sqrt(sum(values.map((x) => (x - mean) ** 2)) / values.length);
      expect(result.stats.population[k], String(basis)).toEqual({
        mean: Math.round(mean),
        sd: Math.round(sd),
      });
    });
  });

  /*
   * 分布（C2・`docs/company/spec.md` 1.13）。**中位は実在する会社の金額をそのまま採る**
   * （偶数件でも中央2件を平均しない）。
   */
  it("stats.json の分布が9ビンで合計が社数になり、中位が各表示基準の中央の会社の金額になる", () => {
    result.stats.bases.forEach((basis, k) => {
      const d = result.stats.distribution[k];
      expect(d.counts, String(basis)).toHaveLength(9);
      expect(sum(d.counts), String(basis)).toBe(result.stats.count);
      const sorted = [...amountsFor(basis)].sort((a, b) => a - b);
      expect(d.median, String(basis)).toBe(sorted[Math.floor(sorted.length / 2)]);
    });
  });

  /*
   * **階級は表示基準ごとに違う**——C2 の時点で 25歳そろえは 249〜788万円、実測値は
   * 332〜2,178万円で、同じ区切りを当てると片方は9ビンのうち7つが空になった。
   * 両端のビンは外側を吸収するので、中の7ビンだけで母集団を覆えている必要はない。
   */
  it("stats.json の階級は表示基準ごとに選び直され、どの基準でも9ビンのうち7つ以上が埋まる", () => {
    const { bases, distribution } = result.stats;
    expect(distribution[bases.indexOf(25)].width).toBeLessThan(distribution[0].width);
    for (const d of distribution) {
      expect(d.counts.filter((n) => n > 0).length).toBeGreaterThanOrEqual(7);
    }
  });

  // history.json は企業詳細ページの「平均年収推移（過去10年間）」が読む
  // （T0・`docs/timeseries/spec.md` 1.4）。/ は読まない（Issue #22）。
  /** その会社の窓の年（refresh の D5）。 */
  const windowYearsOf = (id: string) => historyWindowYears(result.history.endById[id]);
  /** その会社の `year` の値。窓の外なら `null`。 */
  const valueAt = (values: readonly (number | null)[], id: string, year: number) =>
    values[windowYearsOf(id).indexOf(year)] ?? null;

  it("AC-2・AC-9: history.json は会社ごとに右端から数えた10年ぶんで、右端の年には値がある", () => {
    const { endById, byId, ageById, tenureById } = result.history;
    // E4（#176）で全社に行が付いた。**新しく載る会社も採用書類の1年ぶんを持つ**
    // （refresh の spec 1.9）ので、行を持つのは企業ページのある全社（母集団＋外れた会社・D9）。
    const ids = Object.keys(byId);
    expect(ids.length).toBe(pageCompanyRows().length);
    expect(Object.keys(endById)).toEqual(ids);
    for (const id of ids) {
      expect(byId[id], id).toHaveLength(HISTORY_SPAN);
      expect(ageById[id], id).toHaveLength(HISTORY_SPAN);
      expect(tenureById[id], id).toHaveLength(HISTORY_SPAN);
      // **右端は値のある最新の年**（D5）。窓の最後の年が空くことは無い
      expect(byId[id].at(-1), id).not.toBeNull();
    }
  });

  it("AC-2: 年ごとの社数が下限を満たす", () => {
    const { endById, byId } = result.history;
    const shareOf = (year: number) =>
      Object.entries(byId).filter(([id, values]) => valueAt(values, id, year) !== null).length /
      result.companies.rows.length;
    // **全社の最新の年ではなく、いちばん多くの会社の右端になっている年で見る**（refresh の D5）。
    // 新しい年の有報が出はじめた直後は、その年を持つ会社がまだ数社しかない（揺らしたデータの
    // 5つ目がその状態を作る）。
    const endCounts = new Map<number, number>();
    for (const end of Object.values(endById)) endCounts.set(end, (endCounts.get(end) ?? 0) + 1);
    const [mainEnd] = [...endCounts].sort((a, b) => b[1] - a[1])[0];
    // **その年も全社ぶんにはならない。** 取得の窓が直近12か月なので、決算期が
    // 3月でない会社の最新の有報は前年の提出になる。**下限を母集団いっぱいに
    // 上げると、正しいデータで落ちる。**
    expect(shareOf(mainEnd)).toBeGreaterThanOrEqual(0.8);
    // 2018年以前の書類はタグが無く本文から拾う（`textblock.py`）ので、古い年ほど
    // 取りこぼしが出やすい。E4（#176）で新しく入った会社にもこの経路が効いた。
    expect(shareOf(mainEnd - HISTORY_SPAN + 1)).toBeGreaterThanOrEqual(0.75);
  });

  // 同じ有報から取った同じ数字なので、ここがずれていたら抽出が壊れている。
  it("AC-3: 窓の右端の年の値が companies.json の平均年収と一致し、右端は決算期の年かその翌年（全社）", () => {
    const { endById, byId } = result.history;
    const { rows, periods } = result.companies;

    // **右端の行は数字の書類の行**（refresh の D5。`build-data.ts` の `checkWindowEnds` が
    // 書類 ID で見ている）なので、値もランキングの平均年収と同じになる。
    //
    // 右端（提出した年）は決算期の年か、その翌年（12月期は翌年3月に出る）。どちらかで
    // あればよい——**年を1つに決め打ちすると、決算期の分布が変わったときに抽出が壊れて
    // いないのに落ちる。**
    let covered = 0;
    for (const row of rows) {
      const values = byId[row[0]];
      if (values === undefined) continue;
      expect(values.at(-1), row[0]).toBe(row[6]);
      const periodYear = Number(periods[row[9]].slice(0, 4));
      expect([periodYear, periodYear + 1], row[0]).toContain(endById[row[0]]);
      covered += 1;
    }

    // **全社ぶん突き合わせたことを数で見る**（spec AC-8）。母集団を広げた E2（#173）の
    // 時点では新しく入った会社が `history.json` に1行も無く、黙って飛ばされていた。
    // 社数は毎日の更新で動くので、母集団の社数と比べる。
    expect(covered).toBe(rows.length);
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
    // 割合が空振りしないこと。平均して1社あたり5組を下回るなら抽出が欠けている。
    expect(pairs).toBeGreaterThan(result.companies.rows.length * 5);
    expect(jumps.length / pairs).toBeLessThan(0.001);
  });

  /*
   * E4（#176）で `history.resolve_scale` を足した。`run.fix_salary_typos` は1行しか
   * 見ないので、あり得る帯（`plausible_salary_range`）に入る10の冪を小さいほうから
   * 採り、**帯が広いぶん間違った桁で止まる**。10年ぶんを並べればその会社の他の年が
   * 正しい桁を指す。**Python 側にテストの器が無いので、実物のデータで見る。**
   *
   * **見るのは、その会社の他の年から桁で離れた年が残っていないこと**（全社）。E4 の時点で
   * 直した2件はどちらもこの形だった——トスネット2019は ÷100 で止まって他の年の10倍、
   * Ｍ＆Ａキャピタルパートナーズ2019・2022は帯の上限をわずかに超えるため ÷10 されて10分の1。
   * 線は5倍に置く。10の冪のずれは、元の値が他の年の半分〜2倍にあれば5倍より外に出る。
   *
   * **浮いているというだけで直さない**（ホットリンク2018は前後の約半分だが、有報が
   * 「平均年間給与（千円）3,205」と書いている実額）。それを10倍・10分の1に直してしまえば、
   * 同じ5倍の線に掛かる。
   */
  it("AC-3: 1行では決まらない桁を、その会社の他の年で選び直している（桁で離れた年が無い）", () => {
    const off: string[] = [];
    for (const [id, values] of Object.entries(result.history.byId)) {
      const present = values.flatMap((v, k) => (v === null ? [] : [{ k, v }]));
      // `resolve_scale` が基準にするのは直していない年が2つ以上ある会社。
      if (present.length < 3) continue;
      for (const { k, v } of present) {
        const ref = median(present.filter((p) => p.k !== k).map((p) => p.v));
        if (Math.abs(Math.log10(v / ref)) >= Math.log10(5)) {
          off.push(`${id} ${windowYearsOf(id)[k]}: ${v}（他の年の中央値 ${ref}）`);
        }
      }
    }
    expect(off).toEqual([]);
  });

  /*
   * **内挿しない**ことは、埋まっている年が `salary_history.csv` の行のある年と一致することで
   * 見る（全社）。前後の年から内挿していれば、CSV に無い年が埋まる。
   */
  it("AC-4: 欠けている年は null のまま（内挿しない）で、全年 null の会社は載せない", () => {
    const { byId } = result.history;
    const csvYears = new Map<string, Set<number>>();
    const historyRows = parseSalaryHistoryCsv(
      readFileSync(join(ROOT, "data/salary_history.csv"), "utf-8")
    );
    for (const row of historyRows) {
      const set = csvYears.get(row.edinetCode) ?? new Set<number>();
      set.add(row.year);
      csvYears.set(row.edinetCode, set);
    }

    let gaps = 0;
    result.companies.rows.forEach((row, i) => {
      const values = byId[row[0]];
      if (values === undefined) return;
      const years = windowYearsOf(row[0]);
      const filled = years.filter((_, k) => values[k] !== null);
      // 窓より古い年の行は CSV にあっても出さない（refresh の D5）
      expect(filled, row[0]).toEqual(
        [...(csvYears.get(sourceRows[i].edinetCode) ?? [])]
          .filter((year) => year >= years[0])
          .sort((a, b) => a - b)
      );
      // 途中の年が欠けている（最初と最後の値のある年の間に null がある）会社を数える。
      if (filled.length > 0 && filled.at(-1)! - filled[0] + 1 > filled.length) gaps += 1;
    });
    // 途中の年が欠けている会社が居なければ、この検査は内挿を捕まえられない。
    expect(gaps).toBeGreaterThan(0);

    for (const values of Object.values(byId)) {
      expect(values.some((x) => x !== null)).toBe(true);
    }
  });

  /*
   * T3（#827・`docs/timeseries/spec.md` AC-15）。平均年齢は平均年収と同じ書類の同じ表から
   * 取っているので、**null の位置が1つでもずれていたら、どちらかを別の行から拾っている。**
   * 2017・2018年は本文の表から拾った値（`textblock.py`）なので、あり得る帯に入っていることも
   * 全件で見る。帯は T3 の時点の実測（25.4〜60.6歳）の外側に置いた。**隣の年との飛びは見ない**——
   * 持株会社化で単体の従業員数が桁で変わった年は本当に10歳以上動く（オープンアップグループ
   * 35.7 → 50.5歳）。
   */
  it("AC-15: ageById は byId と同じ会社・同じ年に値を持ち、20〜70歳に入っている", () => {
    const { byId, ageById } = result.history;
    expect(Object.keys(ageById)).toEqual(Object.keys(byId));
    for (const [id, values] of Object.entries(byId)) {
      const ages = ageById[id];
      expect(
        ages.map((age) => age === null),
        id
      ).toEqual(values.map((value) => value === null));
      for (const age of ages) {
        if (age === null) continue;
        expect(age, id).toBeGreaterThanOrEqual(20);
        expect(age, id).toBeLessThanOrEqual(70);
      }
    }
  });

  it("AC-15: 窓の右端の年の平均年齢が companies.json の平均年齢と一致する（全社）", () => {
    const { ageById } = result.history;
    const { rows } = result.companies;

    // AC-3（平均年収）と同じ突き合わせ。右端の行は数字の書類の行（`checkWindowEnds`）。
    let covered = 0;
    for (const row of rows) {
      const ages = ageById[row[0]];
      if (ages === undefined) continue;
      expect(ages.at(-1), `${row[0]}`).toBe(row[4]);
      covered += 1;
    }
    expect(covered).toBe(rows.length);
  });

  /*
   * T4（#835・`docs/timeseries/spec.md` AC-17）。在籍年数も平均年収と同じ書類の同じ表から
   * 取っている。**平均年齢と違い、平均年収のある年に空欄がありうる**（本文の表に勤続の列が
   * 無い書類）ので、見るのは「平均年収の無い年は在籍年数も無い」の片向きだけ。帯は抽出側の
   * 妥当性検査（`textblock._validate` の `0 <= 勤続 <= 年齢 - 15`）と同じ線にしてある。
   */
  it("AC-17: tenureById は byId と同じ会社を持ち、平均年収の無い年は在籍年数も無い", () => {
    const { byId, ageById, tenureById } = result.history;
    expect(Object.keys(tenureById)).toEqual(Object.keys(byId));
    for (const [id, values] of Object.entries(byId)) {
      const tenures = tenureById[id];
      const years = windowYearsOf(id);
      tenures.forEach((tenure, k) => {
        if (values[k] === null) expect(tenure, `${id} ${years[k]}`).toBeNull();
        if (tenure === null) return;
        expect(tenure, `${id} ${years[k]}`).toBeGreaterThanOrEqual(0);
        expect(tenure, `${id} ${years[k]}`).toBeLessThanOrEqual(ageById[id][k]! - 15);
      });
    }
  });

  it("AC-17: 窓の右端の年の在籍年数が companies.json の在籍年数と一致する（全社）", () => {
    const { tenureById } = result.history;
    const { rows } = result.companies;

    // AC-15（平均年齢）と同じ突き合わせ。
    let covered = 0;
    for (const row of rows) {
      const tenures = tenureById[row[0]];
      if (tenures === undefined) continue;
      expect(tenures.at(-1), `${row[0]}`).toBe(row[5]);
      covered += 1;
    }
    expect(covered).toBe(rows.length);
  });

  /*
   * T4（AC-18）。業種の中央値を**同じ式で数え直して比べない**（写しになり、同じ勘違いを
   * すれば通る）。中央値であることの性質——その年に値を持つ同業の会社のうち、半分以上が
   * それ以下・半分以上がそれ以上——と、値を持つ会社が3社未満なら `null` であることを見る。
   */
  it("AC-18: 業種の中央値は、その年に値を持つ同業の会社の真ん中にある", () => {
    const { endById, medianYears, tenureIndustryMedian } = result.history;
    const { industries, rows } = result.companies;
    expect(tenureIndustryMedian.length).toBe(industries.length);

    // **中央値の年は全社の窓を覆う**（refresh の D5）。どの会社の窓の年も引ける。
    expect(medianYears).toEqual(historyWindowYears(medianYears.at(-1)!, medianYears.length));
    for (const [id, end] of Object.entries(endById)) {
      expect(medianYears, id).toEqual(expect.arrayContaining(historyWindowYears(end)));
    }

    // **値は会社の窓ではなく CSV の行から集める**——中央値はその年の性質で、どの会社の窓に
    // 入るかでは変わらない（右端が新しい年に進んだ会社の古い年の値も、その年の中央値に入る）。
    const industryOf = new Map(sourceRows.map((row, i) => [row.edinetCode, rows[i][2]]));
    const tenures = parseSalaryHistoryCsv(
      readFileSync(join(ROOT, "data/salary_history.csv"), "utf-8")
    ).filter((row) => industryOf.has(row.edinetCode) && row.avgTenure !== null);

    industries.forEach((industry, j) => {
      expect(tenureIndustryMedian[j].length, industry).toBe(medianYears.length);
      medianYears.forEach((year, k) => {
        const values = tenures
          .filter((row) => row.year === year && industryOf.get(row.edinetCode) === j)
          .map((row) => row.avgTenure as number);
        const median = tenureIndustryMedian[j][k];
        if (values.length < TENURE_MEDIAN_MIN_COMPANIES) {
          expect(median, `${industry} ${year}`).toBeNull();
          return;
        }
        expect(median, `${industry} ${year}`).not.toBeNull();
        // 小数第2位で丸めてあるので、端では 0.005 だけ外に出うる。
        const below = values.filter((v) => v <= median! + 0.005).length;
        const above = values.filter((v) => v >= median! - 0.005).length;
        expect(below * 2, `${industry} ${year}`).toBeGreaterThanOrEqual(values.length);
        expect(above * 2, `${industry} ${year}`).toBeGreaterThanOrEqual(values.length);
      });
    });
  });

  /**
   * 働きやすさ指標（W0・Issue #149）。**行の並びが `companies.rows` と一致すること**が
   * ここでいちばん大事な検証になる——ずれると別の会社の残業時間を出す。
   *
   * 個々の会社の値（トヨタ・三菱商事の区分・三菱UFJの掲載なし など）は、実際に配る
   * `web/public/data/worklife.json` を web の読み手で読む `web/lib/data/worklife.test.ts` が
   * 固定している。ここは並びだけを見る。
   */
  describe("worklife.json", () => {
    it("行の並びが companies.rows と一致し、掲載の無い会社には 0 が入る（欠測を数値の 0 と混ぜない）", () => {
      const byId = readWorklifeCsv();

      // 母集団（`worklife.json`）とランキングの外の会社（`unranked.json` の `worklife`・D9・D11）は、
      // それぞれ自分の行と同じ並びで、文字列プールも別に持つ
      const groups = [
        [result.companies.rows, result.worklife],
        [result.unrankedData.rows, result.unrankedData.worklife],
      ] as const;
      let matched = 0;
      for (const [rows, worklife] of groups) {
        expect(worklife.rows).toHaveLength(rows.length);
        expect(worklife.notes).toHaveLength(rows.length);
        rows.forEach((company, i) => {
          const cells = byId.get(String(company[0]));
          if (cells === undefined) {
            // 持株会社（三菱UFJ など）は法人番号で突合できない（ADR-0009）。
            expect(worklife.rows[i], company[1]).toBe(0);
            expect(worklife.notes[i], company[1]).toBe(0);
            return;
          }
          matched += 1;
          const decoded = decodeRow(worklife.rows[i] as WorklifeRow, worklife.pool);
          expect(decoded.overtimeAll).toBe(
            cells.overtime_all === "" ? null : Number(cells.overtime_all)
          );
          expect(decoded.asOf).toBe(cells.as_of);
          expect(worklife.notes[i]).toBe(cells.wage_gap_note === "" ? 0 : cells.wage_gap_note);
        });
      }
      // CSV の行はすべて掲載社（母集団かランキングの外の会社）に当たる（当たらなければ `buildWorklife` が落ちる）。
      expect(matched).toBe(byId.size);
    });
  });

  /**
   * 稼ぐ力＝一人当たり経常利益（P0・#155・`docs/performance/spec.md` AC-1〜AC-3）。
   * AC-4（gzip の上限）は `buildData` が検める。
   *
   * 期待値は `performance_history.csv`（経常利益の推移）から引く。会社の稼ぐ力や業種の
   * 中央値を書き写さない——決算のたびに動く。
   */
  describe("performance.json", () => {
    const indexOf = (id: string) => result.companies.rows.findIndex((row) => row[0] === id);

    /** EDINETコード → 経常利益の推移（新しい年から）。 */
    let incomesByCode: Map<string, { year: number; ordinaryIncome: number }[]>;
    /** データ全体の最終年。 */
    let latestYear: number;

    beforeAll(() => {
      const rows = parsePerformanceHistoryCsv(
        readFileSync(join(ROOT, "data/performance_history.csv"), "utf-8")
      );
      latestYear = Math.max(...rows.map((row) => row.year));
      incomesByCode = new Map();
      for (const row of rows) {
        const list = incomesByCode.get(row.edinetCode) ?? [];
        list.push(row);
        incomesByCode.set(row.edinetCode, list);
      }
      for (const list of incomesByCode.values()) list.sort((a, b) => b.year - a.year);
    });

    /** その行の会社の直近5期の経常利益。 */
    const recentIncomes = (i: number) =>
      (incomesByCode.get(sourceRows[i].edinetCode) ?? []).slice(0, 5).map((r) => r.ordinaryIncome);
    /**
     * 最後の開示が最終年かその前年の会社。**古い会社は落とす**——「直近5期」が何年も前の
     * 中央値になってしまう（E6 の時点で弘電社・キクカワエンタープライズの2社。最後の開示が8年前）。
     */
    const hasRecent = (i: number) => {
      const list = incomesByCode.get(sourceRows[i].edinetCode);
      return list !== undefined && list.length > 0 && list[0].year >= latestYear - 1;
    };

    it("AC-1 経常利益の推移を直近まで持つ会社には、すべて値が入る", () => {
      // 経常利益の要素名は3つの綴りがあり（`OrdinaryIncomeLoss` / `OrdinaryIncome` /
      // 会社独自の名前空間の `OrdinaryProfit`）、標準名だけを見ていた頃は13書類が取れず、
      // 東京製鐵は2013〜2017年しか残らなかった。**値を持たないのは、推移が無い会社（新しく
      // 載って、まだ取れていない会社）と、最後の開示が古い会社だけ。**
      const { perEmployee, meta } = result.performance;
      const mismatched = result.companies.rows.flatMap((row, i) =>
        (perEmployee[i] !== null) === hasRecent(i) ? [] : [`${row[0]} ${row[1]}`]
      );
      expect(mismatched).toEqual([]);
      expect(meta.matched).toBe(perEmployee.filter((v) => v !== null).length);
      // **推移を持つ会社の割合も見る。** 綴りを取りこぼすと推移そのものが CSV から消え、
      // 上の突き合わせは「推移の無い会社は値も無い」で通ってしまう。
      const withHistory = sourceRows.filter((row) => incomesByCode.has(row.edinetCode)).length;
      expect(withHistory / sourceRows.length).toBeGreaterThanOrEqual(0.99);
      // **年の和集合であって「5年ぶん」ではない。** 会社ごとに「持っている年のうち
      // 新しい5つ」を採るので、開示が飛んでいる会社がいると範囲は広がる。
      // 見るのは最終年と、直近5年を含むことの2つ。
      expect(meta.years.at(-1)).toBe(latestYear);
      for (let year = latestYear - 4; year <= latestYear; year++) {
        expect(meta.years, String(year)).toContain(year);
      }
    });

    it("perEmployee が companies.rows と同じ並び・同じ長さで、5期の中央値 ÷ 従業員数になっている", () => {
      // **ずれると別の会社の稼ぐ力を出す。** stats.json・worklife.json と同じ制約。
      // 並びは、その行の会社の経常利益（EDINETコードで引く）と突き合わせて見る。
      // 分母は連結の従業員数、無ければ単体（AC-3）。値は円に丸めてあるので、
      // 「値 × 従業員数」は中央値から従業員数の半分だけずれうる。
      const { perEmployee } = result.performance;
      expect(perEmployee.length).toBe(result.companies.rows.length);
      const wrong: string[] = [];
      perEmployee.forEach((value, i) => {
        if (value === null) return;
        const { employeesConsolidated, employeesNonConsolidated } = sourceRows[i];
        const employees = employeesConsolidated ?? employeesNonConsolidated;
        if (!isMedianOf(value * employees, recentIncomes(i), employees / 2 + 1)) {
          wrong.push(`${result.companies.rows[i][0]}: ${value}`);
        }
      });
      expect(wrong).toEqual([]);
    });

    it("AC-2 銀行業・保険業・その他金融業が欠けない", () => {
      // 営業利益が無いことを理由に欠損にしない。spec が名指しする三菱UFJフィナンシャル・グループ。
      // **黒字かどうかは見ない**（業績で変わる）。
      expect(result.performance.perEmployee[indexOf("8306")]).not.toBeNull();
      for (const name of ["銀行業", "保険業", "その他金融業"]) {
        const industryMedian =
          result.performance.industryMedian[result.companies.industries.indexOf(name)];
        expect(industryMedian, name).not.toBeNull();
        expect(industryMedian!, name).toBeGreaterThan(0);
      }
    });

    it("AC-3 赤字は負のまま残る（捨てるとデータ無しと区別できない）", () => {
      // 5期の中央値が負になる会社を、経常利益の推移から選ぶ。名指しすると、その会社が
      // 黒字に戻ったときに崩れる。
      const deficits = result.companies.rows.flatMap((_, i) =>
        hasRecent(i) && median(recentIncomes(i)) < 0 ? [i] : []
      );
      expect(deficits.length, "5期の中央値が負の会社が居ない").toBeGreaterThan(0);
      for (const i of deficits) {
        expect(result.performance.perEmployee[i], result.companies.rows[i][0]).toBeLessThan(0);
      }
    });

    it("AC-3 連結の従業員数が無い会社は単体で代用する", () => {
      // `sourceRows` と `companies.rows` は同じ並びなので添字がそのまま使える。
      const missing = sourceRows.flatMap((row, i) =>
        row.employeesConsolidated === null ? [i] : []
      );
      // 代用しないとこれらの会社が丸ごと欠ける。**埋まらないのは、推移が無いか最後の
      // 開示が古い会社だけ**（AC-1 と同じ線）。分母が単体であることは上の並びのテストが見る。
      const filled = missing.filter((i) => result.performance.perEmployee[i] !== null);
      expect(filled.length, "代用で埋まった会社が居ない").toBeGreaterThan(0);
      expect(filled).toEqual(missing.filter(hasRecent));
    });

    it("業種中央値が industries と同じ並びで欠けがなく、平均ではなく中央値で、業種間で桁が違う", () => {
      const { industryMedian, perEmployee } = result.performance;
      const { industries, rows } = result.companies;
      expect(industryMedian.length).toBe(industries.length);
      const medians = industryMedian.filter((v): v is number => v !== null);
      expect(medians.length).toBe(industryMedian.length);

      // **中央値であって平均ではない**——電気機器はキーエンスが桁で外れる。業種ごとに、
      // その業種の会社の値の真ん中にあることを見る（円に丸めたぶん 0.5 だけ緩める）。
      industries.forEach((name, j) => {
        const values = perEmployee.filter((v, i): v is number => v !== null && rows[i][2] === j);
        expect(isMedianOf(industryMedian[j]!, values, 0.5), name).toBe(true);
      });

      // **併記が要る理由。** どの業種が端に来るかは母集団で入れ替わる——E6（#182）で
      // 広げる前は 海運業 2,524万 / 輸送用機器 131万 の19倍、E6 の時点の端は
      // 鉱業 3,846万 / 陸運業 125万。**業種名を決め打ちすると、母集団が変わった
      // ときに「桁で違う」が成り立たなくなったのか端が入れ替わっただけなのかを
      // 区別できない**ので、端そのものを見る。
      expect(Math.max(...medians) / Math.min(...medians)).toBeGreaterThan(15);
    });
  });

  /**
   * レーダー4軸の順位（P1・#167・`docs/performance/spec.md` 2.1）。
   * **平均年収の軸は入らない**——表示基準で変わるので `stats.json` から出す。
   */
  describe("radar.json", () => {
    /** 働きやすさの CSV の行（企業 id で引く）。有給・残業の値が「あるか」を独立に見る。 */
    let worklifeById: Map<string, Record<string, string>>;
    beforeAll(() => {
      worklifeById = readWorklifeCsv();
    });

    const cellsOf = (i: number) => worklifeById.get(String(result.companies.rows[i][0]));
    /** 区分のうち値のあるもの（会社が登録した順）。 */
    const unitValues = (cells: Record<string, string>, prefix: string, suffix: string) =>
      [1, 2, 3, 4, 5].map((n) => cells[`${prefix}${n}${suffix}`] ?? "").filter((v) => v !== "");
    /** 全体値か、値のある区分を1つでも持つ（W3・#802 の「全体値 → 無ければ先頭の区分」）。 */
    const hasPaidLeave = (cells: Record<string, string> | undefined) =>
      cells !== undefined &&
      (cells.paid_leave_all !== "" || unitValues(cells, "paid_leave_unit", "_rate").length > 0);
    const hasOvertime = (cells: Record<string, string> | undefined) =>
      cells !== undefined &&
      (cells.overtime_all !== "" || unitValues(cells, "overtime_unit", "_hours").length > 0);

    it("4軸の順位だけを companies.rows と同じ並びで持つ（平均年収の軸と値そのものは持たない）", () => {
      const AXES = ["paidLeave", "tenure", "profit", "overtime"] as const;
      expect(result.radar.meta.axes).toEqual([...AXES]);
      // 値は別のファイルから引ける。二重に持つと `radar.json` の `JSON.parse` が倍になる
      // （P1 の時点で 0.264ms → 0.524ms）。平均年収は表示基準で変わるので `stats.json` から出す。
      expect(Object.keys(result.radar).sort()).toEqual([...AXES, "meta"].sort());
      for (const key of AXES) {
        expect(Object.keys(result.radar[key]).sort(), key).toEqual(["population", "rank"]);
        expect(result.radar[key].rank.length, key).toBe(result.companies.rows.length);
      }
    });

    // **欠測を最下位として数えない。** 掲載が任意の軸で、公表している会社が軒並み上位に寄る。
    // 母集団を広げると有給と残業の公表率は下がる（E2・E5）——新しく入った会社には非上場・
    // 新規上場が多く、女性活躍DBへの掲載が任意なため。
    it("母集団は軸ごとに違い、値のある会社だけを数える", () => {
      const { rows } = result.companies;
      for (const key of ["paidLeave", "tenure", "profit", "overtime"] as const) {
        const { rank, population } = result.radar[key];
        expect(rank.filter((r) => r >= 1).length, key).toBe(population);
        expect(
          rank.every((r) => r === -1 || (r >= 1 && r <= population)),
          key
        ).toBe(true);
      }
      // 在籍年数は有報の「従業員の状況」の項目で全社が持つ。稼ぐ力は値のある会社だけ。
      expect(result.radar.tenure.population).toBe(rows.length);
      expect(result.radar.profit.population).toBe(result.performance.meta.matched);
      // 有給と残業は、全体値か値のある区分を1つでも持てば軸に乗る。全社には届かない。
      const count = (has: (cells: Record<string, string> | undefined) => boolean) =>
        rows.filter((_, i) => has(cellsOf(i))).length;
      expect(result.radar.paidLeave.population).toBe(count(hasPaidLeave));
      expect(result.radar.overtime.population).toBe(count(hasOvertime));
      expect(result.radar.paidLeave.population).toBeLessThan(rows.length);
      expect(result.radar.overtime.population).toBeLessThan(rows.length);
    });

    it("掲載の無い軸は順位を持たず（-1）、区分が1つだけの会社も軸に乗る", () => {
      const n = result.companies.rows.length;
      // 働きやすさの行はあるが残業の値が1つも無い会社（W1 の時点のキーエンスがそう）。
      const noOvertime = pickIndex("残業の値が無い会社（働きやすさの行はある）", n, (i) => {
        const cells = cellsOf(i);
        return cells !== undefined && !hasOvertime(cells);
      });
      expect(result.radar.overtime.rank[noOvertime]).toBe(-1);
      // 有給の全体値が無く、値のある区分が1つだけの会社。区分を選んでいないので軸に乗る。
      const oneUnit = pickIndex("有給の全体値が無く、値のある区分が1つだけの会社", n, (i) => {
        const cells = cellsOf(i);
        return (
          cells !== undefined &&
          cells.paid_leave_all === "" &&
          unitValues(cells, "paid_leave_unit", "_rate").length === 1
        );
      });
      expect(result.radar.paidLeave.rank[oneUnit]).toBeGreaterThan(0);
    });

    it("区分が2つ以上の会社は先頭の区分で軸に乗る（有給・W3）", () => {
      // ~~どちらかを代表に選ばない~~（W2 まで）→ 先頭の区分で順位を決める。平均にはしない。
      // 先頭を採る（平均しない）ことは `web/features/company/lib/radar.test.ts` が
      // 固定している。ここは実データで軸に乗ることだけを見る。
      const i = pickIndex(
        "有給の全体値が無く、値のある区分が2つ以上の会社",
        result.companies.rows.length,
        (k) => {
          const cells = cellsOf(k);
          return (
            cells !== undefined &&
            cells.paid_leave_all === "" &&
            unitValues(cells, "paid_leave_unit", "_rate").length >= 2
          );
        }
      );
      expect(result.radar.paidLeave.rank[i]).toBeGreaterThan(0);
    });

    it("在籍年数・稼ぐ力の1位は、それぞれ実データの最大の会社（軸に正しい列を当てている）", () => {
      // 向きの規則そのものは `web/features/company/lib/radar.test.ts` が
      // 固定している。ここは実データに当たっていることだけを見る。
      const longest = sourceRows.reduce((a, b) => (a.avgTenure >= b.avgTenure ? a : b));
      expect(result.radar.tenure.rank[sourceRows.indexOf(longest)]).toBe(1);

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
  });

  /**
   * 稼ぐ力の10年推移（P2・#168・`docs/performance/spec.md` 2.3）。
   */
  describe("profit-history.json", () => {
    it("窓は平均年収の推移と同じ会社ごとの10年で、キーは企業ページのある会社の id、3本とも10年ぶん", () => {
      // **窓は `history.json` にそろえる**（refresh の D5）。CSV には窓より古い年も入って
      // いるが、平均年収推移の直後に置いて同じ10年を見比べる節なので、横軸が揃わないと読めない。
      const { profit, income, employees } = result.profitHistory;
      const ids = new Set(pageCompanyRows().map((row) => row[0]));
      for (const id of Object.keys(profit)) {
        expect(ids.has(id), id).toBe(true);
        expect(result.history.endById[id], id).toBeDefined();
        expect(profit[id].length, id).toBe(HISTORY_SPAN);
        expect(income[id].length, id).toBe(HISTORY_SPAN);
        expect(employees[id].length, id).toBe(HISTORY_SPAN);
      }
    });

    it("経常利益は、その会社の窓の年の CSV の値（窓より古い年は出さない）", () => {
      const byKey = new Map(
        parsePerformanceHistoryCsv(
          readFileSync(join(ROOT, "data/performance_history.csv"), "utf-8")
        ).map((row) => [`${row.edinetCode} ${row.year}`, row.ordinaryIncome])
      );
      const codeOf = new Map(
        pageCompanyRows().map((row, i) => [row[0], pageSourceRows[i].edinetCode])
      );
      for (const [id, values] of Object.entries(result.profitHistory.income)) {
        windowYearsOf(id).forEach((year, k) => {
          expect(values[k], `${id} ${year}`).toBe(byKey.get(`${codeOf.get(id)} ${year}`) ?? null);
        });
      }
    });

    it("稼ぐ力は その年の経常利益 ÷ その年の従業員数で、従業員数が無い年は null（内挿しない）", () => {
      // **年ごとに割る。** P0 の「5期の中央値 ÷ 当期の従業員数」とは分母が違う。
      const { profit, income, employees } = result.profitHistory;
      for (const id of Object.keys(profit)) {
        profit[id].forEach((value, i) => {
          if (employees[id][i] === null) {
            expect(value, `${id} ${i}`).toBeNull();
            return;
          }
          if (value === null) return;
          const expected = Math.round((income[id][i] as number) / (employees[id][i] as number));
          expect(value, `${id} ${i}`).toBe(expected);
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
  });

  /**
   * 会社の説明文（C7・Issue #161・親 #158）。**`/company/[id]` だけが読む**ので、
   * ここで見るのは中身ではなく**引き方が壊れていないこと**になる。
   */
  describe("summaries.json", () => {
    /** CSV の説明文（EDINETコード → 説明文。空の行は空文字のまま持つ）。 */
    const readSummaryCsv = () => {
      const csv = parseCsv(readFileSync(join(ROOT, "data/company_summary.csv"), "utf-8"));
      const codeIndex = csv[0].indexOf("edinet_code");
      const summaryIndex = csv[0].indexOf("summary");
      return new Map(csv.slice(1).map((line) => [line[codeIndex], line[summaryIndex] ?? ""]));
    };

    /**
     * **CSV の説明文がある行はすべて掲載社に当たる。** 当たらない行があるのは
     * 突合キー（`edinet_code`）か母集団が変わったときで、`buildSummaries` はそこで
     * 落ちる——**落とさないと「説明文の無い会社」として静かに配ることになる。**
     */
    it("キーは企業ページのある会社の id で、説明文のある CSV の行がすべて掲載社に当たる", () => {
      const ids = new Set(pageCompanyRows().map((row) => row[0]));
      for (const id of Object.keys(result.summaries.byId)) {
        expect(ids.has(id), id).toBe(true);
      }
      const written = [...readSummaryCsv().values()].filter((summary) => summary !== "").length;
      // 突き合わせが空振りしないこと（社数そのものは書き写さない。C6・C17 の経緯は docs にある）。
      expect(written).toBeGreaterThan(0);
      expect(Object.keys(result.summaries.byId)).toHaveLength(written);
    });

    /**
     * **空文字はキーごと落とす**（`undefined` がそのまま「説明文が無い」を表す）。
     * 説明文はその会社の CSV の行のものであること（行がずれると別の会社の文を出す）も、
     * 全社で見る。**説明文の無い会社**は、原文に事業の中身が無い会社（spec AC-20）と、
     * 新しく載ってまだ書いていない会社（refresh の spec 1.9）。
     */
    it("説明文はその会社の CSV の行のもので、説明文の無い会社はキーごと無い", () => {
      const byCode = readSummaryCsv();
      const without: string[] = [];
      result.companies.rows.forEach((row, i) => {
        const id = row[0] as string;
        const expected = byCode.get(sourceRows[i].edinetCode) ?? "";
        if (expected === "") {
          expect(Object.hasOwn(result.summaries.byId, id), id).toBe(false);
          without.push(id);
        } else {
          expect(result.summaries.byId[id], id).toBe(expected);
        }
      });
      // 説明文の無い会社が居なければ、キーごと無いことの検査は空振りする。
      expect(without.length).toBeGreaterThan(0);
    });

    /** 規格（`docs/company/spec.md` 1.18）。機械ゲートが通した結果を再確認する。 */
    it("全件が全角15〜130字・1〜3文に収まる", () => {
      for (const [id, text] of Object.entries(result.summaries.byId)) {
        const width = [...text].reduce((sum, ch) => sum + (/[ -~｡-ﾟ]/.test(ch) ? 0.5 : 1), 0);
        expect(width, `${id}: ${text}`).toBeGreaterThanOrEqual(15);
        expect(width, `${id}: ${text}`).toBeLessThanOrEqual(130);
        // 引用の中の「。」は文の区切りに数えない（`pipeline/summary/gate.py` の sentences）。
        const sentences = text
          .replace(/「[^」]*」|『[^』]*』/g, "")
          .split("。")
          .filter(Boolean);
        expect(sentences.length, `${id}: ${text}`).toBeGreaterThanOrEqual(1);
        expect(sentences.length, `${id}: ${text}`).toBeLessThanOrEqual(3);
      }
    });
  });

  /**
   * 有報の書類 ID（C13・Issue #814）。企業詳細が EDINET の書類閲覧ページへのリンクにする。
   * **実測値の4項目を取った書類そのもの**でなければならないので、CSV の `doc_id` と行ごとに
   * 突き合わせる——行がずれると別の会社の有報へ飛ばすことになる。**URL は持たない**
   * （組み立ては web の1か所）ので、値は書類 ID そのものと一致する。
   */
  /*
   * ランキングの外の会社（refresh の D9・#879・D11・#903・ADR-0018）。提出が途切れた会社は
   * **いまのデータにはいない**（最初に外れうるのは 2027-08-26）ので、中身があるのは揺らしたデータ
   * （`tools/perturb/` の6つ目）だけ。単体従業員の線を割った会社は、いまのデータにも揺らしたデータ
   * （7つ目）にもいる。
   */
  it("ランキングの外の会社は unranked.json にだけ行を持ち、業種・決算期・提出日・理由を自分のプールから引ける", () => {
    const { rows, industries, periods, filedById, reasonById, consolidatedById } =
      result.unrankedData;
    const ledger = readLedger();
    const universeIds = new Set(result.companies.rows.map((row) => row[0]));
    expect(rows).toHaveLength(result.unranked.length);
    rows.forEach((row, i) => {
      const src = result.unranked[i];
      expect(row[1], src.edinetCode).toBe(src.name);
      expect(row[6]).toBe(Math.round(src.avgSalary));
      expect(industries[row[2]]).toBe(src.tse33);
      expect(periods[row[9]]).toBe(src.periodEnd.slice(0, 7));
      expect(filedById[row[0]]).toBe(ledger.get(src.edinetCode)!.filed);
      expect(reasonById[row[0]]).toBe(result.unrankedReasons[i]);
      // 連結の従業員数は、単体より多い会社だけが持つ
      const consolidated = consolidatedById[row[0]];
      if (consolidated !== undefined) expect(consolidated).toBeGreaterThan(row[7]);
      // ランキングと母集団の統計（順位・偏差値・中央値）には入らない
      expect(universeIds.has(row[0]), row[0]).toBe(false);
    });
    expect(result.stats.count).toBe(result.companies.rows.length);
  });

  it("線を割った会社は単体従業員が線の下で、提出は24か月に満たない（提出が途切れた会社とは別の理由）", () => {
    const { minEmployees } = result.companies.meta.excluded;
    const asOf = result.companies.meta.filingWindow.to;
    const ledger = readLedger();
    result.unranked.forEach((src, i) => {
      const lapsed = isLapsed(ledger.get(src.edinetCode)!.filed, asOf);
      expect(result.unrankedReasons[i], src.name).toBe(lapsed ? "lapsed" : "belowLine");
      if (!lapsed) expect(src.employeesNonConsolidated, src.name).toBeLessThan(minEmployees);
    });
  });

  describe("filings.json", () => {
    it("全社に書類 ID があり、その会社の平均年間給与を取った書類（CSV の doc_id）を指す", () => {
      expect(Object.keys(result.filings.byId)).toHaveLength(pageCompanyRows().length);
      pageCompanyRows().forEach((row, i) => {
        expect(result.filings.byId[row[0] as string], row[1] as string).toBe(
          pageSourceRows[i].docId
        );
      });
    });
  });

  /*
   * refresh の D3（spec 1.5・AC-3）。**文章の記録は、自分を作った有報の書類と期を持つ**——数字の
   * 書類（`filings.json`）を借りない。台帳の工程ごとの書類と突き合わせる（台帳と成果物が一致する
   * ことはビルドが検めている）。いまのデータでは数字と文章の書類がそろっているので、ずれた会社で
   * 見るのは揺らしたデータ（`tools/perturb/`）と E2E。
   */
  it("説明文・要約と分析・給与の決定方針の記録は、それぞれの原文の書類を持つ", () => {
    const ledger = readLedger();
    const periodOf = new Map(
      pageSourceRows.map((row) => [row.edinetCode, row.periodEnd.slice(0, 7)])
    );
    let checked = 0;
    pageCompanyRows().forEach((row, i) => {
      const id = row[0] as string;
      const { docs } = ledger.get(pageSourceRows[i].edinetCode)!;
      const pairs = [
        [result.summaries.filingById[id], docs.description, result.summaries.byId[id]],
        [result.analyses.byId[id]?.filing, docs.analysis, result.analyses.byId[id]],
        [result.payPolicies.byId[id]?.filing, docs.payPolicy, result.payPolicies.byId[id]],
      ] as const;
      for (const [filing, doc, record] of pairs) {
        if (record === undefined) continue;
        expect(filing?.docId, id).toBe(doc);
        // 期は数字の期と同じ形（`YYYY-MM`）。いまは書類がそろっているので値も同じ
        if (filing?.docId === docs.numbers) {
          expect(filing?.period, id).toBe(periodOf.get(pageSourceRows[i].edinetCode));
        }
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  /**
   * 給与の決定方針の原文（C19・Issue #852、`docs/company/spec.md` 1.23）。C18 が切り出した
   * `pay_policy.json` の本文を**書き換えずに**、企業 ID の辞書にしていること。
   */
  describe("pay-policies.json", () => {
    const source = JSON.parse(readFileSync(join(ROOT, "data/pay_policy.json"), "utf-8")) as {
      edinet_code: string;
      source?: string;
      title: string | null;
      blocks: { kind: string; text?: string; rows?: string[][]; spans?: unknown[] }[];
    }[];
    const idOf = (code: string) =>
      pageCompanyRows()[pageSourceRows.findIndex((row) => row.edinetCode === code)][0] as string;

    it("本文のある会社だけを持ち、本文は C18 の塊と1字も違わない", () => {
      const withBody = source.filter((r) => r.blocks.length > 0);
      expect(Object.keys(result.payPolicies.byId)).toHaveLength(withBody.length);
      const idByCode = new Map(
        pageSourceRows.map((row, i) => [row.edinetCode, pageCompanyRows()[i][0]])
      );
      for (const row of withBody) {
        const id = idByCode.get(row.edinet_code) as string;
        const got = result.payPolicies.byId[id];
        expect(got, row.edinet_code).toBeDefined();
        // 画像は代替テキストを落とす（空かファイル名で、読める文字が無い）。それ以外はそのまま。
        expect(got.blocks, id).toEqual(
          row.blocks.map((b) => (b.kind === "image" ? { kind: "image" } : b))
        );
      }
    });

    /**
     * AC-35 の答え（C18）が表示の側でも同じになっていること——どの節から取ったか（`source`）と
     * 会社の小見出し（`title`）も C18 のまま渡る。本文の無い会社（節の無い会社・改正前の様式の
     * 会社）が無いことは、上のテストの社数の突き合わせが見る。
     *
     * 会社を名指ししない。どの節から取ったかは、その会社の次の有報で変わる。
     */
    it("取った節と会社の小見出しも C18 のまま（節・サステナビリティの節の両方がある）", () => {
      const withBody = source.filter((r) => r.blocks.length > 0);
      for (const row of withBody) {
        const got = result.payPolicies.byId[idOf(row.edinet_code)];
        expect({ source: got.source, title: got.title }, row.edinet_code).toEqual({
          source: row.source,
          title: row.title,
        });
      }
      // 突き合わせが空振りしないこと。節から取った会社・サステナビリティの節から取った会社・
      // 小見出しのある会社が、それぞれ居る。
      const sources = new Set(withBody.map((row) => row.source));
      expect(sources.has("section")).toBe(true);
      expect(sources.has("sustainability")).toBe(true);
      expect(withBody.some((row) => row.title !== null)).toBe(true);
    });

    /**
     * 公開後の指摘（2026-09-28）。ソニーグループの報酬の表は、項目名が2列ぶん、株式報酬の内訳が
     * 左に空の列を置いて2行ぶん結合していた。結合を落とすと内訳の行だけが1列右へずれていた。
     * 結合を持つ表のある会社を C18 から選ぶ（無ければ落ちる——結合が C18 から消えたことになる）。
     */
    it("結合したセルを持つ表は、結合（spans）を落とさない", () => {
      const withSpans = source.find((row) =>
        row.blocks.some((b) => b.kind === "table" && (b.spans?.length ?? 0) > 0)
      );
      if (withSpans === undefined) throw new Error("結合したセルを持つ表のある会社が見つからない");
      const expected = withSpans.blocks.filter((b) => b.kind === "table").map((b) => b.spans);
      const got = result.payPolicies.byId[idOf(withSpans.edinet_code)].blocks
        .filter((b) => b.kind === "table")
        .map((b) => ("spans" in b ? b.spans : undefined));
      expect(got).toEqual(expected);
    });
  });
});

/**
 * 決算期の幅（E1・`docs/expansion/spec.md` 1.4）。`buildData` を通さずに境界だけを見る。
 */
describe("fiscalPeriodRange", () => {
  const rows = (...periods: string[]) => periods.map((periodEnd) => ({ periodEnd }));

  it.each([
    [
      "並び順によらず最古と最新を返す",
      ["2026-03-31", "2026-03-20", "2026-04-20"],
      "2026-03",
      "2026-04",
    ],
    // **旧ガード（最頻が過半に届かなければ落とす）は通ってしまう分布**。E2 で母集団を
    // 広げた時点で3月期は 63.5% で、1,081社の決算期が違うまま代表を名乗ることになった。
    // 幅で出すならこれは正常系。
    [
      "最頻が過半に届かなくても落ちない",
      ["2026-03-31", "2026-04-20", "2026-05-31"],
      "2026-03",
      "2026-05",
    ],
    // E2 で拡大した時点の実測の端（ニデックの2025-03期 〜 2026-05期 = 15か月）。
    ["拡大後の15か月の幅は通る", ["2025-03-31", "2026-05-31"], "2025-03", "2026-05"],
    // 最後の有報から24か月の猶予中の会社が混ざった幅（ADR-0018）。旧い線（24か月）では落ちていた
    ["猶予中の会社が混ざった30か月の幅は通る", ["2024-03-31", "2026-09-30"], "2024-03", "2026-09"],
    ["ちょうど上限の幅は通る", ["2023-09-30", "2026-09-30"], "2023-09", "2026-09"],
  ])("%s", (_, periods, from, to) => {
    expect(fiscalPeriodRange(rows(...periods))).toEqual({ from, to });
  });

  it.each([
    // 代表の過半チェックを外したぶんのガード（ADR-0011 の窓が壊れたことに気づく）。
    ["幅が上限を超えたら落とす", ["2023-08-31", "2026-09-30"], /幅が広すぎます/],
    ["period_end の形が違えば落とす", ["2026/03/31"], /YYYY-MM-DD/],
    ["行が無ければ落とす", [], /行がありません/],
  ])("%s", (_, periods, message) => {
    expect(() => fiscalPeriodRange(rows(...periods))).toThrow(message);
  });
});

/**
 * 社数の急な減り（refresh の D0・#870）。`buildData` は書き出し先にいまある `companies.json` を
 * 前回のビルドとして読む。**社数そのものは固定しない**（毎日の更新で動く）ので、見るのは減り方の
 * 境目だけ。前回が無ければ見ない（初回と、上のテストが一時ディレクトリへ書くとき）。
 */
describe("checkCountDrop", () => {
  it("前回の companies.json より社数が5%を超えて減ったら落とし、5%までの減りと増えるのは通す", () => {
    const dir = mkdtempSync(join(tmpdir(), "nenshu-count-drop-"));
    try {
      const previous = join(dir, "companies.json");
      expect(() => checkCountDrop(previous, 1)).not.toThrow();

      writeFileSync(previous, JSON.stringify({ meta: { count: 1000 } }));
      const floor = Math.ceil(1000 * (1 - MAX_COUNT_DROP_RATIO));
      expect(() => checkCountDrop(previous, floor)).not.toThrow();
      expect(() => checkCountDrop(previous, floor - 1)).toThrow(
        new RegExp(`前回の1000社から${floor - 1}社に減りました`)
      );
      expect(() => checkCountDrop(previous, 1001)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
