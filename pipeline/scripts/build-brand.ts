import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  symbolSvg,
  MAX_COVERAGE_MASKABLE,
  MAX_COVERAGE_WITH_CLEAR_SPACE,
} from "../brand/symbol";
import { buildIco } from "../brand/ico";
import {
  BRAND_COLOR,
  BRAND_COLOR_DARK,
  BRAND_ICON_BACKGROUND,
} from "../../web/lib/brand/colors";
import {
  APPLE_TOUCH_ICON,
  APP_ICONS,
  FAVICON_ICO,
  FAVICON_PNG,
  FAVICON_SVG,
  WEB_MANIFEST,
} from "../../web/lib/brand/assets";
import { SITE_NAME } from "../../web/lib/seo/site";

/**
 * ブランドの成果物を焼く（S4・Issue #163・`docs/site-chrome/spec.md` 6.）。
 *
 *   npm run build:brand            # 既定で ../web/public へ出す
 *   npm run build:brand -- --out <dir>
 *
 * **`web/` ではなく `pipeline/` に置いてある。** `sharp` を `web/` の依存に足すと、
 * プラットフォーム別の optionalDependencies が絡んで **Cloudflare の `npm ci` だけが
 * 「lock file とずれている」で落ちる**（CLAUDE.md「開発上の約束」。実際に2回起きた）。
 * 焼くのは年に何度も無い作業なので、`build:data`・`build:logos` と同じ扱いでよい。
 *
 * **出す先とパスは `web/lib/brand/assets.ts` が正**で、ここはその表を回すだけ。
 * 出力はコミットする（配るのは静的アセットで、リクエスト時には作らない）。
 */

const OUT_DEFAULT = "../web/public";

/** SVG のファビコン。デザイン案の座標系そのままで、余白を足さない。 */
const FAVICON_COVERAGE = 38 / 48;

/** アプリアイコン。クリアスペース25%を満たす範囲でいちばん大きく見せる。 */
const APP_ICON_COVERAGE = 0.62;

/** maskable。角を丸く落とす端末でも欠けない範囲に留める。 */
const MASKABLE_COVERAGE = 0.55;

/** `.ico` に入れる寸法。16 はタブ、32 はブックマークと拡大表示、48 は Windows。 */
const ICO_SIZES = [16, 32, 48];

/**
 * SVG をラスタライズする。
 *
 * `density` を上げてあるのは、既定の 72dpi だと `width` の小さい SVG が
 * そのままのピクセル数で描かれてから拡大され、輪郭が甘くなるため。
 *
 * **地の色を渡したものはアルファチャンネルごと落とす**（`flatten`）。地を敷いた
 * だけだと全画素が不透明な RGBA のままで、「透過が残っていないか」を確かめるのに
 * 画素を全部見る必要がある。チャンネルを落とせば PNG のカラータイプ1バイトで
 * 判る（`web/lib/brand/assets.test.ts` がそれを見る）。
 */
async function png(svg: string, size: number, flatten?: string): Promise<Buffer> {
  const image = sharp(Buffer.from(svg), { density: 384 }).resize(size, size);
  return (flatten ? image.flatten({ background: flatten }) : image).png().toBuffer();
}

/** 透過のシンボル（タブのアイコン用）。 */
function markSvg(size: number): string {
  return symbolSvg({ size, coverage: FAVICON_COVERAGE, stroke: BRAND_COLOR });
}

/** 地の色を敷いたシンボル（ホーム画面のアイコン用）。 */
function plateSvg(size: number, coverage: number): string {
  return symbolSvg({
    size,
    coverage,
    stroke: BRAND_COLOR,
    background: BRAND_ICON_BACKGROUND,
  });
}

export function manifestJson(): string {
  return `${JSON.stringify(
    {
      name: SITE_NAME,
      short_name: SITE_NAME,
      description: "有価証券報告書ベースの平均年収ランキング",
      lang: "ja",
      start_url: "/",
      display: "standalone",
      background_color: BRAND_ICON_BACKGROUND,
      theme_color: BRAND_COLOR,
      icons: APP_ICONS.map(({ path, size, purpose }) => ({
        src: path,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose,
      })),
    },
    null,
    2,
  )}\n`;
}

export async function buildBrand(outDir: string): Promise<string[]> {
  if (APP_ICON_COVERAGE > MAX_COVERAGE_WITH_CLEAR_SPACE) {
    throw new Error("アプリアイコンがクリアスペース25%を満たしていない");
  }
  if (MASKABLE_COVERAGE > MAX_COVERAGE_MASKABLE) {
    throw new Error("maskable がセーフゾーンからはみ出す");
  }
  mkdirSync(outDir, { recursive: true });

  const written: string[] = [];
  const write = (path: string, data: Buffer | string) => {
    const name = basename(path);
    writeFileSync(resolve(outDir, name), data);
    written.push(name);
  };

  // タブのアイコン。**濃色サーフェスの分岐を書けるのはここだけ**（PNG は1色しか
  // 持てない）。`sharp` は SVG の中のメディアクエリを評価しないので、
  // ラスタライズに回すのは `markSvg`（分岐なし）のほう。
  write(
    FAVICON_SVG,
    `${symbolSvg({
      size: 48,
      coverage: FAVICON_COVERAGE,
      stroke: BRAND_COLOR,
      strokeDark: BRAND_COLOR_DARK,
    })}\n`,
  );

  for (const { path, size } of FAVICON_PNG) {
    write(path, await png(markSvg(size), size));
  }

  write(
    FAVICON_ICO,
    buildIco(
      await Promise.all(
        ICO_SIZES.map(async (size) => ({ size, png: await png(markSvg(size), size) })),
      ),
    ),
  );

  // ホーム画面。**透過で渡さない**——iOS は透過部分を黒で埋める。
  write(
    APPLE_TOUCH_ICON.path,
    await png(
      plateSvg(APPLE_TOUCH_ICON.size, APP_ICON_COVERAGE),
      APPLE_TOUCH_ICON.size,
      BRAND_ICON_BACKGROUND,
    ),
  );
  for (const { path, size, purpose } of APP_ICONS) {
    const coverage = purpose === "maskable" ? MASKABLE_COVERAGE : APP_ICON_COVERAGE;
    write(path, await png(plateSvg(size, coverage), size, BRAND_ICON_BACKGROUND));
  }

  write(WEB_MANIFEST, manifestJson());
  return written;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const index = process.argv.indexOf("--out");
  const out = index >= 0 ? process.argv[index + 1] : OUT_DEFAULT;
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", out);
  const written = await buildBrand(outDir);
  console.log(`${outDir} に ${written.length} 件書いた:`);
  for (const name of written) console.log(`  ${name}`);
}
