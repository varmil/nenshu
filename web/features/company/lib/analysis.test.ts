import { describe, it, expect } from "vitest";
import { analyses as analysesData } from "@/testing/realData";
import {
  analysisNote,
  buildAnalysisView,
  digestNote,
  sourceMeta,
  type AnalysisRecord,
} from "./analysis";

const analyses = analysesData.byId;

const record: AnalysisRecord = {
  digest: "要約。",
  headline: "一言。",
  body: "本文。",
  sources: [
    {
      url: "https://www.mitsui.com/jp/ja/release/a.html",
      title: "お知らせ",
      accessed: "2026-09-08",
    },
  ],
  generatedAt: "2026-09",
  filing: { docId: "S100TEST", period: "2025-03" },
};

describe("buildAnalysisView（AC-28）", () => {
  it("要約と分析がそろっていればビューを作る", () => {
    const view = buildAnalysisView(record)!;
    expect(view.digest).toBe("要約。");
    expect(view.headline).toBe("一言。");
    expect(view.sources[0].meta).toBe("www.mitsui.com・2026年9月8日に参照");
  });

  // refresh の D3（spec 1.5・AC-3）。要約の節も分析の節も、数字の側ではなく原文の期を名乗る。
  it("原文にした有報の書類と決算期を持つ", () => {
    const view = buildAnalysisView(record)!;
    expect(view.docId).toBe("S100TEST");
    expect(view.fiscalPeriod).toBe("2025年3月期");
    expect(digestNote(view.fiscalPeriod)).toMatch(/^2025年3月期の有価証券報告書のうち/);
    expect(analysisNote(view.fiscalPeriod)).toMatch(
      /^2025年3月期の有価証券報告書・公開資料をもとに/
    );
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
  // 2026-10-10・運営者の判断。書いた年月は出さない——前の期の有報で書いた分析が新しく見え、
  // 決算期と並べると日付が2つになる。
  it("分析の断りは原文の決算期で始まり、書いた年月を持たない", () => {
    const note = analysisNote("2025年6月期");
    expect(note).toMatch(/^2025年6月期の有価証券報告書・公開資料をもとにAIが書いた評価です。$/);
    expect(note).not.toContain("時点");
    expect(note).not.toMatch(/\d{4}年\d{1,2}月(?!期)/);
  });

  it("要約の説明に原文の決算期が入る。会社ごとに違う値が出る", () => {
    expect(digestNote("2026年3月期")).toMatch(/^2026年3月期の有価証券報告書/);
    expect(digestNote("2025年12月期")).toMatch(/^2025年12月期の有価証券報告書/);
  });
});

describe("sourceMeta", () => {
  it("ドメインと参照した日を1行にする。月日はゼロ埋めしない", () => {
    expect(
      sourceMeta({
        url: "https://www.hulic.co.jp/ir/hulictown/",
        title: "x",
        accessed: "2026-09-08",
      })
    ).toBe("www.hulic.co.jp・2026年9月8日に参照");
  });
});

/*
 * 実データ（`analyses.json`）に対して。**記録のある会社は両方を持つ**ことと、**一言が本文の
 * 書き出しに繰り返されていない**こと（ビルド時の `dropRepeatedHeadline`）。
 *
 * **掲載の全社が持つとは限らない。** 新しく載った会社は、分析を書くまで要約も分析も持たない
 * （`docs/refresh/spec.md` 1.9）。見るのは「要約と分析は対で、片方だけの会社は無い」こと。
 */
describe("analyses.json", () => {
  it("記録のある会社は要約と分析の両方を持つ（片方だけの会社は無い）", () => {
    const entries = Object.entries(analyses);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(buildAnalysisView(entry), id).not.toBeNull();
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
      expect(norm(entry.body).startsWith(norm(entry.headline).replace(/[。．]$/, "")), id).toBe(
        false
      );
    }
  });
});
