import { describe, it, expect } from "vitest";
import analysesData from "../../../public/data/analyses.json";
import companiesData from "../../../public/data/companies.json";
import { analysisNote, asOfLabel, buildAnalysisView, digestNote, sourceMeta, type AnalysisRecord } from "./analysis";

const analyses = analysesData.byId as Record<string, AnalysisRecord>;

const record: AnalysisRecord = {
  digest: "要約。",
  headline: "一言。",
  body: "本文。",
  sources: [{ url: "https://www.mitsui.com/jp/ja/release/a.html", title: "お知らせ", accessed: "2026-09-08" }],
  generatedAt: "2026-09",
};

describe("buildAnalysisView（AC-28）", () => {
  it("要約と分析がそろっていればビューを作る", () => {
    const view = buildAnalysisView(record)!;
    expect(view.digest).toBe("要約。");
    expect(view.headline).toBe("一言。");
    expect(view.sources[0].meta).toBe("www.mitsui.com・2026年9月8日に参照");
    expect(view.asOf).toBe("2026年9月時点");
  });

  it("記録が無い会社では null（節ごと出さない）", () => {
    expect(buildAnalysisView(undefined)).toBeNull();
    expect(buildAnalysisView(null)).toBeNull();
  });

  it("要約か分析のどちらかが空なら対で null", () => {
    expect(buildAnalysisView({ ...record, digest: " " })).toBeNull();
    expect(buildAnalysisView({ ...record, headline: "" })).toBeNull();
    expect(buildAnalysisView({ ...record, body: "" })).toBeNull();
  });
});

describe("時点の表記", () => {
  it("分析は書いた年月。月はゼロ埋めしない", () => {
    expect(asOfLabel("2026-09")).toBe("2026年9月時点");
    expect(asOfLabel("2027-01")).toBe("2027年1月時点");
  });

  it("分析の断りに書いた時点が入る", () => {
    expect(analysisNote("2026年9月時点")).toContain("（2026年9月時点）");
  });

  it("要約の説明に原文の決算期が入る。会社ごとに違う値が出る", () => {
    expect(digestNote("2026年3月期")).toMatch(/^2026年3月期の有価証券報告書/);
    expect(digestNote("2025年12月期")).toMatch(/^2025年12月期の有価証券報告書/);
  });
});

describe("sourceMeta", () => {
  it("ドメインと参照した日を1行にする。月日はゼロ埋めしない", () => {
    expect(sourceMeta({ url: "https://www.hulic.co.jp/ir/hulictown/", title: "x", accessed: "2026-09-08" })).toBe(
      "www.hulic.co.jp・2026年9月8日に参照"
    );
  });
});

/*
 * 実データ（`analyses.json`）に対して。**全社が両方を持つ**ことと、**一言が本文の
 * 書き出しに繰り返されていない**こと（ビルド時の `dropRepeatedHeadline`。29社が該当した）。
 */
describe("analyses.json", () => {
  it("掲載の全社に要約と分析がある", () => {
    expect(Object.keys(analyses)).toHaveLength(companiesData.rows.length);
    for (const row of companiesData.rows) {
      expect(buildAnalysisView(analyses[row[0] as string]), String(row[0])).not.toBeNull();
    }
  });

  it("全社に書いた年月がある", () => {
    for (const [id, entry] of Object.entries(analyses)) {
      expect(entry.generatedAt, id).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
  });

  it("本文が一言と同じ文で始まる会社は無い", () => {
    for (const [id, entry] of Object.entries(analyses)) {
      const norm = (text: string) => text.replace(/『/g, "「").replace(/』/g, "」");
      expect(norm(entry.body).startsWith(norm(entry.headline).replace(/[。．]$/, "")), id).toBe(false);
    }
  });
});
