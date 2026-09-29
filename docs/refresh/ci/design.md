# design.md — D1 PR ごとにテストを回す（CI）

Issue: [#871](https://github.com/varmil/nenshu/issues/871)
spec: `docs/refresh/spec.md` 1.12・AC-12（前半） ／ 段取り: `plan.md`

PR を開く・push するたびに、GitHub Actions で書式・テスト・lint・型チェック・ビルド・データの作り直しの一致・E2E を回す（`.github/workflows/ci.yml`）。自動マージ（D8）は「テストが通ったか」をこのチェックの結果で判定する。

---

## ワークフロー

`on: pull_request` と main への push。3つのジョブを並べて回す（待ち時間は一番遅いジョブで決まる）。

| ジョブ（`name`） | 回すもの |
| --- | --- |
| `pipeline` | ルートの `npm ci` → `npm run format:check`（prettier）→ `pipeline` の `npm ci` → `npm test`（vitest と Python の `test:py`）→ `npm run check:data` |
| `web` | `npx npm@10.9.2 ci` → `npm run lint` → `npm run typecheck` → `npm test`（vitest）→ `npm run build`（`astro build`） |
| `e2e` | `npx npm@10.9.2 ci` → `npx playwright install --with-deps chromium` → `npx playwright test`。落ちたら `web/test-results/` を成果物として7日残す |

- **ジョブの名前は D8 が API（check runs）で読む。** 変えるなら D8 の側も直す
- **コミット前のフック（`.lintstagedrc.mjs`）と違い、ファイルの種類で絞らない。** フックはステージしたファイルで回すものを選ぶが、CI は PR 全体を見る。フックが `pipeline/worklife/*.ts` の変更で pipeline のテストを回さない、のような取りこぼしもここで拾う
- **`web/` の `npm ci` は Cloudflare のビルド環境と同じ npm 10.9.2**（CLAUDE.md「開発上の約束」）。版が違うと optionalDependencies の解決がずれ、Cloudflare の `npm ci` だけが落ちる事故が2回起きている。ここで同じ版で通れば、その事故をマージの前に捕まえられる
- **pipeline のジョブは web の依存を入れない。** pipeline のテストは web のモジュール（`salary.ts`・`radar.ts` 等）を相対パスで import するが、それらは外部のパッケージを持たない（`web/node_modules` を外して pipeline の vitest が全件通ることを確かめた）
- **Python は標準ライブラリだけ**（`fontTools` を使う `pipeline/brand/outline.py` はテストの外）なので、`pip install` は無い
- **同じ PR に続けて push したら、古いほうの実行を止める**（`concurrency`）。main は止めない
- 権限は `contents: read` だけ

### データの作り直しの一致（`check:data`）

コミットされた `pipeline/data/` から `web/public/data/` を作り直し、コミットされたものと比べる（`pipeline/scripts/check-data.ts`）。**比べないのは `companies.json` の `meta.generatedAt` だけ**で、`meta.version` は中身から決まる（D2 の `datasetVersion`）ので比べる。`logos.json` は `build:logos`（ネットワークが要る）が書くので比べない。

- 止めたいのは「データを作り直し忘れた」「`web/public/data/` を手で直した」の2つ。毎日の更新（D4）の PR は `pipeline/data/` と `web/public/data/` を両方書き換える
- **EDINET のキャッシュは gitignore なので、CI で回せるのはここまで。** 取得そのもの（`salary/run.py` 等）は回さない
- 社数の急な減り（`checkCountDrop`）は、コミットされた `companies.json` を前回として見る

### E2E の範囲

**dev サーバーに向けて全件**（Worker に向けないと走らないもの——`cache-headers`・`asset-routing` の後半——は skip）。リポジトリが公開なので標準のランナーは無料で、範囲を絞る理由が時間しか無い。時間は下の実測のとおり。

## 必須チェック（ブランチ保護）

**掛けていない。** リポジトリの設定なので運営者の手が要る。D8 は check runs を API で読んで自分で判定するので、ブランチ保護が無くても自動マージの判定には困らない。掛けるなら、`pipeline`・`web`・`e2e` の3つと Cloudflare の `Workers Builds: nenshu` を必須にする。

## 所要時間

PR #886 の初回（2026-09-29・依存のキャッシュが無い状態）。3つは並べて走るので、PR の待ち時間は e2e の約3分になる。

| ジョブ | 所要時間 | 内訳 |
| --- | --- | --- |
| `pipeline` | 31秒 | テストと `check:data`（作り直しは約2秒） |
| `web` | 2分36秒 | うち `astro build` 1分15秒（企業ページ 2,961件の事前生成） |
| `e2e` | 3分14秒 | うち Playwright 2.2分（180件通過・8件 skip） |

- skip の8件は、Worker に向けないと走らない7件と、数字と文章の有報がずれた会社の1件（D3。いまのデータにその会社がいない）
- `web` と `e2e` は同じ `package-lock.json` を鍵に npm のキャッシュを作るので、どちらかが「キャッシュを保存できない」と出す。片方が保存していれば次から効くので、害は無い

## わざと落としたとき

同じ PR に、3つのジョブそれぞれで1件ずつ落ちるテストを足したコミットを push し、**3つとも赤くなる**ことを確かめてから戻した。

| ジョブ | 赤くなるまで | 落ちた場所 |
| --- | --- | --- |
| `pipeline` | 26秒 | `scripts/lib/ledger.test.ts` のわざと落としたテスト |
| `web` | 1分3秒 | vitest（`lib/data/period.test.ts`）で止まり、`astro build` まで行かない |
| `e2e` | 3分3秒 | `e2e/about.spec.ts` のわざと落としたテストだけ（残り180件は通過）。`web/test-results/` が成果物として上がった |

落とすコミットはコミット前のフックを外して作った（フックが vitest で止めるため）。戻すコミットで差分は0に戻っている。

`actions/upload-artifact@v4` は Node.js 20 向けで、ランナーが Node.js 24 で動かしたと警告が出る。動作に差は無いので据え置いた。
