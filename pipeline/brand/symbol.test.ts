import { describe, expect, it } from "vitest";
import { SYMBOL_EXTENT, symbolSvg } from "./symbol";

/*
 * シンボルの置き方を固定する（S4・Issue #163・`docs/site-chrome/spec.md` 6.3）。
 *
 * **見たいのは「どこに・どれだけの大きさで置かれるか」だけ。** 線の座標そのものは
 * デザイン案からの引き写しなので、テストに書き写しても同じ文字列を2箇所に置くだけで
 * 何も守らない。守りたいのは倍率と中央寄せの計算で、ここがずれるとアイコンが
 * 端で切れる（maskable）・余白が足りない（クリアスペース）という形で出る。
 *
 * 割合の上限（`MAX_COVERAGE_WITH_CLEAR_SPACE`・`MAX_COVERAGE_MASKABLE`）は式そのものが
 * 定義なので、テストで書き写さない。焼く割合がそれを超えたら `build-brand.ts` が落ちる。
 */

/** `translate(tx ty) scale(k)` から、出力座標での外接矩形を出す。 */
function bounds(svg: string): { min: number; max: number } {
  const match = svg.match(/transform="translate\(([-\d.]+) [-\d.]+\) scale\(([\d.]+)\)"/);
  if (!match) throw new Error(`transform が読めない: ${svg.slice(0, 200)}`);
  const offset = Number(match[1]);
  const scale = Number(match[2]);
  // シンボルの座標系での外接矩形は 5〜43（`SYMBOL_EXTENT` = 38）。
  return { min: offset + 5 * scale, max: offset + 5 * scale + SYMBOL_EXTENT * scale };
}

describe("symbolSvg", () => {
  it.each([
    [48, 38 / 48],
    [180, 0.62],
    [512, 0.55],
  ])("一辺 %i・割合 %f で、外接矩形がその割合ぴったりになり、上下左右の余白が等しい", (size, coverage) => {
    const { min, max } = bounds(symbolSvg({ size, coverage, stroke: "#007595" }));
    // 桁は 0.005px まで見る。SVG の数値は4桁で丸めてある（バイト数がそのまま
    // 成果物に効くため）ので、512px では 0.001px ほどの差が残る。
    expect(max - min).toBeCloseTo(size * coverage, 2);
    expect(min).toBeCloseTo(size - max, 2);
  });

  it("濃色サーフェスの色を渡したときだけメディアクエリが出る", () => {
    const svg = symbolSvg({
      size: 48,
      coverage: 1,
      stroke: "#007595",
      strokeDark: "#00b8db",
    });
    expect(svg).toContain("@media(prefers-color-scheme:dark)");
    expect(svg).toContain("#00b8db");
    // `<style>` を読まない相手（ラスタライザ）のために属性も残す。
    expect(svg).toContain('stroke="#007595"');

    // 渡さなければ出さない。ラスタライズに回す SVG にこれが入っていても librsvg は
    // 評価しないので、入っていること自体が「効いているつもり」の誤解を生む。
    expect(symbolSvg({ size: 32, coverage: 1, stroke: "#007595" })).not.toContain(
      "prefers-color-scheme"
    );
  });

  it("地の色を渡したときだけ全面を塗る矩形が入る（渡さなければ透過のまま）", () => {
    const svg = symbolSvg({ size: 180, coverage: 0.62, stroke: "#007595", background: "#ffffff" });
    expect(svg).toContain('<rect width="180" height="180" fill="#ffffff"/>');
    expect(symbolSvg({ size: 32, coverage: 1, stroke: "#007595" })).not.toContain("<rect");
  });
});
