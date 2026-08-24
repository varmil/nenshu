import sharp from "sharp";

export type ImageProbe = { w: number; h: number; format: string };

export type Rejection =
  | "notImage"
  | "tooTiny"
  | "solidColor"
  | "almostTransparent"
  | "extremeRatio";

/**
 * 表示は器の中で最大でも高さ48px程度（L1 で決める）。その2倍を持つ。
 * 128px高だと1枚10KBを超え、1,500社で合計10MBの予算（AC-6）を割る——
 * 画質を落としても効かず（82→50で15%しか減らない）、効くのは寸法のほうだった。
 * ラスタで足りないものは拡大せず、そのまま小さく残す。
 */
export const TARGET_HEIGHT = 96;
export const MAX_WIDTH = 384;
export const MAX_RATIO = 20;

export function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 3000).toString("utf-8").toLowerCase();
  return head.includes("<svg");
}

/** ICO のディレクトリから最大サイズを読む（0 は 256 を意味する）。 */
export function icoMaxSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  let best: { w: number; h: number } | null = null;
  for (let i = 0; i < count; i++) {
    const off = 6 + 16 * i;
    if (off + 2 > buf.length) break;
    const w = buf[off] === 0 ? 256 : buf[off];
    const h = buf[off + 1] === 0 ? 256 : buf[off + 1];
    if (!best || w * h > best.w * best.h) best = { w, h };
  }
  return best;
}

/**
 * **sharp は ICO を読めない。** 中の最大の絵を取り出して渡す必要がある。
 * ICO の各エントリは PNG そのものか、BMP（DIB）のどちらか。
 * 32bpp と 24bpp の BMP だけを扱う——それ未満はパレット式で、実質16px級しか無い。
 */
export async function icoToImage(buf: Buffer): Promise<Buffer | null> {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  let best: { size: number; offset: number; length: number } | null = null;
  for (let i = 0; i < count; i++) {
    const dir = 6 + 16 * i;
    if (dir + 16 > buf.length) break;
    const w = buf[dir] === 0 ? 256 : buf[dir];
    const h = buf[dir + 1] === 0 ? 256 : buf[dir + 1];
    const length = buf.readUInt32LE(dir + 8);
    const offset = buf.readUInt32LE(dir + 12);
    if (offset + length > buf.length) continue;
    if (!best || w * h > best.size) best = { size: w * h, offset, length };
  }
  if (!best) return null;
  const entry = buf.subarray(best.offset, best.offset + best.length);
  if (entry.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return entry;
  }
  return dibToPng(entry);
}

async function dibToPng(dib: Buffer): Promise<Buffer | null> {
  if (dib.length < 40) return null;
  const headerSize = dib.readUInt32LE(0);
  const width = dib.readInt32LE(4);
  // ICO の DIB は AND マスクを含むので高さが2倍で入っている
  const height = Math.floor(dib.readInt32LE(8) / 2);
  const bpp = dib.readUInt16LE(14);
  if (width <= 0 || height <= 0 || (bpp !== 32 && bpp !== 24)) return null;

  const bytesPerPixel = bpp / 8;
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixels = dib.subarray(headerSize);
  if (pixels.length < rowSize * height) return null;

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    // DIB は下から上に並ぶ
    const src = (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const s = src + x * bytesPerPixel;
      const d = (y * width + x) * 4;
      rgba[d] = pixels[s + 2];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s];
      rgba[d + 3] = bpp === 32 ? pixels[s + 3] : 255;
    }
  }
  // 32bpp でもアルファが全て0のことがある（作り手の手抜き）。その場合は不透明として扱う
  if (bpp === 32 && !rgba.some((v, i) => i % 4 === 3 && v !== 0)) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }
  try {
    return await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  } catch {
    return null;
  }
}

/** 画像として読めるかを検める。読めなければ null。**Content-Type は信用しない。** */
export async function probe(buf: Buffer): Promise<ImageProbe | null> {
  if (buf.length < 16) return null;
  try {
    const meta = await sharp(buf, { animated: false }).metadata();
    if (!meta.width || !meta.height || !meta.format) return null;
    return { w: meta.width, h: meta.height, format: meta.format };
  } catch {
    return null;
  }
}

/**
 * 解像度では落とさない（ADR-0008 決定3）。落とすのは「壊れているもの」だけ。
 */
