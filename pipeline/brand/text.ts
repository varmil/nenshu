import { GOTHIC, SANS, type Glyph, type GlyphTable } from "./lettering";

/**
 * OG画像の文字を字の表（`lettering.ts`）から組む（S2・Issue #116）。
 *
 * **なぜ組む側が要るか。** OG画像には社数・全体平均・対象期間が載るようになり
 * （`brand/og.ts`）、文字列はデータを読んだ時点で決まる。文ごとアウトラインを
 * 持っていた頃は `outline.py` を回し直す必要があったが、それには fontTools と
 * 日本語フォントの入った機械が要る——**データを作り直すたびにその機械を要求するのは、
 * 焼き直しを忘れる理由になる。**
 *
 * **和文は IPAGothic、ASCII は Liberation Sans。** IPAGothic の欧文は固定ピッチで、
 * `2,961` や `EDINET` が間延びして見える。混植の境目は「コードポイントが ASCII か」の
 * 1行だけで決める——字種で分けると、字を足すたびに規則が増える。
 */

/** ASCII は欧文の表、それ以外は和文の表から引く。 */
function tableFor(char: string): GlyphTable {
  return char.charCodeAt(0) < 0x80 ? SANS : GOTHIC;
}

function glyphFor(char: string): Glyph {
  const glyph = tableFor(char)[char];
  if (glyph === undefined) {
    throw new Error(
      `OG画像に置けない字がある: ${JSON.stringify(char)}。` +
        `pipeline/brand/outline.py の GOTHIC_CHARS / SANS_CHARS に足して回し直すこと`
    );
  }
  return glyph;
}

/** 座標を短く書く（`0.5000` ではなく `0.5`）。SVG のバイト数がそのまま成果物に効く。 */
function num(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** 文字列の送り幅（そのフォントサイズでの px）。版面のはみ出しを測るのに使う。 */
export function textWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) width += glyphFor(char).advance;
  return (width * size) / 100;
}

export type TextOptions = {
  x: number;
  /** ベースラインの Y。 */
  baseline: number;
  size: number;
  fill: string;
  /**
   * 太字ぶんの線の太さ（フォントサイズ100の座標系。0 なら細字のまま）。
   *
   * **IPAGothic にボールドが無いので、輪郭を同じ色で縁取って太らせる。** 別の
   * 和文フォントを持ち込む案は、`outline.py` を回す機械にそのフォントを要求する
   * ことになり、字の表を持つ理由（どの機械でも同じ絵が焼ける）と噛み合わない。
   */
  weight?: number;
};

/**
 * 文字列を1つの `<g>` に組む。字は原点から描いてあるので、送り幅ぶん平行移動して並べ、
 * 外側の `<g>` で `translate(x baseline) scale(size/100)` する。
 */
export function textSvg(text: string, { x, baseline, size, fill, weight = 0 }: TextOptions): string {
  const scale = size / 100;
  const stroke =
    weight > 0
      ? ` stroke="${fill}" stroke-width="${num(weight)}" stroke-linejoin="round"`
      : "";

  let offset = 0;
  let glyphs = "";
  for (const char of text) {
    const glyph = glyphFor(char);
    // 空白は path を持たない（送り幅だけ進める）。
    if (glyph.d !== "") {
      glyphs += `<path transform="translate(${num(offset)} 0)" d="${glyph.d}"/>`;
    }
    offset += glyph.advance;
  }

  return (
    `<g fill="${fill}"${stroke}` +
    ` transform="translate(${num(x)} ${num(baseline)}) scale(${num(scale)})">${glyphs}</g>`
  );
}
