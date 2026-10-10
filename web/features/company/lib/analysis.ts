/**
 * 有報の要約と AI 分析（C10・Issue #242・親 #214、`docs/company/spec.md` 1.19・AC-28〜AC-30、
 * [ADR-0015](../../../../docs/adr/0015-company-analysis-subjectivity.md)）。
 *
 * **2つの節は島の props に載せない。** `[id].astro` が静的な HTML として描き、Astro の
 * 名前付きスロットで島に差し込む（`CompanyDetailIsland` の `analysis`・`digest`）。
 * 島の props は HTML の属性に直列化されるので、props で渡すと**同じ文章が props と本文の
 * 2か所に入る**——1社あたり約2.4KB（要約400字＋分析360字）。どちらの節も表示基準で
 * 変わらない（AC-30）ので、クライアントが持つ理由が無い。
 */

import type { FilingRef } from "@/lib/data/sources";
import { periodLabel } from "@/lib/data/period";

/** 分析が参照した外部の文書。`accessed` は `YYYY-MM-DD`。 */
export interface AnalysisSource {
  url: string;
  title: string;
  accessed: string;
}

/** `analyses.json` の1社ぶん（`pipeline/scripts/lib/analysis.ts` の `AnalysisRecord` と同じ形）。 */
export interface AnalysisRecord {
  digest: string;
  headline: string;
  body: string;
  sources: AnalysisSource[];
  /** 分析を書いた年月（`YYYY-MM`・日本時間）。**画面には出さない**（`analysisNote`）。 */
  generatedAt: string;
  /** 要約と分析の原文にした有報（refresh の D3）。 */
  filing: FilingRef;
}

export interface AnalysisView {
  /** 有報の4節の要約。評価語を書かない（ADR-0010 の線がそのまま効く）。 */
  digest: string;
  /** 分析の一言。「ひとことで言うと」の枠に入れる。 */
  headline: string;
  /** 分析の本文。一言と同じ書き出しの文はビルド時に落としてある。 */
  body: string;
  sources: AnalysisSourceView[];
  /** 要約と分析の原文にした有報の書類 ID。「このページの出典」の AI の2行がここを指す。 */
  docId: string;
  /**
   * 要約と分析の原文にした有報の決算期（`2026年3月期`）。**要約の節も分析の節もこれを名乗る**
   * （refresh の D3・spec 1.5。分析は 2026-10-10 から）——数字の側の決算期を借りると、数字だけが
   * 新しい書類に替わった会社で、前の期の文章が新しい期を名乗る。
   */
  fiscalPeriod: string;
}

export interface AnalysisSourceView {
  url: string;
  title: string;
  /** `www.mitsui.com・2026年9月8日に参照`。 */
  meta: string;
}

/**
 * 記録が無い会社、または要約と分析のどちらかが空の会社では `null`。**対で出す**（AC-28）
 * ——片方だけのページを作らない。分岐をここに閉じるのは C7 の `buildSummaryView` と同じ
 * 理由で、「何も出ない」ことを純関数のテストで固定するため。
 */
export function buildAnalysisView(record: AnalysisRecord | null | undefined): AnalysisView | null {
  if (!record) return null;
  const digest = record.digest.trim();
  const headline = record.headline.trim();
  const body = record.body.trim();
  if (digest === "" || headline === "" || body === "") return null;
  return {
    digest,
    headline,
    body,
    sources: record.sources.map((source) => ({
      url: source.url,
      title: source.title,
      meta: sourceMeta(source),
    })),
    docId: record.filing.docId,
    fiscalPeriod: periodLabel(record.filing.period),
  };
}

/**
 * 出典の下に添える1行。**ドメインと参照した日**（C10 の未決事項を決めた）。
 *
 * データは年1回の更新なので、ニュースリリースは1年後に消えていることがある。**切れた
 * リンクを検出して落とすことはしない**——参照した日が読めれば、開いて404でも「その日には
 * あった」と読める。ドメインを出すのは、開く前に誰の文書かが分かるようにするため
 * （出所の信頼性は読者が評価してよい・ADR-0015 決定4）。
 */
export function sourceMeta(source: AnalysisSource): string {
  return `${new URL(source.url).hostname}・${accessedLabel(source.accessed)}に参照`;
}

function accessedLabel(accessed: string): string {
  const [y, m, d] = accessed.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/**
 * 分析の節の断り（AC-29）。**要約の節には置かない**——あちらは有報に書いてある事実なので、
 * 同じ断りを付けると2つの区別が消える。**見出しに「AIによる分析」を付けない**のは、
 * この1行と合わせて AI である旨を2回言うことになるため（アートボード 8b）。
 *
 * **先頭に原文の決算期を書く。書いた年月は出さない**（2026-10-10・運営者の判断）。毎日の更新では
 * 数字が先に新しい有報へ替わり、分析は書き直すまで前の有報のまま出る。書いた年月を出していた頃は、
 * 前の期の有報で書いた分析が「2026年9月時点」と新しく見え、決算期と並べると日付が2つになって
 * 読みにくかった。新しい有報が出るたびに書き直すので、いつの評価かは原文の決算期で読める。
 * 公開資料の時点は「参照した資料」の参照日（`sourceMeta`）が持つ。書いた年月はデータ
 * （`AnalysisRecord.generatedAt`）には残す。
 */
export function analysisNote(fiscalPeriod: string): string {
  return `${fiscalPeriod}の有価証券報告書・公開資料をもとにAIが書いた評価です。`;
}

/**
 * 要約の節の説明。**C7 の説明文の出典（「事業の内容」をもとに要約）と重ならない言い方**
 * にする。
 *
 * **原文の決算期をここに書く**（2026-09-24・運営者の判断で S3 の「1画面に1回」を改めた。
 * `docs/site-chrome/spec.md` 5.1）。どの年度の有報を要約したのかが節の中で読めることが
 * 信頼性に効く。決算期を持つもう1つの節は直後の「年収に関するQ&A」（C16・#838。C15 までは
 * 離れた位置の「有価証券報告書の実測値」の見出し）で、それぞれが自分の節の中身の時点を言う。
 * **値は要約の原文の決算期**（`AnalysisView.fiscalPeriod`。refresh の D3）。Q&A の決算期とは
 * 違いうる——毎日の更新では数字が先に新しい書類へ替わり、要約は書き直すまで前の書類のまま出る。
 */
export function digestNote(fiscalPeriod: string): string {
  return `${fiscalPeriod}の有価証券報告書のうち「経営成績の分析」「事業等のリスク」「対処すべき課題」「サステナビリティ」の4節に書いてある事実だけをまとめたものです。`;
}
