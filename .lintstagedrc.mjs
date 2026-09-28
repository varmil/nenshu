/**
 * リポジトリ直下（データパイプライン）と web/（Next.jsアプリ）は別プロジェクトなので、
 * ステージされたファイルのパスで分岐する。tsc/vitest はファイル単位でなくプロジェクト単位で
 * 走らせるほうが正しいため、渡されるファイル名は使わずコマンドを固定で返す。
 *
 * **書式（prettier）だけはファイル単位で、最初に走る。** `.husky/pre-commit` が
 * `--concurrent false` で上から順に回すので、lint・typecheck・vitest は整形した後の
 * ファイルを読む（並行にすると、prettier が書いている途中のファイルを eslint が読みうる）。
 * 対象の拡張子と外すファイルは `.prettierignore` が決める。
 */
export default {
  "*.{ts,tsx,mjs,cjs,js}": "prettier --write",
  "pipeline/scripts/**/*.ts": () => "npm --prefix pipeline test",
  // パイプラインには Python もある（EDINET からの取得と抽出）。**vitest だけを
  // ゲートにすると、Python 側の変更はコミット前に一度も走らない**（C5・#159）。
  "pipeline/**/*.py": () => "npm --prefix pipeline run test:py",
  "web/**/*.{ts,tsx}": () => [
    "npm --prefix web run lint",
    "npm --prefix web run typecheck",
    "npm --prefix web test",
  ],
};
