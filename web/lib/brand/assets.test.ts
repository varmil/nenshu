import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPLE_TOUCH_ICON,
  APP_ICONS,
  BRAND_ASSET_PATHS,
  FAVICON_ICO,
  FAVICON_PNG,
  FAVICON_SVG,
  OG_IMAGE,
  OPAQUE_ICONS,
  TRANSPARENT_ICONS,
  WEB_MANIFEST,
} from "./assets";
import { BRAND_COLOR, BRAND_COLOR_DARK, BRAND_ICON_BACKGROUND } from "./colors";

/*
 * 焼いた実物を見るテスト（S4・Issue #163・AC-21〜AC-25）。
 *
 * **生成物をコミットする以上、スクリプトを回さずに手で差し替えられる。**
 * `build:data` の「手作業で JSON を編集しない」と同じ線を、ここで引く。
 * `build-logos.test.ts` が `public/logos/` を毎コミット走査しているのと同じ扱い。
 *
 * 見るのは**性質**（寸法・透過の有無・濃色サーフェスの分岐・manifest の中身）で、
 * 画素そのものではない。画素を固定すると、線を1本引き直すたびにテストを直すことに
 * なり、そのとき何も守らない。
 */

const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));

function read(path: string): Buffer {
  const file = `${publicDir}${path.replace(/^\//, "")}`;
  if (!existsSync(file)) {
    throw new Error(`${path} が無い。\`cd pipeline && npm run build:brand\` を回す`);
  }
  return readFileSync(file);
}

/** PNG の IHDR から寸法とカラータイプを読む（2 = 不透明・6 = アルファ付き）。 */
function pngHeader(path: string): { width: number; height: number; colorType: number } {
  const png = read(path);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png.readUInt8(25),
  };
}

describe("ブランドの成果物", () => {
  it.each(BRAND_ASSET_PATHS)("%s が置いてある", (path) => {
    expect(read(path).length).toBeGreaterThan(0);
  });

  it("`create-next-app` の既定のファビコンが消えている（AC-21）", () => {
    /*
      `app/favicon.ico` が残っていると、こちらが `metadata.icons` で何を指しても
      Next.js がそれを `<link rel="icon">` として出し続ける。25,931 バイトの
      雛形（黒い円に白い三角）が公開され続けていたのがこの Unit の発端なので、
      「消えていること」自体を固定する。
    */
    expect(existsSync(fileURLToPath(new URL("../../app/favicon.ico", import.meta.url)))).toBe(
      false,
    );
  });
});

describe("タブのアイコン", () => {
  it("SVG が濃色サーフェスで色を切り替える（AC-25）", () => {
    const svg = read(FAVICON_SVG).toString();
    expect(svg).toContain(BRAND_COLOR);
    expect(svg).toContain(`@media(prefers-color-scheme:dark){.mark{stroke:${BRAND_COLOR_DARK}}}`);
  });

  it.each(FAVICON_PNG)("$path が $size×$size で焼けている（AC-22）", ({ path, size }) => {
    const { width, height } = pngHeader(path);
    expect([width, height]).toEqual([size, size]);
  });

  it("`.ico` に 16・32・48 の3枚が入っている", () => {
    const ico = read(FAVICON_ICO);
    expect(ico.readUInt16LE(2)).toBe(1); // 1 = アイコン
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("`.ico` が雛形より小さい", () => {
    // 25,931 バイトは create-next-app の既定（256px の PNG を抱えている）。
    // 同じ大きさに戻っていたら、差し替えたつもりで元に戻している。
    expect(read(FAVICON_ICO).length).toBeLessThan(25_931);
  });
});

describe("ホーム画面のアイコン", () => {
  it.each(OPAQUE_ICONS)("$path が $size×$size で、透過を持たない（AC-23）", ({ path, size }) => {
    // 透過のまま渡すと iOS が黒で埋める。アルファチャンネルごと落としてあるので
    // カラータイプは 2（トゥルーカラー）になる。
    const { width, height, colorType } = pngHeader(path);
    expect([width, height]).toEqual([size, size]);
    expect(colorType).toBe(2);
  });

  it.each(TRANSPARENT_ICONS)("$path は透過のまま", ({ path }) => {
    expect(pngHeader(path).colorType).toBe(6);
  });
});

describe("OG画像（S2・Issue 116・AC-13）", () => {
  it("SNS が要求する 1200×630 で焼けている", () => {
    const { width, height } = pngHeader(OG_IMAGE.path);
    expect([width, height]).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
  });

  it("透過を持たない", () => {
    // 地の色を敷いていないと、暗い背景に置く SNS で文字が読めなくなる。
    expect(pngHeader(OG_IMAGE.path).colorType).toBe(2);
  });

  it("代替テキストが絵の中の文字と揃っている", () => {
    // 絵に書いてあるのはブランド名・見出し・数値の帯（`pipeline/brand/og.ts`）。
    // **数字はデータで変わる**ので、値そのものは `ogFacts.test.ts` が突き合わせる。
    expect(OG_IMAGE.alt).toContain("OpenReport");
    expect(OG_IMAGE.alt).toContain("有価証券報告書の数値のまま、");
  });
});

describe("web app manifest（AC-24）", () => {
  const manifest = JSON.parse(read(WEB_MANIFEST).toString());

  it("名前と色を持つ", () => {
    expect(manifest.name).toBe("OpenReport");
    expect(manifest.theme_color).toBe(BRAND_COLOR);
    expect(manifest.background_color).toBe(BRAND_ICON_BACKGROUND);
  });

  it("`any` と `maskable` の 512px を両方持つ", () => {
    const purposes = manifest.icons
      .filter((icon: { sizes: string }) => icon.sizes === "512x512")
      .map((icon: { purpose: string }) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
  });

  it("参照しているアイコンが全部 `assets.ts` の表に載っている", () => {
    // manifest だけが知っているパスがあると、焼き忘れても誰も気づけない。
    const declared = APP_ICONS.map(({ path }) => path);
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(declared);
  });
});

describe("キャッシュ規則", () => {
  const headers = readFileSync(`${publicDir}_headers`, "utf8");

  it.each([...BRAND_ASSET_PATHS, APPLE_TOUCH_ICON.path])("%s に規則がある", (path) => {
    // `_headers` は静的ファイルなので `assets.ts` を import できない。
    // 代わりに、表に載っているパスが全部書かれていることをここで見る。
    expect(headers).toContain(`\n${path}\n`);
  });
});
