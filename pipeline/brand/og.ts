import { symbolMark } from "./symbol";
import { WORDMARK } from "./lettering";
import { textSvg, textWidth } from "./text";

/**
 * SNS に貼られたときの1枚（S2・Issue #116・`docs/site-chrome/spec.md` 4.3）。
 *
 * **v1は全ページ共通の静的1枚。** 会社ごとに数字を焼き込む案は、2,961社ぶんを
 * 動的生成することになり Workers の CPU 予算（10ms/リクエスト・Issue #118）と
 * エッジキャッシュの設計に踏み込む——OGP を出すこと自体より重い。
 *
 * **母集団の数字は載せる**（2026-08-26・運営者の指示で版面を差し替えた）。
 * 初版は「数字を載せると年1回のデータ更新のたびに焼き直しが要り、更新を忘れた
 * 1枚が SNS のキャッシュに残る」として1つも載せていなかった。載せると決めた以上、
 * **焼き直しを忘れないことが版面の条件になる**ので、
 *
 * - 数字は `web/public/data/` から引く（`build-brand.ts`）。ここに直書きしない
 * - 焼いた値は `web/lib/brand/ogFacts.ts` に残り、`ogFacts.test.ts` が
 *   いまのデータと突き合わせる。**データを作り直して焼き直さないとテストが落ちる**
 *
 * を対にしてある。**SNS 側のキャッシュに古い1枚が残りうることは変わらない**——
 * ただし残るのは「前回のデータの社数と平均」で、出典と体裁は同じである。
 *
 * **公開ホスト（`openreport.net`）は置かない。** 貼られたカードにはURLが別枠で
 * 出るので、絵の中の1行は情報を足さないまま広告の体裁だけを持ち込む（運営者の指示）。
 *
 * 文字はアウトライン（`lettering.ts`）で置く。理由はそちらに書いてある。
 */

/** SNS が要求する寸法（AC-13）。`web/lib/brand/assets.ts` の表と一致すること。 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** 左右の余白。図・見出し・罫・数値の左端をここに揃える。 */
const MARGIN = 76;

/** シンボルを収める正方形の一辺。 */
const SYMBOL_SIZE = 46;

/** ファビコンと同じ詰め方（デザイン案の座標系そのまま）。 */
const SYMBOL_COVERAGE = 38 / 48;

/** シンボルの上端。 */
const SYMBOL_TOP = 54;

/** ワードマークの字の大きさ。 */
const WORDMARK_SIZE = 36;

/**
 * Liberation Sans のキャップハイト（em に対する比）。**ワードマークの上下中央を
 * シンボルの中心に合わせる**のに要る——ベースラインで揃えると、字面の重心が
 * シンボルより下がって見える。
 */
const CAP_HEIGHT = 0.72;

/** シンボルとワードマークの間。 */
const WORDMARK_GAP = 13;

/** 見出し。版面の主役なので、2行が上下の余白より先に目に入る大きさに取る。 */
const HEADLINE_SIZE = 62;
const HEADLINE_LEADING = 94;
const HEADLINE_BASELINE = 246;

/**
 * 太字ぶんの縁取り（フォントサイズ100の座標系）。IPAGothic にボールドが無いので
 * 輪郭を同じ色で太らせている（`text.ts`）。
 */
const BOLD = 4.6;

/** 見出しと数値の間を分ける罫。 */
const RULE_Y = 437;
const RULE_HEIGHT = 1.5;

/** 数値の帯。3つの区画の左端と、その間に立てる縦罫の位置。 */
const COLUMN_X = [MARGIN, 420, 723];
const DIVIDER_X = [372, 700];
const DIVIDER_TOP = 452;
const DIVIDER_BOTTOM = 578;

const LABEL_SIZE = 16;
const LABEL_BASELINE = 478;
const VALUE_SIZE = 32;
const VALUE_BASELINE = 536;

