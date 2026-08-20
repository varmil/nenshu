import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
          paths: [
            {
              name: "next/link",
              message:
                "ページ間の遷移は features/navigation/components/NavLink の NavLink を使う（遷移中のプログレスバーが出なくなるため）。props は next/link と同じ。",
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
