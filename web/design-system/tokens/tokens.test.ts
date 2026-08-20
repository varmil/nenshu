import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * tokens.css の色トークンを固定するテスト（Issue #62）。
 *
 * 色は `npx shadcn@latest apply <preset> --only theme` で入れ替える運用なので、
 * プリセットを差し替えたときに「片側の定義が落ちる」「文字が読めない配色になる」を
 * ここで止める。値そのものは固定しない（配色の変更を禁止したいのではなく、
 * 変更しても壊れていないことを担保したい）。
 */

const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

type Tokens = Record<string, string>;

/** `:root { ... }` / `.dark { ... }` ブロックの custom property を取り出す。 */
function parseBlock(selector: string): Tokens {
  const pattern = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const body = css.match(pattern)?.[1];
  if (body === undefined) {
    throw new Error(`tokens.css に ${selector} ブロックが見つからない`);
  }
  const tokens: Tokens = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const root = parseBlock(":root");
const dark = parseBlock(".dark");

/** oklch(L C H) / oklch(L C H / A) をパースする。A は白背景合成のために使う。 */
function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } {
  const match = value.match(
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/,
  );
  if (!match) throw new Error(`oklch として読めない: ${value}`);
  const [, l, c, h, a, pct] = match;
  const alpha = a === undefined ? 1 : Number(a) / (pct === "%" ? 100 : 1);
  return { l: Number(l), c: Number(c), h: Number(h), alpha };
}

/** Oklab → 線形sRGB。https://bottosson.github.io/posts/oklab/ の逆変換。 */
function toLinearSrgb({ l: L, c: C, h: H }: { l: number; c: number; h: number }) {
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

/** WCAG 2.1 の相対輝度。線形sRGBなので係数を掛けるだけでよい。 */
function relativeLuminance(value: string): number {
  const [r, g, b] = toLinearSrgb(parseOklch(value));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** 無彩色（グレースケール）かどうか。oklch の chroma が 0 なら色味が無い。 */
function isAchromatic(value: string): boolean {
  return parseOklch(value).c === 0;
}

describe("tokens.css の色トークン", () => {
  it("ライトとダークで同じ色トークンが揃っている", () => {
    // --space-* / --font-* / --radius は色ではないので比較から外す。
    const colorNames = (tokens: Tokens) =>
      Object.keys(tokens)
        .filter(
          (name) =>
            !name.startsWith("space-") && !name.startsWith("font-") && name !== "radius",
        )
        .sort();

    expect(colorNames(dark)).toEqual(colorNames(root));
  });

  it("--radius は :root だけで定義され、そこから @theme が全サイズを導出する", () => {
    expect(root.radius).toBeDefined();
    expect(dark.radius).toBeUndefined();
    expect(css).toContain("--radius-lg: var(--radius);");
  });

  /*
   * ライトとダークの**両方**で回す（Issue #68）。
   *
   * 以前は :root しか見ておらず、そのせいでダークの --primary が背景に対して
   * 2.72:1 しか無い状態を長く見逃していた。ダークの配色は tokens.css に
   * 揃っていたが画面に出す仕組みが無かったため、誰も気づけなかった。
   */
  const contrastPairs = [
    ["--foreground", "--background"],
    ["--muted-foreground", "--background"],
    ["--primary", "--background"],
    ["--card-foreground", "--card"],
    ["--accent-foreground", "--accent"],
    ["--secondary-foreground", "--secondary"],
    ["--primary-foreground", "--primary"],
  ] as const;

  const modes = [
    ["ライト", root],
    ["ダーク", dark],
  ] as const;

  it.each(
    modes.flatMap(([mode, tokens]) =>
      contrastPairs.map(([fg, bg]) => [mode, fg, bg, tokens] as const),
    ),
  )("%s: %s は %s の上で WCAG AA（4.5:1）を満たす", (_mode, fg, bg, tokens) => {
    // --primary はリンク・選択中のタブ・年齢別チャートの色（#65 で役割を決めた）。
    // --primary-foreground は塗りつぶしたタブとボタンのラベル。
    // ここが割れると実際に読めなくなる。
    const name = (token: string) => token.slice(2);
    expect(contrastRatio(tokens[name(fg)], tokens[name(bg)])).toBeGreaterThanOrEqual(4.5);
  });

  it("--primary に色味がある（Issue #62: 白黒から脱する）", () => {
    expect(isAchromatic(root.primary)).toBe(false);
    expect(isAchromatic(dark.primary)).toBe(false);
  });

  /*
   * --overlay はシート・ダイアログの背後に敷く幕（Issue #79）。不透明にすると
   * 背後のページが完全に隠れて「どこに重なっているか」が読めなくなる。
   * ダークは背景自体が暗いので、ライトと同じ薄さでは幕が掛かって見えない。
   */
  it.each(modes)("%s: --overlay は半透明である", (_mode, tokens) => {
    const alpha = parseOklch(tokens.overlay).alpha;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it("--overlay はダークのほうが濃い", () => {
    expect(parseOklch(dark.overlay).alpha).toBeGreaterThan(parseOklch(root.overlay).alpha);
  });

  it("チャート色 5 本がすべて互いに異なる", () => {
    const charts = [1, 2, 3, 4, 5].map((n) => root[`chart-${n}`]);
    expect(new Set(charts).size).toBe(5);
  });
});

/*
 * フォントは webfont を持たず OS のフォントだけで組む（Issue #64）。
 * 「うっかり next/font や @font-face を足して初期表示コストが戻る」のを止めたい。
 */
describe("tokens.css のフォント", () => {
  const stacks = { "--font-sans": root["font-sans"], "--font-mono": root["font-mono"] };

  it.each(Object.entries(stacks))("%s が定義されている", (_name, stack) => {
    expect(stack).toBeTruthy();
  });

  it.each(Object.entries(stacks))("%s は webfont を参照しない", (_name, stack) => {
    // url(...) が出てくる = ダウンロードが要るフォントを指している。
    expect(stack).not.toMatch(/url\(/);
  });

  it.each(Object.entries(stacks))("%s は総称ファミリーで終わる", (_name, stack) => {
    // 最後の砦。どれも入っていない環境で無指定に落ちないようにする。
    expect(stack.trim()).toMatch(/(sans-serif|serif|monospace)$/);
  });

  it("--font-sans は日本語フォントを明示している", () => {
    // 明示が無いと、日本語が中国語フォントに解決されて漢字の字形が崩れる環境がある
    // （実際に Chromium が WenQuanYi Zen Hei を選ぶのを確認した）。
    const stack = root["font-sans"];
    expect(stack).toContain("Hiragino Sans");
    expect(stack).toContain("Meiryo");
    expect(stack).toContain("Noto Sans CJK JP");
  });

  it("@theme が --font-sans / --font-mono を参照している", () => {
    // ここが切れると Tailwind の font-sans / font-mono が効かなくなる。
    expect(css).toContain("--font-sans: var(--font-sans);");
    expect(css).toContain("--font-mono: var(--font-mono);");
  });
});