export async function reject(buf: Buffer, p: ImageProbe): Promise<Rejection | null> {
  if (p.w < 2 || p.h < 2) return "tooTiny";
  const ratio = Math.max(p.w / p.h, p.h / p.w);
  if (ratio > MAX_RATIO) return "extremeRatio";

  const { data, info } = await sharp(buf, { animated: false })
    .resize(24, 24, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let opaque = 0;
  let first: [number, number, number] | null = null;
  let varied = false;
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    if (a < 16) continue;
    opaque++;
    const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    if (!first) first = rgb;
    else if (!varied && rgb.some((v, k) => Math.abs(v - first![k]) > 12)) varied = true;
  }
  const total = info.width * info.height;
  if (opaque / total < 0.005) return "almostTransparent";
  // **単色でも、透明部分があれば形がある。** 1色のワードマークは Commons の大半で、
  // ここを「単色だから空」と見なすと本命のロゴを落とす（実際に332社ぶん落とした）。
  // 空と見なすのは「全面が不透明で、かつ1色」——塗りつぶしの矩形だけである。
  if (!varied && opaque / total > 0.995) return "solidColor";
  return null;
}

/**
 * 器の地は明るい面（`--logo-surface`）で固定してある。ライトは白、ダークも
 * `oklch(0.93 …)` と明るいままなので、**白いロゴはどちらのモードでも空白のマス目に見える**。
 * 地を白いロゴのときだけ濃くして逃げることはできない（ADR-0008 決定4「色を反転させる加工はしない」に
 * 近接するうえ、1ページに濃淡2種の器が並ぶ）。**だから読み込む側で落とす**（Issue #156）。
 *
 * 判定は「明るい器に重ねたとき、インクが1画素も乗らないか」。**不透明度を掛けてから見る**——
 * 薄いアルファの乗った白い画素は、生の RGB を見ると白でも、重ねれば白のままである。
 * これで「色の付いた縁を持つ白抜きロゴ」は残る（縁がインクとして数えられる）。
 */
const INK_MAX = 234;
const MIN_INK_SHARE = 0.01;

/**
 * **見るのは `normalize` を通した後の画像**、つまり配るものそのもの。判定と配るものの間に
 * 加工を挟まない。`reject` の24×24走査に相乗りさせなかったのは、そこでは足りなかったため——
 * 実測で、配っている1,636枚のうち白い50枚を24×24で数えると23枚しか挙がらない。
 * 縮小の平均化が細い線を白へ寄せるうえ、アルファを戻す計算が低アルファの画素に
 * `(127,127,127,23)` のような暗い値を作り、それがインクとして数えられてしまう。
 */
export async function blankOnLight(normalized: Buffer): Promise<boolean> {
  const { data, info } = await sharp(normalized, { animated: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    let min = 255;
    for (let k = 0; k < 3; k++) {
      const over = (data[i + k] * a + 255 * (255 - a)) / 255;
      if (over < min) min = over;
    }
    if (min <= INK_MAX) ink++;
  }
  return ink / (info.width * info.height) < MIN_INK_SHARE;
}

/** 余白を落とし、高さ96pxに収めた WebP にする。ラスタは拡大しない。 */
export async function normalize(buf: Buffer, isSvg: boolean, quality = 78): Promise<Buffer> {
  // SVG は一度大きく描いてから縮める（直接128pxで描くと細い線が飛ぶ）
  const input = isSvg
    ? await sharp(buf, { density: 384 })
        .resize({ height: TARGET_HEIGHT * 2, withoutEnlargement: false, fit: "inside" })
        .png()
        .toBuffer()
    : buf;

  let img = sharp(input, { animated: false }).ensureAlpha();
  try {
    img = sharp(await img.trim({ threshold: 8 }).toBuffer()).ensureAlpha();
  } catch {
    img = sharp(input, { animated: false }).ensureAlpha();
  }
  const meta = await img.metadata();
  const h = meta.height ?? TARGET_HEIGHT;
  const w = meta.width ?? TARGET_HEIGHT;
  const scale = Math.min(TARGET_HEIGHT / h, MAX_WIDTH / w, isSvg ? Infinity : 1);
  return img
    .resize({
      height: Math.max(1, Math.round(h * scale)),
      width: Math.max(1, Math.round(w * scale)),
      fit: "inside",
    })
    .webp({ quality, effort: 5 })
    .toBuffer();
}
