import { symbolMark } from "./symbol";
import { TAGLINE_1, TAGLINE_2, WORDMARK, type Lettering } from "./lettering";

/**
 * SNS に貼られたときの1枚（S2・Issue #116・`docs/site-chrome/spec.md` 4.3）。
 *
 * **v1は全ページ共通の静的1枚。** 会社ごとに数字を焼き込む案は、1,867社ぶんを
 * 動的生成することになり Workers の CPU 予算（10ms/リクエスト・Issue #118）と
 * エッジキャッシュの設計に踏み込む——OGP を出すこと自体より重い。
 *
 * **見出しと説明文はプラットフォームが `og:title`・`og:description` として
 * 別に出す。** だからこの絵が担うのはブランドの識別で、口コミベースの数字と
 * 並んだときに出所を見分けられること（`docs/ranking/intent.md` の差別化要因）が
 * 読み取れれば足りる。数字は載せない——載せると年1回のデータ更新のたびに
 * 焼き直す必要が出るうえ、更新を忘れた1枚が SNS のキャッシュに残る。
 *
 * **公開ホスト（`openreport.net`）も置かない。** 貼られたカードにはURLが別枠で
 * 出るので、絵の中の1行は情報を足さないまま広告の体裁だけを持ち込む（運営者の指示）。
 *
 * 文字はアウトライン（`lettering.ts`）で置く。理由はそちらに書いてある。
 */

/** SNS が要求する寸法（AC-13）。`web/lib/brand/assets.ts` の表と一致すること。 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** 左の余白。図と文字の左端をここに揃える。 */
const MARGIN = 88;

/** シンボルを収める正方形の一辺。 */
const SYMBOL_SIZE = 144;

/** ファビコンと同じ詰め方（デザイン案の座標系そのまま）。 */
const SYMBOL_COVERAGE = 38 / 48;

/** ワードマークの字の大きさ。 */
const WORDMARK_SIZE = 108;

/**
 * Liberation Sans のキャップハイト（em に対する比）。**ワードマークの上下中央を
 * シンボルの中心に合わせる**のに要る——ベースラインで揃えると、字面の重心が
 * シンボルより下がって見える。
 */
const CAP_HEIGHT = 0.72;

/** シンボルとワードマークの間。 */
const WORDMARK_GAP = 26;

const TAGLINE_SIZE = 86;
const TAGLINE_LEADING = 122;
const TAGLINE_BASELINE = 396;

/**
 * シンボルの上端。**下の余白と釣り合わせてある**——説明文の2行目の字面は
 * およそ 525 で終わるので、上に 92 空けると下が 105 になり、ほぼ天地中央になる。
 */
const SYMBOL_TOP = 92;

export type OgSvgColors = {
  /** ブランド色（シンボルとワードマーク）。 */
  brand: string;
  /** 説明文の色。 */
  text: string;
  /** 地の色。 */
  background: string;
};

/** 座標を短く書く（`0.5000` ではなく `0.5`）。 */
function num(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * アウトラインを1つ置く。`lettering.ts` はフォントサイズ100・ベースライン原点の
 * 座標系なので、置く側が拡大と平行移動をやる。
 */
function letters(
  lettering: Lettering,
  { x, baseline, size, fill }: { x: number; baseline: number; size: number; fill: string }
): string {
  const scale = size / 100;
  return (
    `<path fill="${fill}" transform="translate(${num(x)} ${num(baseline)}) scale(${num(scale)})"` +
    ` d="${lettering.path}"/>`
  );
}

export function ogSvg({ brand, text, background }: OgSvgColors): string {
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
    letters(WORDMARK, {
      x: MARGIN + SYMBOL_SIZE + WORDMARK_GAP,
      baseline: SYMBOL_TOP + SYMBOL_SIZE / 2 + (WORDMARK_SIZE * CAP_HEIGHT) / 2,
      size: WORDMARK_SIZE,
      fill: brand,
    }),
    // ブランドと説明文の間に短い罫を1本。地の色だけの版面で、
    // 「ここまでが名前、ここから先が何をやっているか」の切れ目を作る。
    `<rect x="${MARGIN}" y="275" width="132" height="6" fill="${brand}"/>`,
    letters(TAGLINE_1, {
      x: MARGIN,
      baseline: TAGLINE_BASELINE,
      size: TAGLINE_SIZE,
      fill: text,
    }),
    letters(TAGLINE_2, {
      x: MARGIN,
      baseline: TAGLINE_BASELINE + TAGLINE_LEADING,
      size: TAGLINE_SIZE,
      fill: text,
    }),
    `</svg>`,
  ].join("");
}

/** 版面からはみ出していないこと。`build-brand.ts` が焼く前に確かめる。 */
export function ogOverflow(): string | null {
  const widest = Math.max(
    MARGIN + SYMBOL_SIZE + WORDMARK_GAP + (WORDMARK.width * WORDMARK_SIZE) / 100,
    MARGIN + (TAGLINE_1.width * TAGLINE_SIZE) / 100,
    MARGIN + (TAGLINE_2.width * TAGLINE_SIZE) / 100
  );
  if (widest > OG_WIDTH - MARGIN) {
    return `OG画像の文字が右の余白を割っている（${widest.toFixed(0)}px > ${OG_WIDTH - MARGIN}px）`;
  }
  // 説明文の2行目の字面はベースラインより下にもわずかに出る（全角の em box の
  // 下端まで見る）ので、そのぶんを足してから下の余白と比べる。
  const bottom = TAGLINE_BASELINE + TAGLINE_LEADING + TAGLINE_SIZE * 0.12;
  if (bottom > OG_HEIGHT - MARGIN / 2) {
    return `OG画像の文字が下の余白を割っている（${bottom.toFixed(0)}px）`;
  }
  return null;
}
