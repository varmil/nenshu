import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * `next/link` を直接使わせない規則（`docs/company/company-page/design.md`）。
 * **`no-restricted-imports` は後から書いた設定が丸ごと上書きするので、ページ単位で
 * データの import を縛るブロックにも同じものを持たせる**——持たせないと、その
 * ページだけ next/link が素通りする。
 */
const NEXT_LINK_RULE = {
  name: "next/link",
  message:
    "ページ間の遷移は features/navigation/components/NavLink の NavLink を使う（遷移中のプログレスバーが出なくなるため）。props は next/link と同じ。",
};

const hexColorPattern = "#([0-9a-fA-F]{3,4}\\b|[0-9a-fA-F]{6}\\b|[0-9a-fA-F]{8}\\b)";
const noRawHexMessage =
  "生のhexカラーは書かない。web/design-system/tokens/tokens.css のCSS変数（例: bg-primary, text-[var(--color-primary)]）を使う。";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext Cloudflare adapterのビルド成果物
    ".open-next/**",
    // wranglerのローカル実行時の一時ファイル
    ".wrangler/**",
    // design-sync（Claude Design との同期ツール）の生成物。
    // `.design-sync/build-design-system-package.mjs` が作り直せるので手で直さない。
    // web/.gitignore でも追跡対象から外している。
    ".ds-sync/**",
    "ds-bundle/**",
  ]),
  {
    // ページ間の遷移は features/navigation の NavLink を使う。next/link を直接使うと、
    // そのリンクだけ遷移中のプログレスバーが出ない状態になり、しかも見た目が同じなので
    // 気づけない。忘れられる類の約束なので lint で止める（`docs/company/company-page/design.md`）。
    files: ["**/*.{ts,tsx}"],
    // NavLink 自身は next/link と useLinkStatus を包むのが仕事なので、ここだけ例外。
    ignores: ["features/navigation/components/NavLink.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NEXT_LINK_RULE],
        },
      ],
    },
  },
  {
    // **ページは、その画面が使うデータファイルだけを import する**
    // （R0・`docs/runtime/spec.md` AC-1〜AC-3・Issue #118）。
    //
    // import したファイルは、その画面が1バイトしか使わなくても丸ごと `JSON.parse`
    // され、しかも isolate の初回リクエストに課金される。Workers 無料枠の予算は
    // 10ms しかなく、`/` は `stats.json` 131KB を読んで 337B だけ、`logos.json`
    // 202KB を読んで「ロゴがあるか」だけを使っていた。
    //
    // **型もテストも通ってしまう間違いなので lint で止める。** レビューで
    // 「その import は要るのか」を毎回問うことはできない。
    files: ["app/page.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NEXT_LINK_RULE],
          patterns: [
            {
              group: [
                "**/public/data/stats.json",
                "**/public/data/logos.json",
                "**/public/data/history.json",
                "**/public/data/worklife.json",
              ],
              message:
                "`/` はこのファイルを使わない。母集団は population.json、ロゴの有無は logo-ids.json から読む（docs/runtime/spec.md 2.1）。",
            },
          ],
        },
      ],
    },
  },
  {
    // `/company/[id]` が読んでよいものは spec 2.1 の表のとおり。`logos.json` の
    // 寸法・出典を見ているのは `/about` の帰属表示だけで、この画面は「ロゴがあるか」
    // しか使わない。
    files: ["app/company/[id]/page.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NEXT_LINK_RULE],
          patterns: [
            {
              group: ["**/public/data/logos.json"],
              message:
                "`/company/[id]` はロゴの有無しか使わない。logo-ids.json から読む（docs/runtime/spec.md 2.1）。",
            },
          ],
        },
      ],
    },
  },
  {
    // 色は design-system/tokens/tokens.css のCSS変数だけを使う。生の hex を書けない状態を lint で強制する。
    files: ["**/*.{ts,tsx}"],
    ignores: ["design-system/tokens/**"],
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
