/**
 * tokens.css のCSS変数を型付きで参照するための薄いレイヤー。
 * Tailwindのテーマ写像そのものは tokens.css の `@theme` が担う（Tailwind v4）。
 * ここは、CSSでは表現しづらい場所（チャートの配色配列など）から
 * トークンを型安全に参照するための入口。値はハードコードせず、
 * 常に `var(--token-name)` を返すことで tokens.css との乖離を防ぐ。
 */

const cssVar = (name: string) => `var(${name})`;

export const colorTokens = {
  background: cssVar("--background"),
  foreground: cssVar("--foreground"),
  card: cssVar("--card"),
  cardForeground: cssVar("--card-foreground"),
  popover: cssVar("--popover"),
  popoverForeground: cssVar("--popover-foreground"),
  primary: cssVar("--primary"),
  primaryForeground: cssVar("--primary-foreground"),
  secondary: cssVar("--secondary"),
  secondaryForeground: cssVar("--secondary-foreground"),
  muted: cssVar("--muted"),
  mutedForeground: cssVar("--muted-foreground"),
  accent: cssVar("--accent"),
  accentForeground: cssVar("--accent-foreground"),
  destructive: cssVar("--destructive"),
  border: cssVar("--border"),
  input: cssVar("--input"),
  ring: cssVar("--ring"),
  chart1: cssVar("--chart-1"),
  chart2: cssVar("--chart-2"),
  chart3: cssVar("--chart-3"),
  chart4: cssVar("--chart-4"),
  chart5: cssVar("--chart-5"),
} as const;

export const spacingTokens = {
  xs: cssVar("--space-xs"),
  sm: cssVar("--space-sm"),
  md: cssVar("--space-md"),
  lg: cssVar("--space-lg"),
  xl: cssVar("--space-xl"),
  "2xl": cssVar("--space-2xl"),
} as const;

export const fontSizeTokens = {
  xs: cssVar("--text-xs"),
  sm: cssVar("--text-sm"),
  base: cssVar("--text-base"),
  lg: cssVar("--text-lg"),
  xl: cssVar("--text-xl"),
  "2xl": cssVar("--text-2xl"),
  "3xl": cssVar("--text-3xl"),
  "4xl": cssVar("--text-4xl"),
} as const;

export const radiusTokens = {
  sm: cssVar("--radius-sm"),
  md: cssVar("--radius-md"),
  lg: cssVar("--radius-lg"),
  xl: cssVar("--radius-xl"),
  "2xl": cssVar("--radius-2xl"),
  "3xl": cssVar("--radius-3xl"),
  "4xl": cssVar("--radius-4xl"),
} as const;

export const shadowTokens = {
  sm: cssVar("--shadow-sm"),
  md: cssVar("--shadow-md"),
  lg: cssVar("--shadow-lg"),
} as const;
