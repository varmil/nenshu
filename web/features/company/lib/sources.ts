import { edinetDocumentUrl, type PRIMARY_SOURCES } from "@/lib/data/sources";

/**
 * 「このページの出典」の行（C12・Issue #805、`docs/company/spec.md` 1.15・AC-16）。
 *
 * **区分の軸は加工の度合い。** 節の並び順ではなく、原文・実測値・計算値・推定値・自己申告値・
 * AIの要約・AIの評価の7つで束ねる（原文は C19・#852 で足した）。読者が知りたいのは「この数字をどこまで信じてよいか」
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
 * **時点は書かない。** 決算期は「年収に関するQ&A」の説明（C16）と要約の節の説明が
 * 持っている（`docs/site-chrome/spec.md` 5.1 が企業詳細で認めているのはこの2か所だけで、
 * ここに書くと3回目になる）。女性活躍DBの集計時点、分析を書いた年月と参照日も、それぞれの
 * 節にある。
 *
 * **有報を挙げる行は、その行の中身を作った書類へリンクする**（refresh の D3・spec 1.5・AC-3）。
 * 毎日の更新では数字が先に新しい書類へ替わり、文章は書き直すまで前の書類のまま出るので、実測値の
 * 行と AI の行が別の書類を指すことがある。**説明文と要約の書類が違えば、AIの要約の行を分ける**
 * ——1行に束ねると、どちらの書類かが読めない。
 */

export type SourceKind =
  "original" | "measured" | "computed" | "estimated" | "selfReported" | "aiDigest" | "aiAnalysis";

/**
 * 出典の文の切れ端。文字列はそのまま、`source` は一次情報（全ページ共通）へのリンク、
 * `url` はその会社だけのリンク（C13・有報の書類閲覧ページ）になる。
 */
export type SourceSegment =
  string | { source: keyof typeof PRIMARY_SOURCES } | { text: string; url: string };

export interface SourceRow {
  kind: SourceKind;
  /** 区分の名前（`dt`）。 */
  label: string;
  /** その区分に該当する、このページに出ているもの。 */
  covers: string;
  /** どこから来たか。 */
  source: SourceSegment[];
}

/**
 * 会社によって、あったり無かったりする節と、その中身を作った有報の書類 ID。**書類 ID が `null` の
 * 節はページに無い。**
 */
export interface PageSources {
  /** 平均年収推移（過去10年間）。 */
  history: boolean;
  /** 在籍年数推移（過去10年間）と業種の中央値（T4・#835）。平均年収推移がある会社にしか無い。 */
  tenureHistory: boolean;
  /** 実測値の4項目を取った有報（C13）。全社にある。 */
  filingDocId: string;
  /** 社名の下の説明文（C7）を作った有報。原文に事業の中身が無い会社には説明文が無い。 */
  summaryDocId: string | null;
  /** 「有価証券報告書の要約」と「現状と今後」の原文にした有報。**2つは対**（AC-28）なので1つで持つ。 */
  analysisDocId: string | null;
  /** 給与の決定方針（C19・#852）を切り出した有報。改正前の様式の会社と、空の会社には無い。 */
  payPolicyDocId: string | null;
  /**
   * 母集団の会社か（refresh の D9）。**`false` は母集団から外れた会社のページ**で、順位・偏差値・
   * 分布・レーダー・年齢別の推定年収が無い。既定は `true`。
   */
  ranked?: boolean;
  /** 稼ぐ力の推移（P2）。母集団から外れた会社のページで、計算値の行が挙げるかを決める。 */
  profitHistory?: boolean;
  /**
   * 稼ぐ力（レーダーの軸か推移）がページに出るか。既定は `true`。**連結の経常利益が無い会社
   * （IFRS・米国基準）では `false`**——稼ぐ力を出さないので（Issue #911）、計算値に挙げない。
   * 母集団から外れた会社のページ（`ranked: false`）は `profitHistory` が同じ役をする。
   */
  profit?: boolean;
}

/**
 * 計算値と推定値の行。**母集団から外れた会社のページ（D9）には順位・偏差値・分布・レーダー・
 * 年齢別の推定年収が無い**ので、計算値はページにあるもの（稼ぐ力の推移・在籍年数の業種の中央値）
 * だけを挙げ、推定値の行は出さない。
 */
