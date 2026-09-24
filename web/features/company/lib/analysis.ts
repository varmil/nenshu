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
}

export interface AnalysisView {
  /** 有報の4節の要約。評価語を書かない（ADR-0010 の線がそのまま効く）。 */
  digest: string;
  /** 分析の一言。「ひとことで言うと」の枠に入れる。 */
  headline: string;
  /** 分析の本文。一言と同じ書き出しの文はビルド時に落としてある。 */
  body: string;
  sources: AnalysisSourceView[];
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
 */
export const ANALYSIS_NOTE = "有価証券報告書・このページの数値・公開資料をもとにAIが書いた評価です。";

/**
 * 要約の節の説明。**C7 の説明文の出典（「事業の内容」をもとに要約）と重ならない言い方**
 * にする。決算期は書かない（「有価証券報告書の実測値」の見出しが持っている・S3）。
 */
export const DIGEST_NOTE =
  "「経営成績の分析」「事業等のリスク」「対処すべき課題」「サステナビリティ」の4節に書いてある事実だけをまとめたものです。";
