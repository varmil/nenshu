/**
 * ブランドの成果物の置き場所（S4・Issue #163・`docs/site-chrome/spec.md` 6.）。
 *
 * **パスと寸法の正はここ1か所。** 使い手が4つあり、どれか1つがずれると
 * 気づきにくい形で壊れる。
 *
 * - `pipeline/scripts/build-brand.ts` — この表のとおりに焼く
 * - `app/layout.tsx` — `<link rel="icon">` 等をこの表から出す
 * - `lib/brand/assets.test.ts` — 焼いた実物がこの表と合っているか
 * - `e2e/network.ts` — 操作中のリクエスト数を数えるときに除く対象
 *
 * **どれも `public/` に置く静的アセット。** `app/icon.svg` のような Next.js の
 * 規約ファイルにするとルートハンドラになり、アイコン1枚ごとに Worker が起きる。
 * **Workers 無料枠の CPU は 10ms/リクエストで、実際に超えていた**（`runtime` 施策・
 * `docs/runtime/spec.md`・親 Issue #118）。アイコンのために起動数を増やす理由が無い。
 */

export type BrandIconFile = {
  path: string;
  /** 出力の一辺（px）。 */
  size: number;
};

/**
 * タブのアイコン。**濃色サーフェスの分岐を持つ唯一の成果物**（AC-25）。
 *
 * `<link rel="icon" media="(prefers-color-scheme: dark)">` に頼らないのは、
 * ブラウザの対応が揃っていないため。SVG の中のメディアクエリなら、いま
 * 現行のブラウザが揃って評価する。
 */
export const FAVICON_SVG = "/favicon.svg";

/** SVG のファビコンを読まない相手へのフォールバック（AC-22）。 */
export const FAVICON_PNG: BrandIconFile[] = [
  { path: "/favicon-32.png", size: 32 },
  { path: "/favicon-16.png", size: 16 },
];

/**
 * 固定パスで取りに来る相手（RSS リーダー・ブックマークサービス・クローラ）向け。
 *
 * **`<link>` としては出さない。** 出すと SVG より先に選ぶブラウザがあり、
 * 濃色サーフェスの切り替えを持たないほうが使われてしまう。ここに置いてあるのは
 * 「ページを読まずに `/favicon.ico` を叩く相手」のためだけ。
 */
export const FAVICON_ICO = "/favicon.ico";

/** iOS のホーム画面。透過で渡すと iOS が黒で埋めるので、地の色を敷いてある。 */
export const APPLE_TOUCH_ICON: BrandIconFile = {
  path: "/apple-touch-icon.png",
  size: 180,
};

/** web app manifest から参照するアイコン。 */
export const APP_ICONS: (BrandIconFile & { purpose: "any" | "maskable" })[] = [
  { path: "/icon-192.png", size: 192, purpose: "any" },
  { path: "/icon-512.png", size: 512, purpose: "any" },
  { path: "/icon-maskable-512.png", size: 512, purpose: "maskable" },
];

export const WEB_MANIFEST = "/site.webmanifest";

/** 地の色を敷く（＝不透明にする）成果物。 */
export const OPAQUE_ICONS: BrandIconFile[] = [APPLE_TOUCH_ICON, ...APP_ICONS];

/** 透過のまま配る成果物。 */
export const TRANSPARENT_ICONS: BrandIconFile[] = FAVICON_PNG;

export const BRAND_ASSET_PATHS: string[] = [
  FAVICON_SVG,
  FAVICON_ICO,
  WEB_MANIFEST,
  ...FAVICON_PNG.map(({ path }) => path),
  APPLE_TOUCH_ICON.path,
  ...APP_ICONS.map(({ path }) => path),
];
