import { describe, expect, it } from "vitest";
import { PRIMARY_SOURCES } from "@/lib/data/sources";
import { buildSourceRows, type PagePresence, type SourceSegment } from "./sources";

const ALL: PagePresence = { history: true, summary: true, analysis: true };

const text = (segments: SourceSegment[]) =>
  segments.map((s) => (typeof s === "string" ? s : PRIMARY_SOURCES[s.source].name)).join("");

describe("buildSourceRows（C12・AC-16）", () => {
  it("すべての節がある会社では6区分を決めた順に並べる", () => {
    expect(buildSourceRows(ALL).map((r) => r.label)).toEqual([
      "実測値",
      "計算値",
      "推定値",
      "自己申告値",
      "AIの要約",
      "AIの評価",
    ]);
  });

  it("一次情報3つにリンクする", () => {
    const linked = buildSourceRows(ALL).flatMap((r) =>
      r.source.flatMap((s) => (typeof s === "string" ? [] : [s.source]))
    );
    expect(linked).toEqual(["edinet", "wageCensus", "positiveDb"]);
  });

  it("出典の文は機関名と一次情報の名前を含む", () => {
    const rows = buildSourceRows(ALL);
    const by = (kind: string) => text(rows.find((r) => r.kind === kind)!.source);
    expect(by("measured")).toBe("金融庁 EDINET の有価証券報告書（単体）");
    expect(by("estimated")).toBe("実測値と、厚生労働省「賃金構造基本統計調査」の賃金カーブ");
    expect(by("selfReported")).toBe("厚生労働省「女性の活躍推進企業データベース」への登録値");
  });

  it("推移の無い会社では推移を挙げない", () => {
    const measured = buildSourceRows({ ...ALL, history: false })[0];
    expect(measured.covers).toBe("平均年収・平均年齢・在籍年数・従業員数");
    expect(buildSourceRows(ALL)[0].covers).toContain("その推移");
  });

  it("説明文の無い会社では、AIの要約に説明文を挙げない", () => {
    const digest = buildSourceRows({ ...ALL, summary: false }).find((r) => r.kind === "aiDigest");
    expect(digest?.covers).toBe("「有価証券報告書の要約」");
  });

  it("要約と分析の無い会社では、AIの評価の行を出さず、AIの要約は説明文だけになる", () => {
    const rows = buildSourceRows({ ...ALL, analysis: false });
    expect(rows.map((r) => r.kind)).not.toContain("aiAnalysis");
    expect(rows.find((r) => r.kind === "aiDigest")?.covers).toBe("社名の下の説明文");
  });

  it("AIの文章が1つも無い会社では、AIの2区分とも出さない", () => {
    const rows = buildSourceRows({ history: true, summary: false, analysis: false });
    expect(rows.map((r) => r.label)).toEqual(["実測値", "計算値", "推定値", "自己申告値"]);
  });

  /*
   * 既存の規則との突き合わせ。**文言を直したときにここで気づけるようにする**——E2E でも
   * 見ているが、落ちたときに原因が遠い。
   */
  it("「推定」を単独の語として置かない（AC-9）", () => {
    for (const row of buildSourceRows(ALL)) {
      expect(row.label).not.toBe("推定");
    }
  });

  it("分析の断り（「AIが書いた評価」）を繰り返さない（AC-29）", () => {
    for (const row of buildSourceRows(ALL)) {
      expect(`${row.label}${row.covers}${text(row.source)}`).not.toContain("AIが書いた評価");
    }
  });

  it("決算期を書かない（S3。企業詳細で認めているのは実測値の見出しと要約の説明の2か所だけ）", () => {
    for (const row of buildSourceRows(ALL)) {
      expect(`${row.covers}${text(row.source)}`).not.toMatch(/\d{4}年\d{1,2}月期/);
    }
  });
});
