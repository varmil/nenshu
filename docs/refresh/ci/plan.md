# plan.md — D1 PR ごとにテストを回す（CI）

Issue: [#871](https://github.com/varmil/nenshu/issues/871)
spec: `docs/refresh/spec.md` 1.12・AC-12（前半） ／ overview: `docs/refresh/overview.md`「D1」 ／ 依存: D0（#870）

PR を開く・push するたびに、テスト・lint・型チェック・ビルド・E2E を GitHub Actions で回す。自動マージ（D8）は「テストが通ったか」を、定期実行のセッションの報告ではなくこの結果で判定する（spec 1.12・overview「D8」）。いまのチェックは Cloudflare のブランチのビルドだけで、テストはコミット前のフック（ローカル）でしか走っていない。

---

## 段取り

### 1. コミット前のフックが何を回しているかを写し取る

`.husky/pre-commit` と `.lintstagedrc.mjs` が回しているもの（prettier・pipeline の vitest と Python・web の lint・typecheck・vitest）を、ファイルの種類で絞らずに全部回す形にする。フックはステージしたファイルで回すものを選ぶが、CI は PR 全体を見る。

### 2. データの作り直しが一致することを足す

コミットされた `pipeline/data/` から `web/public/data/` を作り直し、コミットされたものと一致するかを見る（`companies.json` の `generatedAt` は除く）。EDINET のキャッシュは gitignore なので、CI で回せるのはここまで。**毎日の更新（D4）の PR で「データを作り直し忘れた」「手で JSON を直した」を止める。**

### 3. ワークフローを書く

ジョブは並べて回す（待ち時間は一番遅いジョブで決まる）。

- 書式とパイプライン（prettier・pipeline の vitest と Python・データの作り直しの一致）
- web（lint・typecheck・vitest・`astro build`）。**`npm ci` は Cloudflare と同じ npm の版で回す**（CLAUDE.md「開発上の約束」）
- E2E（dev サーバーに向けて全件）

ジョブの名前は D8 が API で読むので、決めたら変えない。

### 4. 実際に回して所要時間を測る

PR を出して回し、ジョブごとの所要時間を design.md に書く。**リポジトリは公開なので、標準のランナーは無料**（無料枠の分数の上限が無い）。

### 5. わざと落として赤くなることを確かめる

同じ PR に、テストを1件わざと落とすコミットを push し、チェックが赤くなることを見る。確かめたらそのコミットを戻す。**落ちたことを見ずに「回っている」とは言わない**——ジョブが何も走らずに緑になる書き方（パスの絞り込みの誤り等）を見逃す。

### 6. docs

design.md に、ジョブの構成・名前・所要時間・必須チェック（ブランチ保護）の扱いを書く。ブランチ保護はリポジトリの設定なので、掛けるなら運営者の手が要る。CLAUDE.md の「開発上の約束」に CI の存在を書く。
