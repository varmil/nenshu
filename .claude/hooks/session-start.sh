#!/bin/bash
#
# Claude Code on the web（リモート実行）向けのセットアップ。
#
# web セッションはコンテナが毎回まっさらでクローンされるので、何もしないと
# node_modules が無い状態から始まり、lint も typecheck も vitest も Playwright も
# 動かない。ここで3つのワークスペースぶんの依存を入れておく。
#
# ローカルの Claude Code では何もしない（$CLAUDE_CODE_REMOTE で判定）。
# /opt/pw-browsers はこのコンテナにしか無いパスで、ローカルの node_modules を
# 勝手に入れ直すのも余計なため。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install` ではなく `npm ci` を使う。CLAUDE.md の「開発上の約束」のとおり
# このリポジトリは package-lock.json のズレに厳しく、npm のバージョン差で
# lock が書き換わると Cloudflare の `npm ci` だけが落ちる事故が実際に2回起きている。
# `npm ci` は lock を書き換えないので、セッション開始時点で作業ツリーが汚れない。
#
# ルートの `npm ci` は husky の `prepare` を走らせ、`.husky/pre-commit`
# （lint-staged → lint・typecheck・vitest）を有効にする。これが無いと
# web セッションでのコミットだけがリポジトリのゲートを素通りする。
npm ci
npm --prefix pipeline ci
npm --prefix web ci

# Playwright 1.62 が同梱を期待する Chromium 151（rev 1234）はこのコンテナに無く、
# 入っているのは 141（rev 1194）だけ。playwright.config.ts の逃げ道
# （PLAYWRIGHT_CHROMIUM_PATH）に渡して `npm run test:e2e` をそのまま通す。
# ダウンロードし直さないのは、環境側が PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD で
# それを止めているため。
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium" ]; then
  echo "export PLAYWRIGHT_CHROMIUM_PATH=\"${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium\"" >> "$CLAUDE_ENV_FILE"
fi
