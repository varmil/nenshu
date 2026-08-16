/**
 * リポジトリ直下（データパイプライン）と web/（Next.jsアプリ）は別プロジェクトなので、
 * ステージされたファイルのパスで分岐する。tsc/vitest はファイル単位でなくプロジェクト単位で
 * 走らせるほうが正しいため、渡されるファイル名は使わずコマンドを固定で返す。
 */
export default {
  "scripts/**/*.ts": () => "npm test",
  "web/**/*.{ts,tsx}": () => [
    "npm --prefix web run lint",
    "npm --prefix web run typecheck",
  ],
};