function computedAndEstimated(page: PageSources): SourceRow[] {
  const computedSource: SourceRow["source"] = [
    "実測値・自己申告値と、有価証券報告書（連結）から計算",
  ];
  if (page.ranked === false) {
    const covers = [
      page.profitHistory ? "稼ぐ力" : null,
      page.tenureHistory ? "業種の中央値" : null,
    ].filter((c): c is string => c !== null);
    return covers.length === 0
      ? []
      : [{ kind: "computed", label: "計算値", covers: covers.join("・"), source: computedSource }];
  }
  return [
    {
      /*
       * 稼ぐ力は「連結の経常利益 ÷ 連結の従業員数」。**単体の実測値からは出せない**ので、
       * 出典に連結を明記する。式そのものはレーダーの節と稼ぐ力の推移の節が書いている。
       */
      kind: "computed",
      label: "計算値",
      // 業種の中央値は稼ぐ力（レーダー）と在籍年数の推移（T4）の2か所に出る。
      covers: [
        "順位・偏差値・分布・レーダー",
        page.profit === false ? null : "稼ぐ力",
        page.tenureHistory ? "業種の中央値" : null,
      ]
        .filter((c): c is string => c !== null)
        .join("・"),
      source: computedSource,
    },
    {
      kind: "estimated",
      label: "推定値",
      covers: "年齢別の推定年収と、年齢そろえの金額・順位",
      source: ["実測値と、厚生労働省「", { source: "wageCensus" }, "」の賃金カーブ"],
    },
  ];
}

/*
 * 文言は **PC の本文幅（652px・12px の字で約46字）に1行で収まる**長さを目安にしてある。
 * 運営者の指摘は「補足説明に過ぎないのにスペースを取りすぎ」で、作り替える前の3ステップ
 * （PC 260px・モバイル 580px）より高くしないことを E2E が固定している。
 */
export function buildSourceRows(page: PageSources): SourceRow[] {
  const rows: SourceRow[] = [];

  /*
   * **原文は先頭に置く**（C19・#852、spec 1.15・1.23）。加工の度合いは有報そのままで最も少ないが、
   * どこまでが給与の決定方針かを生成AIが判定しているので、実測値の行に混ぜるとそれが読めなくなる。
   * **「生成AI」の語は給与の決定方針の節には置かず、ここと `/about` だけが言う**——節に置くと、
   * 文そのものを AI が書いたように読める。「有価証券報告書」は原文を切り出した書類へのリンク
   * （数字の書類と違いうる。refresh の D3）。
   */
  if (page.payPolicyDocId !== null) {
    rows.push({
      kind: "original",
      label: "原文",
      covers: "給与の決定方針",
      source: [
        { text: "有価証券報告書", url: edinetDocumentUrl(page.payPolicyDocId) },
        "の本文をそのまま（どこまでが給与の決定方針かは生成AIが判定）",
      ],
    });
  }

  rows.push(
    {
      kind: "measured",
      label: "実測値",
      // 推移の表は平均年齢も年ごとに出す（T3・#827）ので、「その推移」は2つにかかる。
      // 在籍年数の推移（T4・#835）がある会社では3つにかかる。
      covers: page.tenureHistory
        ? "平均年収・平均年齢・在籍年数とその推移・従業員数"
        : page.history
          ? "平均年収・平均年齢とその推移・在籍年数・従業員数"
          : "平均年収・平均年齢・在籍年数・従業員数",
      /*
       * **「有価証券報告書」はその会社の書類そのものへのリンク**（C13・spec 1.20）。実測値の
       * 節の下辺の帯と同じ行き先で、C12 の時点では EDINET のトップだった。
       */
      source: [
        "金融庁 EDINET の",
        { text: "有価証券報告書", url: edinetDocumentUrl(page.filingDocId) },
        "（単体）",
      ],
    },
    ...computedAndEstimated(page),
    {
      kind: "selfReported",
      label: "自己申告値",
      covers: "残業・有給・男女の賃金の差異",
      source: ["厚生労働省「", { source: "positiveDb" }, "」への登録値"],
    }
  );

  /*
   * **同じ書類から作った文章は1行に束ね、違えば行を分ける**（refresh の D3）。説明文と要約は
   * 同じ回に書き直すので、ふつうは同じ書類になる。分かれるのは片方の書き直しが通らなかった
   * ときだけ。
   */
  const digest = [
    page.summaryDocId !== null ? { covers: "社名の下の説明文", docId: page.summaryDocId } : null,
    page.analysisDocId !== null
      ? { covers: "「有価証券報告書の要約」", docId: page.analysisDocId }
      : null,
  ].filter((item) => item !== null);
  for (const docId of new Set(digest.map((item) => item.docId))) {
    rows.push({
      kind: "aiDigest",
      label: "AIの要約",
      covers: digest
        .filter((item) => item.docId === docId)
        .map((item) => item.covers)
        .join("・"),
      source: [
        { text: "有価証券報告書", url: edinetDocumentUrl(docId) },
        "の本文に書いてあることだけ",
      ],
    });
  }

  /*
   * 材料は**分析の節の断りと同じ2つ**（有価証券報告書・公開資料。運営者の指示）。全部で
   * 4つある材料（このページの数値・AIの一般知識を含む）は `/about`「要約と分析の作り方」が
   * 持っている。同じ画面の2か所で材料の数が違うと、どちらかが言い落としに見える。
   */
  if (page.analysisDocId !== null) {
    rows.push({
      kind: "aiAnalysis",
      label: "AIの評価",
      covers: "「現状と今後」",
      source: [
        { text: "有価証券報告書", url: edinetDocumentUrl(page.analysisDocId) },
        "・公開資料",
      ],
    });
  }

  return rows;
}
