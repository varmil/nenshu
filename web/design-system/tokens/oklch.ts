/**
 * `tokens.css` に書かれた `oklch(...)` を読むための最小の変換。
 *
 * **トークンの値を検算する側だけが使う。** アプリの描画は CSS 変数がそのまま
 * 効くので、実行時にここを通す必要は無い。
 *
 * 使い手は2つある。どちらも「トークンが正で、それ以外はそこから導く」ことを
 * 固定するために要る。
 *
 * - `tokens.test.ts` — 配色のコントラストが WCAG AA を満たすか
 * - `lib/brand/colors.test.ts` — ファビコンの hex がトークンと一致するか（S4）
 *
 * 変換式は https://bottosson.github.io/posts/oklab/ の逆変換。
 */

export type Oklch = { l: number; c: number; h: number; alpha: number };

/** `oklch(L C H)` / `oklch(L C H / A)` をパースする。A は白背景合成のために使う。 */
export function parseOklch(value: string): Oklch {
  const match = value.match(
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/,
  );
  if (!match) throw new Error(`oklch として読めない: ${value}`);
  const [, l, c, h, a, pct] = match;
  const alpha = a === undefined ? 1 : Number(a) / (pct === "%" ? 100 : 1);
  return { l: Number(l), c: Number(c), h: Number(h), alpha };
}

/** Oklab → 線形sRGB。各チャンネルは 0〜1 に丸める（色域外を切り落とす）。 */
export function toLinearSrgb({ l: L, c: C, h: H }: Pick<Oklch, "l" | "c" | "h">): number[] {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

/** 線形sRGB → sRGB（ガンマ補正）。 */
function encodeGamma(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/**
 * `oklch(...)` を `#rrggbb` にする。
 *
 * **アルファは無視する。** ブランド色に半透明のトークンを使うことはなく、
 * 使ってしまったら合成する相手（どの背景か）を決めないと hex にできない。
 */
export function oklchToHex(value: string): string {
  const channels = toLinearSrgb(parseOklch(value))
    .map((channel) => Math.round(encodeGamma(channel) * 255))
    .map((channel) => channel.toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}
