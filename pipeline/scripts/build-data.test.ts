import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildData, fiscalPeriodRange, TENURE_MEDIAN_MIN_COMPANIES } from "./build-data";
import { estimateSalary } from "../../web/features/ranking/lib/salary";
import { curveValuesInYen } from "../../web/features/ranking/lib/curve";
import { parseUnifiedCsv, type UnifiedRow } from "./lib/csv";
import { makeId } from "./lib/slug";
import { parseCsv } from "../worklife/csv";
import { decodeRow, type WorklifeRow } from "../worklife/json";

const ROOT = join(__dirname, "..");

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/*
 * **行数（2,961）・id の重複・各 JSON の gzip 上限は `buildData` 自身が検めて例外を
 * 投げる。** そこで落ちれば `beforeAll` ごと全件が落ちるので、ここで同じ定数を書き写して
 * 確かめ直さない。
 */
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
  // 3月期は 63.5% しかない。
  it("meta に決算期の幅が入る。値は CSV の period_end の最古と最新", () => {
    expect(result.companies.meta.fiscalPeriodRange).toEqual({ from: "2025-03", to: "2026-05" });
  });

  /*
   * **添字の列がずれると、別の業種・別のカーブ・別の決算期を出す。**
   *
   * - 業種（表示用の tse33）と産業大分類（賃金カーブのキー）は「建設業」のように名前が
   *   一致するものがあるので、別の配列・別の添字で持つ。取り違えると推定年収が別の
   *   業種のカーブで計算される。
   * - 会社ごとの決算期（E1）は `YYYY-MM` をそのまま行に並べず文字列プールの添字にする
   *   ——14種類しか無いので、トップページの HTML が4分の1で済む。企業詳細は1社ぶんなので
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

  // ここから3件は公開URL `/company/[id]` の安定性を固定する（ADR-0006）。
  // 書類ID由来のIDは毎年の有報提出で変わるため、一度公開したURLが年1回
  // リセットされてしまう。証券コード／EDINETコードはどちらも年をまたいで変わらない。
  it("id は証券コード、無ければEDINETコード（E＋5桁）で、書類ID由来の id が残っていない", () => {
    let withoutSecCode = 0;
    result.companies.rows.forEach((row, i) => {
      const src = sourceRows[i];
      if (src.secCode !== "") {
        expect(row[0], src.name).toBe(src.secCode);
      } else {
        // 旧 makeId はここで書類ID由来の id を作っていた（みずほ銀行の `s100yfah`、
        // JERA の `jera-s100ycjz`）。
        expect(row[0], src.name).toMatch(/^E\d{5}$/);
        withoutSecCode += 1;
      }
    });
    expect(withoutSecCode).toBe(142);
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

  // 実測値と年齢そろえは別の分布なので、平均も標準偏差も基準ごとに別の値になる
  // （実測値 693万・199万／35歳そろえ 616万・157万）。
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
   * **階級は表示基準ごとに違う**——25歳そろえは 249〜788万円、実測値は 332〜2,178万円で、
   * 同じ区切りを当てると片方は9ビンのうち7つが空になる。両端のビンは外側を吸収するので、
   * 中の7ビンだけで母集団を覆えている必要はない。
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
  it("AC-2: history.json が10年ぶんで、各社の配列長が years と揃っている", () => {
    const { years, byId } = result.history;
    expect(years).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);

    // E4（#176）で全2,961社に行が付いた（E2 の直後は 1,867社だった）。
    const ids = Object.keys(byId);
    expect(ids.length).toBe(2961);
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
    // **2026年は全社ぶんにはならない。** 取得の窓が直近12か月なので、決算期が
    // 3月でない会社の最新の有報は2025年の提出になる（実測 2,612社）。**下限を
    // 母集団に合わせて上げると、正しいデータで落ちる。**
    expect(countFor(2026)).toBeGreaterThanOrEqual(2500);
    // 2017・2018年はタグが無く本文から拾う（`textblock.py`）。E4（#176）で
    // 新規1,094社にもこの経路が効き、1,637 → 2,411社になった。
    expect(countFor(2017)).toBeGreaterThanOrEqual(2300);
  });

  // 同じ有報から取った同じ数字なので、ここがずれていたら抽出が壊れている。
  it("AC-3: 採用書類の年の推移が companies.json の平均年収と一致する（全社）", () => {
    const { years, byId } = result.history;
    const { rows, periods } = result.companies;

    // **「2026年と一致する」では固定できない。** 取得の窓を直近12か月に広げた
    // （E2・#173・ADR-0011）ので、決算期が3月でない会社の最新の有報は2025年の
    // 提出になる——実測で349社が2026年の値を持たない。**持っていないのが正しい**
    // ので、突き合わせる相手は「その会社の採用書類の年」になる。
    //
    // 提出年は決算期の年か、その翌年（12月期は翌年3月に出る）。どちらかで一致
    // すればよい——**年を1つに決め打ちすると、決算期の分布が変わったときに
    // 抽出が壊れていないのに落ちる。**
    let covered = 0;
    for (const row of rows) {
      const values = byId[row[0]];
      if (values === undefined) continue;
      const periodYear = Number(periods[row[9]].slice(0, 4));
      const matched = [periodYear, periodYear + 1].some((year) => {
        const k = years.indexOf(year);
        return k >= 0 && values[k] === row[6];
      });
      expect(matched).toBe(true);
      covered += 1;
    }

    // **E4（#176）で 1,867 → 2,961社になった。** 母集団を広げた E2（#173）の
    // 時点では新しく入った1,094社が `history.json` に1行も無く、この数は 1,867
    // だった。**「全社ぶん」と書かずに数で固定するのは、追随したことをテストの
    // 側でも見えるようにするため**（spec AC-8）。
    expect(covered).toBe(2961);
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

  /*
   * E4（#176）で `history.resolve_scale` を足した。`run.fix_salary_typos` は1行しか
   * 見ないので、あり得る帯（`plausible_salary_range`）に入る10の冪を小さいほうから
   * 採り、**帯が広いぶん間違った桁で止まる**。10年ぶんを並べればその会社の他の年が
   * 正しい桁を指す。**Python 側にテストの器が無いので、実物のデータで固定する**
   * （`web/lib/data/worklife.test.ts` と同じ流儀）。
   */
  it("AC-3: 1行では決まらない桁を、その会社の他の年で選び直している", () => {
    const { years, byId } = result.history;
    const at = (id: string, year: number) => byId[id][years.indexOf(year)];

    // トスネット: 有報のタグが 2,624,271,000円（千円単位の数字を円の欄に入れた
    // 提出側の誤り）。÷100 の 2,624万円が帯に入るのでそこで止まっていた。
    // 他の年は 254〜302万円なので、正しいのは ÷1000。
    expect(at("4754", 2019)).toBe(2624271);
    expect(at("4754", 2018)).toBe(2601319);

    // Ｍ＆Ａキャピタルパートナーズ: タグの 31,093,000円・31,613,000円が**そのまま
    // 正しい**。帯の上限3,000万円をわずかに超えるため ÷10 されていた。
    expect(at("6080", 2019)).toBe(31093000);
    expect(at("6080", 2022)).toBe(31613000);

    // **ホットリンク2018の320万円は直さない。** 前後が約600万円で浮いて見えるが、
    // 有報が「平均年間給与（千円）3,205」と書いている実額（原文を確認済み）。
    // **浮いているというだけで直すと、実態のほうを消す。**
    expect(at("3680", 2018)).toBe(3205000);
  });

  it("AC-4: 欠けている年は null のまま（内挿しない）で、全年 null の会社は載せない", () => {
    const { years, byId } = result.history;
    // 途中の年が欠ける会社。前後の年から内挿していれば埋まっている。
    expect(byId["2117"][years.indexOf(2023)]).toBeNull();
    expect(byId["2117"][years.indexOf(2024)]).toBeNull();

    for (const values of Object.values(byId)) {
      expect(values.some((x) => x !== null)).toBe(true);
    }
  });

  /*
   * T3（#827・`docs/timeseries/spec.md` AC-15）。平均年齢は平均年収と同じ書類の同じ表から
   * 取っているので、**null の位置が1つでもずれていたら、どちらかを別の行から拾っている。**
   * 2017・2018年は本文の表から拾った値（`textblock.py`）なので、あり得る帯に入っていることも
   * 全件で見る。帯は実測（25.4〜60.6歳）の外側に置いた。**隣の年との飛びは見ない**——
   * 持株会社化で単体の従業員数が桁で変わった年は本当に10歳以上動く（オープンアップグループ
   * 35.7 → 50.5歳）。
   */
  it("AC-15: ageById は byId と同じ会社・同じ年に値を持ち、20〜70歳に入っている", () => {
    const { years, byId, ageById } = result.history;
    expect(Object.keys(ageById)).toEqual(Object.keys(byId));
    for (const [id, values] of Object.entries(byId)) {
      const ages = ageById[id];
      expect(ages.length).toBe(years.length);
      expect(ages.map((age) => age === null), id).toEqual(values.map((value) => value === null));
      for (const age of ages) {
        if (age === null) continue;
        expect(age, id).toBeGreaterThanOrEqual(20);
        expect(age, id).toBeLessThanOrEqual(70);
      }
    }
  });

  it("AC-15: 採用書類の年の平均年齢が companies.json の平均年齢と一致する（全社）", () => {
    const { years, byId, ageById } = result.history;
    const { rows, periods } = result.companies;

    // AC-3（平均年収）と同じ突き合わせ。**年は平均年収が一致した年で決める**——決算期の年と
    // その翌年のどちらが採用書類かは、平均年収の側で既に確かめてある。
    let covered = 0;
    for (const row of rows) {
      const values = byId[row[0]];
      if (values === undefined) continue;
      const periodYear = Number(periods[row[9]].slice(0, 4));
      const k = [periodYear, periodYear + 1]
        .map((year) => years.indexOf(year))
        .find((i) => i >= 0 && values[i] === row[6]);
      expect(k, `${row[0]} の採用書類の年が見つからない`).toBeDefined();
      expect(ageById[row[0]][k!], `${row[0]}`).toBe(row[4]);
      covered += 1;
    }
    expect(covered).toBe(2961);
  });

  /*
   * T4（#835・`docs/timeseries/spec.md` AC-17）。在籍年数も平均年収と同じ書類の同じ表から
   * 取っている。**平均年齢と違い、平均年収のある年に空欄がありうる**（本文の表に勤続の列が
   * 無い書類）ので、見るのは「平均年収の無い年は在籍年数も無い」の片向きだけ。帯は抽出側の
   * 妥当性検査（`textblock._validate` の `0 <= 勤続 <= 年齢 - 15`）と同じ線にしてある。
   */
  it("AC-17: tenureById は byId と同じ会社を持ち、平均年収の無い年は在籍年数も無い", () => {
    const { years, byId, ageById, tenureById } = result.history;
    expect(Object.keys(tenureById)).toEqual(Object.keys(byId));
    for (const [id, values] of Object.entries(byId)) {
      const tenures = tenureById[id];
      expect(tenures.length).toBe(years.length);
      tenures.forEach((tenure, k) => {
        if (values[k] === null) expect(tenure, `${id} ${years[k]}`).toBeNull();
        if (tenure === null) return;
        expect(tenure, `${id} ${years[k]}`).toBeGreaterThanOrEqual(0);
        expect(tenure, `${id} ${years[k]}`).toBeLessThanOrEqual(ageById[id][k]! - 15);
      });
    }
  });

  it("AC-17: 採用書類の年の在籍年数が companies.json の在籍年数と一致する（全社）", () => {
    const { years, byId, tenureById } = result.history;
    const { rows, periods } = result.companies;

    // AC-15（平均年齢）と同じ突き合わせ。年は平均年収が一致した年で決める。
    let covered = 0;
    for (const row of rows) {
      const values = byId[row[0]];
      if (values === undefined) continue;
      const periodYear = Number(periods[row[9]].slice(0, 4));
      const k = [periodYear, periodYear + 1]
        .map((year) => years.indexOf(year))
        .find((i) => i >= 0 && values[i] === row[6]);
      expect(k, `${row[0]} の採用書類の年が見つからない`).toBeDefined();
      expect(tenureById[row[0]][k!], `${row[0]}`).toBe(row[5]);
      covered += 1;
    }
    expect(covered).toBe(2961);
  });

  /*
   * T4（AC-18）。業種の中央値を**同じ式で数え直して比べない**（写しになり、同じ勘違いを
   * すれば通る）。中央値であることの性質——その年に値を持つ同業の会社のうち、半分以上が
   * それ以下・半分以上がそれ以上——と、値を持つ会社が3社未満なら `null` であることを見る。
   */
  it("AC-18: 業種の中央値は、その年に値を持つ同業の会社の真ん中にある", () => {
    const { years, tenureById, tenureIndustryMedian } = result.history;
    const { industries, rows } = result.companies;
    expect(tenureIndustryMedian.length).toBe(industries.length);

    industries.forEach((industry, j) => {
      expect(tenureIndustryMedian[j].length, industry).toBe(years.length);
      years.forEach((year, k) => {
        const values = rows
          .filter((row) => row[2] === j)
          .map((row) => tenureById[row[0]]?.[k] ?? null)
          .filter((v): v is number => v !== null);
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
      expect(result.worklife.rows).toHaveLength(result.companies.rows.length);
      expect(result.worklife.notes).toHaveLength(result.companies.rows.length);

      const csv = parseCsv(readFileSync(join(ROOT, "data/worklife_2026.csv"), "utf-8"));
      const header = csv[0];
      const byId = new Map<string, Record<string, string>>();
      for (const line of csv.slice(1)) {
        const cells: Record<string, string> = {};
        header.forEach((name, i) => (cells[name] = line[i] ?? ""));
        byId.set(cells.id, cells);
      }

      let matched = 0;
      result.companies.rows.forEach((company, i) => {
        const cells = byId.get(String(company[0]));
        if (cells === undefined) {
          // 持株会社（三菱UFJ など）は法人番号で突合できない（ADR-0009）。
          expect(result.worklife.rows[i], company[1]).toBe(0);
          expect(result.worklife.notes[i], company[1]).toBe(0);
          return;
        }
        matched += 1;
        const decoded = decodeRow(result.worklife.rows[i] as WorklifeRow, result.worklife.pool);
        expect(decoded.overtimeAll).toBe(cells.overtime_all === "" ? null : Number(cells.overtime_all));
        expect(decoded.asOf).toBe(cells.as_of);
        expect(result.worklife.notes[i]).toBe(cells.wage_gap_note === "" ? 0 : cells.wage_gap_note);
      });
      // CSV の行はすべて掲載社に当たる（当たらなければ `buildWorklife` が落ちる）。
      expect(matched).toBe(byId.size);
    });
  });

  /**
   * 稼ぐ力＝一人当たり経常利益（P0・#155・`docs/performance/spec.md` AC-1〜AC-3）。
   * AC-4（gzip の上限）は `buildData` が検める。
   */
  describe("performance.json", () => {
    const indexOf = (id: string) => result.companies.rows.findIndex((row) => row[0] === id);

    it("AC-1 2,959社ぶんの値が入る", () => {
      // **欠損0件。** 経常利益の要素名は3つの綴りがあり（`OrdinaryIncomeLoss` /
      // `OrdinaryIncome` / 会社独自の名前空間の `OrdinaryProfit`）、標準名だけを
      // 見ていた頃は13書類が取れず、東京製鐵は2013〜2017年しか残らなかった。
      // 経常利益そのものは全社で取れる。**2社だけ落としている**（弘電社・
      // キクカワエンタープライズ）——最後に開示したのが8年前で、「直近5期」が
      // 2014〜2018年になってしまう会社。**母集団を 1,867 → 2,961社に広げても
      // 2社のまま**（E6・#182。広げる前は 1,865/1,867 だった）。
      expect(result.performance.meta.matched).toBe(2959);
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
      // ソフトバンクグループ。5期の中央値が負になる会社は136社ある
      // （E6・#182 で母集団を広げる前は59社）。
      expect(result.performance.perEmployee[indexOf("9984")]).toBeLessThan(0);
      expect(result.performance.perEmployee.filter((v) => v !== null && v < 0).length).toBe(136);
    });

    it("AC-3 連結の従業員数が無い会社は単体で代用する", () => {
      // `sourceRows` と `companies.rows` は同じ並びなので添字がそのまま使える。
      const missing = sourceRows.flatMap((row, i) => (row.employeesConsolidated === null ? [i] : []));
      expect(missing.length).toBe(371);
      // 代用しないとこの371社が丸ごと欠ける。**埋まらない1社は、稼ぐ力そのものを
      // 落とした2社（最後の開示が8年前）のうちの1社**。
      const filled = missing.filter((i) => result.performance.perEmployee[i] !== null);
      expect(filled.length).toBe(370);
    });

    it("業種中央値が industries と同じ並びで欠けがなく、平均ではなく中央値で、業種間で桁が違う", () => {
      const { industryMedian } = result.performance;
      expect(industryMedian.length).toBe(result.companies.industries.length);
      const medians = industryMedian.filter((v): v is number => v !== null);
      expect(medians.length).toBe(industryMedian.length);

      // **中央値であって平均ではない**——電気機器はキーエンスが桁で外れる。
      // E6（#182）で母集団を広げて 191万 → 214万円になった。
      const electric = industryMedian[result.companies.industries.indexOf("電気機器")]!;
      expect(electric).toBe(2144889);
      expect(result.performance.perEmployee[indexOf("6861")]! / electric).toBeGreaterThan(15);

      // **併記が要る理由。** どの業種が端に来るかは母集団で入れ替わる——E6（#182）で
      // 広げる前は 海運業 2,524万 / 輸送用機器 131万 の19倍だったが、いまの端は
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
    const indexOf = (id: string) => result.companies.rows.findIndex((row) => row[0] === id);

    it("4軸の順位だけを companies.rows と同じ並びで持つ（平均年収の軸と値そのものは持たない）", () => {
      const AXES = ["paidLeave", "tenure", "profit", "overtime"] as const;
      expect(result.radar.meta.axes).toEqual([...AXES]);
      // 値は別のファイルから引ける。二重に持つと `radar.json` の `JSON.parse` が倍になる
      // （0.264ms → 0.524ms）。平均年収は表示基準で変わるので `stats.json` から出す。
      expect(Object.keys(result.radar).sort()).toEqual([...AXES, "meta"].sort());
      for (const key of AXES) {
        expect(Object.keys(result.radar[key]).sort(), key).toEqual(["population", "rank"]);
        expect(result.radar[key].rank.length, key).toBe(result.companies.rows.length);
      }
    });

    // **母集団を広げると公表率は下がる**（E2・E5）。新しく入った会社には非上場・
    // 新規上場が多く、女性活躍DBへの掲載が任意なため——有給 42.8%・残業 48.0%。
    it("母集団は軸ごとに違う（有給と残業は掲載が任意なので半数に満たない）", () => {
      expect(result.radar.tenure.population).toBe(2961);
      // E6（#182）で母集団に追随させて 1,865 → 2,959社になった。
      expect(result.radar.profit.population).toBe(2959);
      // 値のある区分を1つでも持てば軸に乗る（全体値 → 無ければ先頭の区分）。
      // W2（#185）で 0 と入力ミスの100%を落とし（1,266 → 1,264・1,420 → 1,413）、
      // W3（#802）で区分が2つ以上の会社も乗せた（有給 +222社・残業 +112社）。
      expect(result.radar.paidLeave.population).toBe(1486);
      expect(result.radar.overtime.population).toBe(1525);
    });

    it("キーエンスは残業が掲載なし、有給は区分1つぶんが乗る", () => {
      const i = indexOf("6861");
      expect(result.radar.overtime.rank[i]).toBe(-1);
      // 区分「正社員」1件だけなので軸に乗る（アートボード 6a がそう描いている）。
      expect(result.radar.paidLeave.rank[i]).toBeGreaterThan(0);
    });

    it("区分が2つ以上の会社は先頭の区分で軸に乗る（新日本空調の有給・W3）", () => {
      // 営業・管理系 67.4 / 技術系 60.8。~~どちらかを代表に選ばない~~（W2 まで）
      // → 先頭の 67.4 で順位を決める。平均の 64.1 にはしない。
      // 先頭を採る（平均しない）ことは `web/features/company/lib/radar.test.ts` が
      // 固定している。ここは実データで軸に乗ることだけを見る。
      expect(result.radar.paidLeave.rank[indexOf("1952")]).toBeGreaterThan(0);
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
    it("年は平均年収の推移と同じ10年で、キーは companies.json の id、3本とも years と同じ長さ", () => {
      // **年の範囲は `history.json` に合わせる。** CSV には2013年まで入っているが、
      // 平均年収推移の直後に置いて同じ10年を見比べる節なので、横軸が揃わないと読めない。
      const { years, profit, income, employees } = result.profitHistory;
      expect(years).toEqual(result.history.years);
      const ids = new Set(result.companies.rows.map((row) => row[0]));
      for (const id of Object.keys(profit)) {
        expect(ids.has(id), id).toBe(true);
        expect(profit[id].length, id).toBe(years.length);
        expect(income[id].length, id).toBe(years.length);
        expect(employees[id].length, id).toBe(years.length);
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
    /**
     * **CSV の説明文がある行はすべて掲載社に当たる。** 当たらない行があるのは
     * 突合キー（`edinet_code`）か母集団が変わったときで、`buildSummaries` はそこで
     * 落ちる——**落とさないと「説明文の無い会社」として静かに配ることになる。**
     */
    it("キーは companies.json の id で、説明文のある CSV の行がすべて掲載社に当たる", () => {
      const ids = new Set(result.companies.rows.map((row) => row[0]));
      for (const id of Object.keys(result.summaries.byId)) {
        expect(ids.has(id), id).toBe(true);
      }
      const csv = parseCsv(readFileSync(join(ROOT, "data/company_summary_2026.csv"), "utf-8"));
      const summaryIndex = csv[0].indexOf("summary");
      const written = csv.slice(1).filter((line) => (line[summaryIndex] ?? "") !== "").length;
      expect(Object.keys(result.summaries.byId)).toHaveLength(written);
      expect(written).toBe(2783);
    });

    /** **空文字はキーごと落とす**（`undefined` がそのまま「説明文が無い」を表す）。 */
    it("説明文の無い会社はキーごと無い", () => {
      // 東京海上ホールディングス（8766）は C6 の目視レビューで型⑪に落ち、
      // 原文の事業の中身が1文ぶんしかないので空が正しいと判定した会社。
      expect(result.summaries.byId["8766"]).toBeUndefined();
      expect(result.summaries.byId["6861"]).toContain("電子応用機器");
    });

    /** 規格（`docs/company/spec.md` 1.18）。C6 の機械ゲートが通した結果を再確認する。 */
    it("全件が全角60〜130字に収まる", () => {
      for (const [id, text] of Object.entries(result.summaries.byId)) {
        const width = [...text].reduce(
          (sum, ch) => sum + (/[ -~｡-ﾟ]/.test(ch) ? 0.5 : 1),
          0
        );
        expect(width, `${id}: ${text}`).toBeGreaterThanOrEqual(60);
        expect(width, `${id}: ${text}`).toBeLessThanOrEqual(130);
      }
    });
  });

  /**
   * 有報の書類 ID（C13・Issue #814）。企業詳細が EDINET の書類閲覧ページへのリンクにする。
   * **実測値の4項目を取った書類そのもの**でなければならないので、CSV の `doc_id` と行ごとに
   * 突き合わせる——行がずれると別の会社の有報へ飛ばすことになる。**URL は持たない**
   * （組み立ては web の1か所）ので、値は書類 ID そのものと一致する。
   */
  describe("filings.json", () => {
    it("全社に書類 ID があり、その会社の平均年間給与を取った書類（CSV の doc_id）を指す", () => {
      expect(Object.keys(result.filings.byId)).toHaveLength(result.companies.rows.length);
      result.companies.rows.forEach((row, i) => {
        expect(result.filings.byId[row[0] as string], row[1] as string).toBe(sourceRows[i].docId);
      });
      // キーエンス。E2E（`web/e2e/company-filing.spec.ts`）が同じ値でリンク先を見ている。
      expect(result.filings.byId["6861"]).toBe("S100YAHE");
    });
  });
});

/**
 * 決算期の幅（E1・`docs/expansion/spec.md` 1.4）。`buildData` を通さずに境界だけを見る。
 */
describe("fiscalPeriodRange", () => {
  const rows = (...periods: string[]) => periods.map((periodEnd) => ({ periodEnd }));

  it.each([
    ["並び順によらず最古と最新を返す", ["2026-03-31", "2026-03-20", "2026-04-20"], "2026-03", "2026-04"],
    // **旧ガード（最頻が過半に届かなければ落とす）は通ってしまう分布**。母集団を
    // 広げると3月期は 63.5% で、1,081社の決算期が違うまま代表を名乗ることになる。
    // 幅で出すならこれは正常系。
    ["最頻が過半に届かなくても落ちない", ["2026-03-31", "2026-04-20", "2026-05-31"], "2026-03", "2026-05"],
    // 拡大後の実測の端（ニデックの2025-03期 〜 2026-05期 = 15か月）。
    ["拡大後の15か月の幅は通る", ["2025-03-31", "2026-05-31"], "2025-03", "2026-05"],
  ])("%s", (_, periods, from, to) => {
    expect(fiscalPeriodRange(rows(...periods))).toEqual({ from, to });
  });

  it.each([
    // 代表の過半チェックを外したぶんのガード（ADR-0011 の窓が壊れたことに気づく）。
    ["幅が24か月を超えたら落とす", ["2024-03-31", "2026-04-20"], /幅が広すぎます/],
    ["period_end の形が違えば落とす", ["2026/03/31"], /YYYY-MM-DD/],
    ["行が無ければ落とす", [], /行がありません/],
  ])("%s", (_, periods, message) => {
    expect(() => fiscalPeriodRange(rows(...periods))).toThrow(message);
  });
});
