/**
 * リポジトリ直下（データパイプライン）と web/（Next.jsアプリ）は別プロジェクトなので、
 * ステージされたファイルのパスで分岐する。tsc/vitest はファイル単位でなくプロジェクト単位で
 * 走らせるほうが正しいため、渡されるファイル名は使わずコマンドを固定で返す。
 */
export default {
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
