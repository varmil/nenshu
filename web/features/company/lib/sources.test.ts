import { describe, expect, it } from "vitest";
import { PRIMARY_SOURCES, edinetDocumentUrl } from "@/lib/data/sources";
import { buildSourceRows, type PageSources, type SourceSegment } from "./sources";

/** すべての節がそろい、文章も数字と同じ有報から作った会社。 */
const ALL: PageSources = {
  history: true,
  tenureHistory: true,
  filingDocId: "S100YAHE",
  summaryDocId: "S100YAHE",
  analysisDocId: "S100YAHE",
  payPolicyDocId: "S100YAHE",
};

/** 行の出典の中の、有報の書類へのリンク。 */
const docLinks = (row: ReturnType<typeof buildSourceRows>[number]) =>
  row.source.flatMap((s) => (typeof s !== "string" && "url" in s ? [s.url] : []));

const byKind = (rows: ReturnType<typeof buildSourceRows>, kind: string) =>
  rows.find((r) => r.kind === kind)!;

const text = (segments: SourceSegment[]) =>
  segments
    .map((s) =>
      typeof s === "string" ? s : "source" in s ? PRIMARY_SOURCES[s.source].name : s.text
    )
    .join("");

describe("buildSourceRows（C12・AC-16）", () => {
  it("すべての節がある会社では7区分を決めた順に並べる", () => {
    expect(buildSourceRows(ALL).map((r) => r.label)).toEqual([
      "原文",
      "実測値",
      "計算値",
      "推定値",
      "自己申告値",
      "AIの要約",
      "AIの評価",
    ]);
  });

  it("一次情報にリンクする。有報はトップではなくその会社の書類へ（C13）", () => {
    const linked = buildSourceRows(ALL).flatMap((r) =>
      r.source.flatMap((s) => (typeof s === "string" ? [] : ["source" in s ? s.source : s.url]))
    );
    // 有報を挙げる行（原文・実測値・AIの要約・AIの評価）は、どれもその会社の書類を指す。
    expect(linked).toEqual([
      edinetDocumentUrl("S100YAHE"),
      edinetDocumentUrl("S100YAHE"),
      "wageCensus",
      "positiveDb",
      edinetDocumentUrl("S100YAHE"),
      edinetDocumentUrl("S100YAHE"),
    ]);
  });

  /*
   * refresh の D3（spec 1.5・AC-3）。数字だけが新しい有報に替わり、文章がまだ前の有報のままの会社。
   * **行ごとに、その行の中身を作った書類を指す。**
   */
  it("数字と文章の書類がずれた会社では、行ごとにその中身を作った書類を指す", () => {
    const rows = buildSourceRows({
      ...ALL,
      filingDocId: "S100NEW1",
      summaryDocId: "S100OLD1",
      analysisDocId: "S100OLD1",
      payPolicyDocId: "S100OLD1",
    });
    expect(docLinks(byKind(rows, "measured"))).toEqual([edinetDocumentUrl("S100NEW1")]);
    for (const kind of ["original", "aiDigest", "aiAnalysis"]) {
      expect(docLinks(byKind(rows, kind)), kind).toEqual([edinetDocumentUrl("S100OLD1")]);
    }
  });

  it("説明文と要約の書類が違えば、AIの要約の行を分ける（1行ではどちらの書類か読めない）", () => {
    const digest = buildSourceRows({ ...ALL, summaryDocId: "S100OLD1" }).filter(
      (r) => r.kind === "aiDigest"
    );
    expect(digest.map((r) => [r.covers, docLinks(r)])).toEqual([
      ["社名の下の説明文", [edinetDocumentUrl("S100OLD1")]],
      ["「有価証券報告書の要約」", [edinetDocumentUrl("S100YAHE")]],
    ]);
    // 同じ書類なら1行に束ねる
    expect(buildSourceRows(ALL).filter((r) => r.kind === "aiDigest")).toHaveLength(1);
  });

  it("実測値の行の「有価証券報告書」が、渡した書類 ID の閲覧ページを指す", () => {
    const measured = byKind(buildSourceRows({ ...ALL, filingDocId: "S100YBLA" }), "measured");
    expect(measured.source).toContainEqual({
      text: "有価証券報告書",
      url: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100YBLA,,",
    });
  });

  it("出典の文は機関名と一次情報の名前を含む", () => {
    const rows = buildSourceRows(ALL);
    const by = (kind: string) => text(rows.find((r) => r.kind === kind)!.source);
    expect(by("measured")).toBe("金融庁 EDINET の有価証券報告書（単体）");
    expect(by("estimated")).toBe("実測値と、厚生労働省「賃金構造基本統計調査」の賃金カーブ");
    expect(by("selfReported")).toBe("厚生労働省「女性の活躍推進企業データベース」への登録値");
  });

  it("推移の無い会社では推移を挙げない", () => {
    const measured = byKind(
      buildSourceRows({ ...ALL, history: false, tenureHistory: false }),
      "measured"
    );
    expect(measured.covers).toBe("平均年収・平均年齢・在籍年数・従業員数");
    expect(byKind(buildSourceRows(ALL), "measured").covers).toContain("その推移");
  });

  it("在籍年数の推移がある会社では、在籍年数も推移にかけ、業種の中央値を計算値に挙げる（T4）", () => {
    const rows = buildSourceRows(ALL);
    expect(byKind(rows, "measured").covers).toBe(
      "平均年収・平均年齢・在籍年数とその推移・従業員数"
    );
    expect(byKind(rows, "computed").covers).toContain("業種の中央値");

    const without = buildSourceRows({ ...ALL, tenureHistory: false });
    const [measuredWithout, computedWithout] = [
      byKind(without, "measured"),
      byKind(without, "computed"),
    ];
    expect(measuredWithout.covers).toBe("平均年収・平均年齢とその推移・在籍年数・従業員数");
    expect(computedWithout.covers).not.toContain("業種の中央値");
  });

  it("説明文の無い会社では、AIの要約に説明文を挙げない", () => {
    const digest = buildSourceRows({ ...ALL, summaryDocId: null }).find(
      (r) => r.kind === "aiDigest"
    );
    expect(digest?.covers).toBe("「有価証券報告書の要約」");
  });

  it("要約と分析の無い会社では、AIの評価の行を出さず、AIの要約は説明文だけになる", () => {
    const rows = buildSourceRows({ ...ALL, analysisDocId: null });
    expect(rows.map((r) => r.kind)).not.toContain("aiAnalysis");
    expect(rows.find((r) => r.kind === "aiDigest")?.covers).toBe("社名の下の説明文");
  });

  it("AIの文章が1つも無い会社では、AIの2区分とも出さない", () => {
    const rows = buildSourceRows({ ...ALL, summaryDocId: null, analysisDocId: null });
    expect(rows.map((r) => r.label)).toEqual(["原文", "実測値", "計算値", "推定値", "自己申告値"]);
  });

  /*
   * 原文（C19・#852、spec 1.15・1.23）。**範囲の判定に生成AIを使ったことは、この行と `/about`
   * だけが言う**——給与の決定方針の節の中には「生成AI」の語を置かない。
   */
  it("給与の決定方針のある会社では原文を先頭に置き、有報の書類へリンクし、範囲の判定に生成AIを使ったと書く", () => {
    const original = buildSourceRows({ ...ALL, payPolicyDocId: "S100YBLA" })[0];
    expect(original.kind).toBe("original");
    expect(original.covers).toBe("給与の決定方針");
    expect(text(original.source)).toBe(
      "有価証券報告書の本文をそのまま（どこまでが給与の決定方針かは生成AIが判定）"
    );
    expect(original.source).toContainEqual({
      text: "有価証券報告書",
      url: edinetDocumentUrl("S100YBLA"),
    });
  });

  it("給与の決定方針の無い会社（改正前の様式・空）では原文の行を出さない", () => {
    expect(buildSourceRows({ ...ALL, payPolicyDocId: null }).map((r) => r.label)).toEqual([
      "実測値",
      "計算値",
      "推定値",
      "自己申告値",
      "AIの要約",
      "AIの評価",
    ]);
  });

  /*
   * 既存の規則との突き合わせ。**文言を直したときにここで気づけるようにする**——E2E でも
   * 見ているが、落ちたときに原因が遠い。区分名に「推定」を単独で置かない（AC-9）ことは、
   * 先頭のテストが区分名を並びごと固定しているので改めて見ない。
   */
  it("分析の断り（「AIが書いた評価」）を繰り返さない（AC-29）", () => {
    for (const row of buildSourceRows(ALL)) {
      expect(`${row.label}${row.covers}${text(row.source)}`).not.toContain("AIが書いた評価");
    }
  });

  it("AIの評価の材料は分析の節の断りと同じ2つ（有価証券報告書・公開資料）", () => {
    const analysis = buildSourceRows(ALL).find((r) => r.kind === "aiAnalysis")!;
    expect(text(analysis.source)).toBe("有価証券報告書・公開資料");
  });

  it("決算期を書かない（S3。企業詳細で認めているのは実測値の見出しと要約の説明の2か所だけ）", () => {
    for (const row of buildSourceRows(ALL)) {
      expect(`${row.covers}${text(row.source)}`).not.toMatch(/\d{4}年\d{1,2}月期/);
    }
  });
});
