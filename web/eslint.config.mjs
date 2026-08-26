import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

const hexColorPattern = "#([0-9a-fA-F]{3,4}\\b|[0-9a-fA-F]{6}\\b|[0-9a-fA-F]{8}\\b)";
const noRawHexMessage =
  "生のhexカラーは書かない。web/design-system/tokens/tokens.css のCSS変数（例: bg-primary, text-[var(--color-primary)]）を使う。";

const eslintConfig = defineConfig([
  /*
    **`eslint-config-next` をやめた**（F1・Issue #209・ADR-0014）。あれが束ねていた
    のは TypeScript・React Hooks・a11y の3つで、どれも Next.js に固有ではない。
    Next.js 固有だった規則（`@next/next/*`）は、対象そのものが無くなった。
  */
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  {
    rules: {
      /*
        **全角スペースを禁止しない。** 日本語の本文と JSX のテキストに実際に使って
        いる（`/about` の計算式、働きやすさの注釈）。`eslint-config-next` は
        既定でこれを許していた。**文字列とコメントとJSXのテキストだけ**を許し、
        コードの中の不可視文字は引き続き止める。
      */
      "no-irregular-whitespace": [
        "error",
        { skipStrings: true, skipComments: true, skipTemplates: true, skipJSXText: true },
      ],
      /* `_` 始まりは「受け取るが使わない」の合図（`NavLink` の `prefetch`）。 */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      /*
        **`render` プロップで中身を差し込む形を許す。** `@base-ui/react` の
        `Badge`・`Button` は `render={<a … />}` の形で要素を差し替える設計で、
        中身は `Badge` の子として渡っている（`IndustryChips`）。
      */
      "jsx-a11y/anchor-has-content": "off",
      /*
        **横スクロールする器に `tabIndex={0}` を付けるのは a11y のための実装。**
        キーボードだけで中身を送れるようにしている（`/about` の計算式・Issue #120）。
      */
      "jsx-a11y/no-noninteractive-tabindex": "off",
    },
  },
  { languageOptions: { globals: { window: "readonly", document: "readonly", console: "readonly", localStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly", queueMicrotask: "readonly", fetch: "readonly", History: "readonly", HTMLAnchorElement: "readonly", MouseEvent: "readonly", URL: "readonly", URLSearchParams: "readonly", Response: "readonly", Request: "readonly", process: "readonly" } } },
  globalIgnores([
    // Astro のビルド成果物と型生成
    "dist/**",
    ".astro/**",
    // Playwright の実行結果
    "test-results/**",
    "playwright-report/**",
    // wranglerのローカル実行時の一時ファイル
    ".wrangler/**",
    // design-sync（Claude Design との同期ツール）の生成物。
    // `.design-sync/build-design-system-package.mjs` が作り直せるので手で直さない。
    // web/.gitignore でも追跡対象から外している。
    ".ds-sync/**",
    "ds-bundle/**",
  ]),
  {
    // ページ間の遷移は features/navigation の NavLink を使う。素の a 要素を直接書くと、
    // そのリンクだけ遷移中のプログレスバーが出ない状態になり、しかも見た目が同じなので
    // 気づけない。忘れられる類の約束なので lint で止める（`docs/company/company-page/design.md`）。
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          /*
            **`next/*` を止める規則は消えた**（F1・ADR-0014）。`next` がもう依存に
            無いので、名前で止める意味が無い。

            **「素の a 要素を直接書かない」も止めていない。** Next.js の頃は
            `next/link` を通さないと遷移中のバーが出なかったが、いまは
            `NavProgressBar` が `document` で1本の委譲リスナーとして拾うので
            **どう書かれたリンクでも同じように拾える**（`features/navigation/lib/navIntent.ts`）。
            そもそも業種チップや `/about` の本文には素の `a` が正しく置かれている。

            残すのは1つだけ。
          */
          paths: [
            {
              name: "astro:transitions",
              message:
                "クライアント遷移（ClientRouter）は入れない。素の HTML 取得であることが、事前生成したページを静的アセットで返せる前提になっている（ADR-0014・F2 で改めて測る）。",
            },
          ],
        },
      ],
    },
  },
  {
    // 色は design-system/tokens/tokens.css のCSS変数だけを使う。生の hex を書けない状態を lint で強制する。
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "design-system/tokens/**",
      // ブランド色（S4・Issue #163）。**CSS変数が届かない成果物のためだけ**にここが
      // hex を持つ——ファビコンは独立したファイルでページのCSSを読まず、
      // `theme_color` はブラウザのUIを塗る値でCSS変数を受け付けない。
      // 値がトークンから離れないことは `lib/brand/colors.test.ts` が固定している。
      "lib/brand/colors.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${hexColorPattern}/]`,
          message: noRawHexMessage,
        },
        {
          selector: `TemplateElement[value.raw=/${hexColorPattern}/]`,
          message: noRawHexMessage,
        },
      ],
    },
  },
]);

export default eslintConfig;
