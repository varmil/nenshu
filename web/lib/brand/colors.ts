/**
 * サイトのブランド色（S4・Issue #163・`docs/site-chrome/spec.md` 6.3）。
 *
 * **ここが、このリポジトリで hex を書いてよい唯一の場所。** 色の正は
 * `design-system/tokens/tokens.css` の CSS 変数で、画面の中に出るものは
 * 全部そちらを通る（ヘッダのワードマークは `text-primary`）。
 *
 * それでも hex が要るのは、**CSS 変数が届かない成果物**があるため。
 *
 * - ファビコンやアプリアイコンは独立したファイルで、ページの CSS を読まない
 * - `theme_color` / `<meta name="theme-color">` はブラウザの UI を塗る値で、
 *   CSS 変数を受け付けない
 *
 * **`colors.test.ts` が、この3つの値が `tokens.css` の対応するトークンを
 * sRGB に変換したものと一致することを固定している。** トークンを差し替えたときに
 * ここだけ古い色で残る（＝タブのアイコンだけ前の配色）のを止めるため。
 */

/** 明るい面のブランド色。`:root` の `--primary`。 */
export const BRAND_COLOR = "#007595";

/** 濃色サーフェスのブランド色。`.dark` の `--primary`。 */
export const BRAND_COLOR_DARK = "#00b8db";

/**
 * アプリアイコンの地の色。`:root` の `--background`。
 *
 * **読者の表示モードでは切り替えない。** ホーム画面のアイコンは OS が角丸に
 * 切って並べるもので、透過のまま渡すと iOS が黒で埋める。読者ごとに変わらない
 * 1枚の絵として、明るい面の地の色で固定する。
 */
export const BRAND_ICON_BACKGROUND = "#ffffff";
