import { edinetDocumentUrl, type PRIMARY_SOURCES } from "@/lib/data/sources";

/**
 * 「このページの出典」の行（C12・Issue #805、`docs/company/spec.md` 1.15・AC-16）。
 *
 * **区分の軸は加工の度合い。** 節の並び順ではなく、実測値・計算値・推定値・自己申告値・
 * AIの要約・AIの評価の6つで束ねる。読者が知りたいのは「この数字をどこまで信じてよいか」
 * で、「推定値と実測値を同じ書式で並べない」（CLAUDE.md）をページ単位で見える形にする。
 *
 * **要約と分析は別の区分にする。** どちらも生成AIの文章だが、書いてよいことの線が違う
 * （ADR-0015 決定5）。1行に束ねると、2つを見分けられることという AC-29 の前提がこの節で
 * 崩れる。
 *
 * **ページに出ていないものは挙げない。** 会社ごとに変わるのは「その節があるかどうか」
 * だけなので、有無を受け取って文言と行を決める純関数にしてある——出ていないことを
 * コンポーネントの中の分岐で書くと、テストで固定しにくい（`summary.ts` と同じ理由）。
 *
 * **時点は書かない。** 決算期は「有価証券報告書の実測値」の見出しと要約の節の説明が
 * 持っている（`docs/site-chrome/spec.md` 5.1 が企業詳細で認めているのはこの2か所だけで、
 * ここに書くと3回目になる）。女性活躍DBの集計時点、分析を書いた年月と参照日も、それぞれの
 * 節にある。
 */

export type SourceKind =
  | "measured"
  | "computed"
  | "estimated"
  | "selfReported"
  | "aiDigest"
  | "aiAnalysis";

/**
 * 出典の文の切れ端。文字列はそのまま、`source` は一次情報（全ページ共通）へのリンク、
 * `url` はその会社だけのリンク（C13・有報の書類閲覧ページ）になる。
 */
export type SourceSegment =
  | string
  | { source: keyof typeof PRIMARY_SOURCES }
  | { text: string; url: string };

export interface SourceRow {
  kind: SourceKind;
  /** 区分の名前（`dt`）。 */
  label: string;
  /** その区分に該当する、このページに出ているもの。 */
  covers: string;
  /** どこから来たか。 */
  source: SourceSegment[];
}

/** 会社によって、あったり無かったりする節。 */
export interface PagePresence {
  /** 平均年収推移（過去10年間）。 */
  history: boolean;
  /** 社名の下の説明文（C7。178社に無い）。 */
  summary: boolean;
  /** 「有価証券報告書の要約」と「現状と今後」。**2つは対**（AC-28）なので1つで持つ。 */
  analysis: boolean;
  /** 実測値の4項目を取った有報の書類 ID（C13）。全社にある。 */
  filingDocId: string;
}

/*
 * 文言は **PC の本文幅（652px・12px の字で約46字）に1行で収まる**長さを目安にしてある。
 * 運営者の指摘は「補足説明に過ぎないのにスペースを取りすぎ」で、作り替える前の3ステップ
 * （PC 260px・モバイル 580px）より高くしないことを E2E が固定している。
 */
export function buildSourceRows(presence: PagePresence): SourceRow[] {
  const rows: SourceRow[] = [
    {
      kind: "measured",
      label: "実測値",
      // 推移の表は平均年齢も年ごとに出す（T3・#827）ので、「その推移」は2つにかかる。
      covers: presence.history
        ? "平均年収・平均年齢とその推移・在籍年数・従業員数"
        : "平均年収・平均年齢・在籍年数・従業員数",
      /*
       * **「有価証券報告書」はその会社の書類そのものへのリンク**（C13・spec 1.20）。実測値の
       * 節の下辺の帯と同じ行き先で、C12 の時点では EDINET のトップだった。
       */
      source: [
        "金融庁 EDINET の",
        { text: "有価証券報告書", url: edinetDocumentUrl(presence.filingDocId) },
        "（単体）",
      ],
    },
    {
      /*
       * 稼ぐ力は「連結の経常利益 ÷ 連結の従業員数」。**単体の実測値からは出せない**ので、
       * 出典に連結を明記する。式そのものはレーダーの節と稼ぐ力の推移の節が書いている。
       */
      kind: "computed",
      label: "計算値",
      covers: "順位・偏差値・分布・レーダー・稼ぐ力",
      source: ["実測値・自己申告値と、有価証券報告書（連結）から計算"],
    },
    {
      kind: "estimated",
      label: "推定値",
      covers: "年齢別の推定年収と、年齢そろえの金額・順位",
      source: ["実測値と、厚生労働省「", { source: "wageCensus" }, "」の賃金カーブ"],
    },
    {
      kind: "selfReported",
      label: "自己申告値",
      covers: "残業・有給・男女の賃金の差異",
      source: ["厚生労働省「", { source: "positiveDb" }, "」への登録値"],
    },
  ];

  const digest = [
    presence.summary ? "社名の下の説明文" : null,
    presence.analysis ? "「有価証券報告書の要約」" : null,
  ].filter((item): item is string => item !== null);
  if (digest.length > 0) {
    rows.push({
      kind: "aiDigest",
      label: "AIの要約",
      covers: digest.join("・"),
      source: ["有価証券報告書の本文に書いてあることだけ"],
    });
  }

  /*
   * 材料は**分析の節の断りと同じ2つ**（有価証券報告書・公開資料。運営者の指示）。全部で
   * 4つある材料（このページの数値・AIの一般知識を含む）は `/about`「要約と分析の作り方」が
   * 持っている。同じ画面の2か所で材料の数が違うと、どちらかが言い落としに見える。
   */
  if (presence.analysis) {
    rows.push({
      kind: "aiAnalysis",
      label: "AIの評価",
      covers: "「現状と今後」",
      source: ["有価証券報告書・公開資料"],
    });
  }

  return rows;
}

