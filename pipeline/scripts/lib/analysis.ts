/**
 * 有報の要約と AI 分析（`analyses.json`）を組む純関数。C10・Issue #242（親 #214・ADR-0015）。
 *
 * 生成物（`pipeline/data/company_analysis_2026.csv`）は C9 が作った。ここでは**表示に
 * 要る形へ直すだけ**で、文そのものは書き換えない——例外は下の `dropRepeatedHeadline`
 * の1つだけ。
 */

/** 分析が参照した外部の文書（ADR-0015 決定4）。`accessed` は `YYYY-MM-DD`。 */
export interface AnalysisSource {
  url: string;
  title: string;
  accessed: string;
}

/** 1社ぶん。**要約と分析は対**（AC-28）なので、片方だけの記録は作らない。 */
export interface AnalysisRecord {
  /** 有報の4節の要約。評価語を書かない（ADR-0010 の線）。 */
  digest: string;
  /** 分析の一言（「ひとことで言うと」）。 */
  headline: string;
  /** 分析の本文。 */
  body: string;
  sources: AnalysisSource[];
}

/**
 * 分析の本文が一言と同じ文で始まっていたら、本文の1文目を落とす。
 *
 * **2,961社中29社で、一言がそのまま本文の書き出しになっていた**（伊藤忠ほか）。画面では
 * 「ひとことで言うと」の枠のすぐ下に本文が続くので、同じ文が2回並ぶ。**生成をやり直さず
 * 表示の形で直す**——一言は本文の要約なので、書き出しの文が一言と同じなら落としても
 * 本文から失われる主張は無い（1文目の語尾が「〜一年である。」のように一言より少し
 * 長い会社があるが、言っていることは同じ）。
 *
 * 判定は一言の句点を除いた文字列で本文が始まるか。**かぎ括弧の種類はそろえてから
 * 比べる**——伊藤忠（8001）は一言が『川下』、本文が「川下」で、そのままだと漏れる
 * （アートボード 8b の注記が名指ししていた会社。そろえないと26社しか拾えない）。**言い換えは落とさない**
 * ——「〜に乗っている会社で、今期の減益は〜」と「〜に乗っている会社だ。〜」のように
 * 書き出しが似ているだけの会社が28社あるが、一言の言い回しを本文が別の文で
 * 言い直すのは要約として正常で、機械的に線を引けない。
 */
export function dropRepeatedHeadline(headline: string, body: string): string {
  const stem = normalizeQuotes(headline.trim()).replace(/[。．]$/, "");
  if (stem === "" || !normalizeQuotes(body).startsWith(stem)) return body;
  const end = body.indexOf("。");
  if (end === -1) return body;
  const rest = body.slice(end + 1).trim();
  // 本文が1文しか無い会社で空にしない（その1文が一言と同じなら本文ごと残す）。
  return rest === "" ? body : rest;
}

/** 二重かぎ括弧を一重にそろえる（比べるときだけ。本文は書き換えない）。 */
function normalizeQuotes(text: string): string {
  return text.replace(/『/g, "「").replace(/』/g, "」");
}

/**
 * CSV の `sources` 列（JSON 配列）を読む。**形が崩れていたらビルドを落とす**——
 * 黙って空にすると「参照した資料が無い分析」として配られ、ADR-0015 決定4 の前提
 * （読者が開いて確かめられる）が崩れたことに気づけない。
 */
export function parseSources(raw: string, code: string): AnalysisSource[] {
  const text = raw.trim() === "" ? "[]" : raw;
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${code}: sources が配列ではありません`);
  }
  return parsed.map((entry, i) => {
    const { url, title, accessed } = (entry ?? {}) as Record<string, unknown>;
    if (
      typeof url !== "string" ||
      !/^https?:\/\//.test(url) ||
      typeof title !== "string" ||
      title.trim() === "" ||
      typeof accessed !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(accessed)
    ) {
      throw new Error(`${code}: sources[${i}] の形が不正です（url・title・accessed が要る）`);
    }
    return { url, title: title.trim(), accessed };
  });
}

/**
 * CSV の1行から表示用の記録を作る。**要約か分析のどちらかが空なら `null`**——
 * 対で出す（AC-28）。いまの CSV は全社が両方を持つが、C9 の `pair_or_drop` は
 * 片方が落ちたら両方を空にする契約なので、ここでも同じ線で読む。
 */
export function toAnalysisRecord(
  line: { digest: string; headline: string; body: string; sources: string },
  code: string
): AnalysisRecord | null {
  const digest = line.digest.trim();
  const headline = line.headline.trim();
  const body = line.body.trim();
  if (digest === "" || headline === "" || body === "") return null;
  return {
    digest,
    headline,
    body: dropRepeatedHeadline(headline, body),
    sources: parseSources(line.sources, code),
  };
}