/** 3つめの区画だけ2行（対象期間と出典）。数値ではないので細字で小さく置く。 */
const SOURCE_SIZE = 24;
const SOURCE_BASELINE = 532;
const SOURCE_LEADING = 34;

/** 出典。EDINET は金融庁の開示システムなので、両方を1行で名乗る。 */
const SOURCE = "金融庁 EDINET";

/** 見出しの1行目。**データに依らない**ので固定文のまま。 */
const HEADLINE_LEAD = "有価証券報告書の数値のまま、";

export type OgFacts = {
  /** 掲載社数（`companies.meta.count`）。 */
  count: number;
  /** 全体平均（実測値・万円。`stats.population[0].mean` を `toManYen` した値）。 */
  averageManYen: number;
  /** 対象期間（`fiscalPeriodLabel(companies.meta)`）。 */
  fiscalPeriod: string;
};

export type OgSvgColors = {
  /** ブランド色（シンボルとワードマーク）。 */
  brand: string;
  /** 見出しと数値の色。 */
  text: string;
  /** ラベルと出典の色。 */
  muted: string;
  /** 罫の色。 */
  rule: string;
  /** 地の色。 */
  background: string;
};

/** 座標を短く書く（`0.5000` ではなく `0.5`）。 */
function num(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** `2961` → `2,961`。`toLocaleString` を使わない——焼く機械のロケールに依らせない。 */
export function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 見出しの2行。2行目だけが社数を持つ。 */
export function ogHeadline({ count }: OgFacts): [string, string] {
  return [HEADLINE_LEAD, `${group(count)}社の平均年収。`];
}

/** 数値の帯。ラベルと、その下に並べる1〜2行。 */
export function ogColumns(facts: OgFacts): { label: string; lines: string[] }[] {
  return [
    { label: "対象社数", lines: [`${group(facts.count)}社`] },
    { label: "全体平均", lines: [`${group(facts.averageManYen)}万円`] },
    { label: "対象期間・出典", lines: [facts.fiscalPeriod, SOURCE] },
  ];
}

/**
 * 絵の中に書いてあることをそのまま並べた1文。`web/lib/brand/assets.ts` の
 * `OG_IMAGE.alt` になる（読み上げと、画像が出ないときの代替）。
 */
export function ogAlt(facts: OgFacts): string {
  const [lead, tail] = ogHeadline(facts);
  const [companies, average, period] = ogColumns(facts);
  return (
    `${WORDMARK.text} — ${lead}${tail}` +
    `${companies.label} ${companies.lines[0]}、` +
    `${average.label} ${average.lines[0]}、` +
    `${period.label} ${period.lines.join("・")}`
  );
}

export function ogSvg(
  { brand, text, muted, rule, background }: OgSvgColors,
  facts: OgFacts
): string {
  const [lead, tail] = ogHeadline(facts);

  const columns = ogColumns(facts).flatMap(({ label, lines }, index) => [
    textSvg(label, {
      x: COLUMN_X[index],
      baseline: LABEL_BASELINE,
      size: LABEL_SIZE,
      fill: muted,
    }),
    // 1行だけの区画は数値そのものなので太く大きく、2行の区画（対象期間・出典）は
    // 読む対象が数値ではないので細字で小さく置く。
    ...(lines.length === 1
      ? [
          textSvg(lines[0], {
            x: COLUMN_X[index],
            baseline: VALUE_BASELINE,
            size: VALUE_SIZE,
            fill: text,
            weight: BOLD,
          }),
        ]
      : lines.map((line, row) =>
          textSvg(line, {
            x: COLUMN_X[index],
            baseline: SOURCE_BASELINE + row * SOURCE_LEADING,
            size: SOURCE_SIZE,
            // 1行目は対象期間（データ）、2行目は出典。ラベルと同じ色に落とす。
            fill: row === 0 ? text : muted,
          })
        )),
  ]);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}"`,
    ` viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${background}"/>`,
    symbolMark({
      size: SYMBOL_SIZE,
      coverage: SYMBOL_COVERAGE,
      stroke: brand,
      x: MARGIN,
      y: SYMBOL_TOP,
    }),
    // ワードマークだけは Liberation Sans Bold の実物のボールドを持っている。
    `<path fill="${brand}" transform="translate(${num(MARGIN + SYMBOL_SIZE + WORDMARK_GAP)}` +
      ` ${num(SYMBOL_TOP + SYMBOL_SIZE / 2 + (WORDMARK_SIZE * CAP_HEIGHT) / 2)})` +
      ` scale(${num(WORDMARK_SIZE / 100)})" d="${WORDMARK.path}"/>`,
    textSvg(lead, {
      x: MARGIN,
      baseline: HEADLINE_BASELINE,
      size: HEADLINE_SIZE,
      fill: text,
      weight: BOLD,
    }),
    textSvg(tail, {
      x: MARGIN,
      baseline: HEADLINE_BASELINE + HEADLINE_LEADING,
      size: HEADLINE_SIZE,
      fill: text,
      weight: BOLD,
    }),
    // 見出しと数値の帯を分ける横罫。版面いっぱいに引いて、下の3区画がその上に乗る。
    `<rect x="${MARGIN}" y="${RULE_Y}" width="${OG_WIDTH - MARGIN * 2}"` +
      ` height="${RULE_HEIGHT}" fill="${rule}"/>`,
    ...DIVIDER_X.map(
      (x) =>
        `<rect x="${x}" y="${DIVIDER_TOP}" width="1"` +
        ` height="${DIVIDER_BOTTOM - DIVIDER_TOP}" fill="${rule}"/>`
    ),
    ...columns,
    `</svg>`,
  ].join("");
}

