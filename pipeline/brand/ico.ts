/**
 * PNG を並べた `.ico` を組む（S4・Issue #163）。
 *
 * **`sharp` は ICO を書けない。** 読む側は `scripts/lib/logo/image.ts` の
 * `icoToImage` にあるが（企業ロゴの調達で `favicon.ico` を開く必要があった）、
 * 書く側はここが唯一。
 *
 * 中身は BMP ではなく **PNG をそのまま入れる**。ICO は Windows Vista 以降この形を
 * 認め、現行のブラウザは全部読める。BMP の DIB を組むと、`icoToImage` のコメントに
 * ある「高さが2倍・行は下から上・AND マスク付き」を書く側でも相手にすることになる。
 *
 * なぜ `.ico` を残すのか（SVG と PNG があれば足りるはずである）:
 * **`/favicon.ico` はページを読まずに取りに来る相手がいる**——RSS リーダー・
 * ブックマークサービス・クローラ。ここを 404 にすると、その経路からはアイコンが
 * 消える。`web/e2e/network.ts` が「Chromium 141 は `pushState` のたびに
 * `/favicon.ico` を取り直す」として計測から外しているのも同じ固定パスの話。
 */

export type IcoImage = {
  /** 一辺（px）。256 以上は ICO の仕様で表せない。 */
  size: number;
  png: Buffer;
};

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

export function buildIco(images: IcoImage[]): Buffer {
  if (images.length === 0) throw new Error("ICO に入れる画像が無い");
  for (const { size } of images) {
    if (size < 1 || size > 256) throw new Error(`ICO に入らない寸法: ${size}`);
  }

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0); // 予約
  header.writeUInt16LE(1, 2); // 1 = アイコン（2 はカーソル）
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(ENTRY_BYTES * images.length);
  let offset = HEADER_BYTES + directory.length;

  images.forEach(({ size, png }, index) => {
    const at = ENTRY_BYTES * index;
    // 256 は 1 バイトに入らないので 0 で表す（仕様どおり）。
    directory.writeUInt8(size === 256 ? 0 : size, at);
    directory.writeUInt8(size === 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2); // パレットの色数（トゥルーカラーは 0）
    directory.writeUInt8(0, at + 3); // 予約
    directory.writeUInt16LE(1, at + 4); // カラープレーン
    directory.writeUInt16LE(32, at + 6); // ビット深度
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...images.map(({ png }) => png)]);
}
