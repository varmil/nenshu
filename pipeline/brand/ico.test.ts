import { describe, expect, it } from "vitest";
import { buildIco } from "./ico";

/*
 * ICO の器を固定する（S4・Issue #163）。
 *
 * 中身の PNG は `sharp` が作るので、ここで見るのは**器の組み方**だけ。
 * オフセットが1バイトずれると、読む側は「壊れた画像」ではなく
 * 「そこそこ読めてしまう別のバイト列」を受け取ることがあるので、
 * 先頭の位置は数字で押さえておく。
 */

const HEADER = 6;
const ENTRY = 16;

function entry(ico: Buffer, index: number) {
  const at = HEADER + ENTRY * index;
  return {
    width: ico.readUInt8(at),
    height: ico.readUInt8(at + 1),
    bytes: ico.readUInt32LE(at + 8),
    offset: ico.readUInt32LE(at + 12),
  };
}

describe("buildIco", () => {
  const images = [
    { size: 16, png: Buffer.from("aaa") },
    { size: 32, png: Buffer.from("bbbbb") },
    { size: 48, png: Buffer.from("cc") },
  ];

  it("アイコンとしてのヘッダと枚数を書く", () => {
    const ico = buildIco(images);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1); // 1 = アイコン
    expect(ico.readUInt16LE(4)).toBe(images.length);
  });

  it("各エントリが自分の画像の先頭を指す", () => {
    const ico = buildIco(images);
    images.forEach(({ png }, index) => {
      const { bytes, offset } = entry(ico, index);
      expect(bytes).toBe(png.length);
      expect(ico.subarray(offset, offset + png.length)).toEqual(png);
    });
  });

  it("画像は目録の直後から隙間なく並ぶ", () => {
    const ico = buildIco(images);
    expect(entry(ico, 0).offset).toBe(HEADER + ENTRY * images.length);
    expect(ico.length).toBe(
      HEADER + ENTRY * images.length + images.reduce((sum, { png }) => sum + png.length, 0),
    );
  });

  it("256px は 0 で表す（1バイトに入らないため）", () => {
    const ico = buildIco([{ size: 256, png: Buffer.from("x") }]);
    expect(entry(ico, 0).width).toBe(0);
    expect(entry(ico, 0).height).toBe(0);
  });

  it("空だと落ちる", () => {
    expect(() => buildIco([])).toThrow();
  });

  it("256を超える寸法は落ちる", () => {
    expect(() => buildIco([{ size: 512, png: Buffer.from("x") }])).toThrow();
  });
});
