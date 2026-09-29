#!/usr/bin/env bash
# いまのデータを揺らして、ビルドとテストを回す（refresh の D0・Issue #870）。
#
#   tools/perturb/check.sh          ビルド・pipeline のテスト・web のユニット
#   tools/perturb/check.sh --e2e    ＋ E2E（dev サーバーに向けて）
#
# **作業ツリーのデータをその場で書き換え、終わったら（失敗しても）git で戻す。**
# データに未コミットの変更があると戻せなくなるので、そのときは始めずに止まる。
# 揺らし方は tools/perturb/perturb.py、考え方は docs/refresh/test-invariants/design.md。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# 揺らすデータと、ビルドが書き出すもの（build:data と build:brand）。
TOUCHED=(pipeline/data web/public web/lib/brand/ogFacts.ts)

if ! git diff --quiet -- "${TOUCHED[@]}" || [ -n "$(git ls-files --others --exclude-standard -- "${TOUCHED[@]}")" ]; then
  echo "揺らす対象に未コミットの変更があります。戻せなくなるので止めます:" >&2
  git status --short -- "${TOUCHED[@]}" >&2
  exit 1
fi

restore() {
  git checkout -- "${TOUCHED[@]}"
  git clean -fdq -- "${TOUCHED[@]}"
  echo "データを元に戻した"
}
trap restore EXIT

# データを作るところは、落ちたらそこで止める（その先のテストは意味を持たない）。
python3 tools/perturb/perturb.py
(cd pipeline && npm run -s build:data -- --out ../web/public/data)
(cd pipeline && npm run -s build:brand)

# テストは、どれかが落ちても残りを回す。どこが値に縛られているかを1回で全部見るため。
failed=()
run() {
  echo "=== $1"
  if ! (cd "$2" && shift 2 && "$@"); then failed+=("$1"); fi
}
run "pipeline のテスト" pipeline npm test
run "web のユニット" web npm test
if [ "${1:-}" = "--e2e" ]; then
  run "E2E" web npx playwright test --reporter=line
fi

if [ ${#failed[@]} -gt 0 ]; then
  echo "揺らしたデータで落ちた: ${failed[*]}" >&2
  exit 1
fi
echo "揺らしたデータで全部通った"
