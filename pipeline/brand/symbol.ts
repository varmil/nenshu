/**
 * OpenReport のシンボル（S4・Issue #163・`docs/site-chrome/spec.md` 6.3）。
 *
 * 「Open」を示す**開いたリング**と、検証済みを示す**チェック**を同じ太さの線で
 * 結んだ単色の線画。座標は Claude Design の `OpenReport Logo & Favicon.dc.html` が正。
 *
 * **図形の定義はこの1か所だけ。** ファビコン（SVG）・PNG のフォールバック・
 * アプリアイコン・`favicon.ico` は全部ここから焼く。SVG を手で複製すると、
 * 「タブのアイコンだけ古い形」という気づけない壊れ方をする。
 */

/** デザイン案の座標系の一辺。 */
const VIEWBOX = 48;

/** 座標系の中心。リングの中心でもある。 */
const CENTER = VIEWBOX / 2;

/**
 * リングとチェックを合わせた外接正方形の一辺（線の太さ込み）。
 *
 * リングが決めている: 中心 24・半径 16・線幅 6 なので外周は 24 ± 19 で 5〜43。
 * チェック（`M15 25 L22 31 L35 16` に丸い端 3）は 12〜38 で内側に収まる。
 *
 * **リングの欠けている側（左上）も含めた正方形で測る。** 欠けは意匠上の開口で、
 * 図の光学的な中心はリングの中心のままである。描かれている部分だけで外接矩形を
 * 取ると、開いている側にだけ寄った図になる。
 */
export const SYMBOL_EXTENT = 38;

/** 外接正方形が出力の一辺に占める割合の上限（クリアスペース25%・spec 6.3）。 */
export const MAX_COVERAGE_WITH_CLEAR_SPACE = 1 / 1.5;

/**
 * maskable のセーフゾーンに収まる割合の上限。
 *
 * セーフゾーンは中央80%の**円**なので、その中に一辺 s の正方形を入れるには
 * s ≤ 0.8 / √2 が要る（対角線が直径に収まる条件）。角を落とす端末で図が
 * 削られるのを防ぐ。
 */
export const MAX_COVERAGE_MASKABLE = 0.8 / Math.SQRT2;

export type SymbolSvgOptions = {
  /** 出力の一辺（px）。 */
  size: number;
  /** 外接正方形が一辺に占める割合。1 に近いほど余白が無い。 */
  coverage: number;
  /** 線の色。 */
  stroke: string;
  /**
   * 濃色サーフェス用の線の色。渡すと `@media (prefers-color-scheme: dark)` を書く。
   *
   * **ラスタライズする用途では渡さない。** librsvg（`sharp`）はメディアクエリを
   * 評価しないので、PNG には常に明るい面の色が焼ける。
   */
  strokeDark?: string;
  /** 地の色。省略すると透過。 */
  background?: string;
};

/** 座標を短く書く（`0.5000` ではなく `0.5`）。SVG のバイト数がそのまま成果物に効く。 */
function num(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function symbolSvg({
  size,
  coverage,
  stroke,
  strokeDark,
  background,
}: SymbolSvgOptions): string {
  const scale = (size * coverage) / SYMBOL_EXTENT;
  // 外接正方形の中心（= リングの中心）を出力の中心に合わせる。
  const offset = size / 2 - CENTER * scale;

  const style = strokeDark
    ? `<style>.mark{stroke:${stroke}}@media(prefers-color-scheme:dark){.mark{stroke:${strokeDark}}}</style>`
    : "";
  const plate = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    style,
    plate,
    // `stroke` 属性は `<style>` を読まない相手（ラスタライザ等）への保険。
    // CSS のほうが詳細度で勝つので、両方書いても濃色サーフェスの分岐は効く。
    `<g class="mark" transform="translate(${num(offset)} ${num(offset)}) scale(${num(scale)})"`,
    ` fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">`,
    `<circle cx="24" cy="24" r="16" stroke-dasharray="73 28" transform="rotate(-90 24 24)"/>`,
    `<path d="M15 25 L22 31 L35 16"/>`,
    `</g></svg>`,
  ].join("");
}
