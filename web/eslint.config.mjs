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
  ]),
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