/**
 * 版面からはみ出していないこと。`build-brand.ts` が焼く前に確かめる。
 *
 * **データで文字列が変わるようになったので、この検算が要る度合いが上がった。**
 * 社数が1桁増える・対象期間の幅が年をまたぐといった変化で行が伸びる。
 */
export function ogOverflow(facts: OgFacts): string | null {
  const right = OG_WIDTH - MARGIN;
  const wordmarkRight =
    MARGIN + SYMBOL_SIZE + WORDMARK_GAP + (WORDMARK.width * WORDMARK_SIZE) / 100;
  if (wordmarkRight > right) {
    return `OG画像のワードマークが右の余白を割っている（${wordmarkRight.toFixed(0)}px > ${right}px）`;
  }

  for (const line of ogHeadline(facts)) {
    const end = MARGIN + textWidth(line, HEADLINE_SIZE);
    if (end > right) {
      return `OG画像の見出し「${line}」が右の余白を割っている（${end.toFixed(0)}px > ${right}px）`;
    }
  }

  // 数値の帯は縦罫で区切ってあるので、右の余白ではなく**隣の区画**にぶつからないこと
  // を見る。最後の区画だけは右の余白が相手になる。
  const columns = ogColumns(facts);
  for (const [index, { label, lines }] of columns.entries()) {
    const limit = index < DIVIDER_X.length ? DIVIDER_X[index] : right;
    const widest = Math.max(
      textWidth(label, LABEL_SIZE),
      ...lines.map((line) =>
        textWidth(line, lines.length === 1 ? VALUE_SIZE : SOURCE_SIZE)
      )
    );
    const end = COLUMN_X[index] + widest;
    if (end > limit) {
      return `OG画像の「${label}」が区画からはみ出している（${end.toFixed(0)}px > ${limit}px）`;
    }
  }

  const bottom = SOURCE_BASELINE + SOURCE_LEADING + SOURCE_SIZE * 0.12;
  if (bottom > OG_HEIGHT - MARGIN / 2) {
    return `OG画像の文字が下の余白を割っている（${bottom.toFixed(0)}px）`;
  }
  return null;
}
