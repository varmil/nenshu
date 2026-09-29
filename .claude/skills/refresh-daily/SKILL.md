---
name: refresh-daily
description: OpenReport の掲載データを毎日更新する定期実行の手順（refresh の D8）。定期実行（Routine）のセッションが最初に呼ぶ。有報の数字の差分更新・女性活躍DB の取り込み・文章の差分生成・ビルド・テスト・データ更新の PR まで。人が見ていない前提で、質問も承認待ちもしない。
---

# 定期実行: データの差分更新

設計は `docs/refresh/routine/design.md`、仕様は `docs/refresh/spec.md`。**この手順を変えるのは PR で**（`.claude/` は通る基準のファイルなので、変える PR は自動ではマージされない）。

## 前提

- **人は見ていない。** 質問しない。承認を待たない。迷ったら、読者に誤りを出さない側（前の期の数字のまま・取り込まない）に倒して進む。止めたものは知らせ（Issue）が拾う
- **マージしない。** PR を立てて `refresh` のラベルを付けるところまで。マージは CI が通った後に GitHub Actions がする（`refresh-automerge.yml`）。CI の結果を待たない
- 会話・コミット・PR は日本語（CLAUDE.md）
- 生成AIの工程のうち、線 B の読み直しはこのセッションが自分で読んで判定する。文章の生成と検証はエージェント（Agent ツール）に回させる（`texts.md`）。モデルは定期実行のセッションの設定、推論はリポジトリの `.claude/settings.json` の `effortLevel`（spec 1.14）

## 1. 準備

1. リポジトリ `varmil/nenshu` がコンテナに無ければ、`add_repo`（push）で付けて clone し、`register_repo_root` する
2. このセッションに指定されたブランチを、main の最新から作り直す: `git fetch origin main && git checkout -B <指定のブランチ> origin/main`
3. 依存が無ければ入れる（ふだんは `.claude/hooks/session-start.sh` が入れている）: ルート・`pipeline/`・`web/` で `npm ci`
4. 開いている `refresh` のラベルの PR を見る（GitHub のツールで）
   - `refresh-ci-failed` が付いた PR: CI のログを読んで原因を調べる。**今日の回で直せる修正**（通る基準のファイル以外）なら今日の PR に入れ、前の PR は理由を書いて閉じる（今日の回が同じ書類を取り直す——読んだところは main の `universe.json` にある）
   - `refresh-criteria` が付いた PR: 触らない。開いたままでも今日の回は進める（AC-18）
   - どちらも付いていない前の回の PR（CI の途中・マージ前）: 触らない

## 2. 有報の数字（D4・`docs/refresh/numbers/design.md`）

```
cd pipeline/refresh && python3 update_numbers.py collect
```

- **書類一覧が取れずに止まったら**（線 A）、何も書かれていない。数字は今日は飛ばして 3. へ進む。続けば知らせが立つ（`routine:stalled`）。API キーの失効などコードで直せないものは、知らせるだけになる
- 読み直しが要る会社があれば、`work/reread/` の原文を `prompts/reread.md` に従って読み、`work/verdicts.json` を書く。**値は直さない**。有報にそう書いてあるかだけを見る

```
python3 update_numbers.py apply
```

- 新しく載った会社があれば、最後に出るロゴのコマンドを回す: `cd pipeline && npm run build:logos -- --only <ID,…>`

## 3. 女性活躍DB（D7・`docs/refresh/worklife-fetch/design.md`）

```
cd pipeline && npm run update:worklife
```

- **2. の後に回す**（その日に足した会社まで突合する）。1日1回までで、2回目は何もせずに終わる
- 検証に落ちた版は取り込まれず、`manifest.json` の `rejected` に残る。それで正しい（知らせが立つ）

## 4. 文章の前のビルド

```
cd pipeline && npm run build:data -- --out ../web/public/data
```

分析の材料（稼ぐ力・業種の中央値）はビルドの成果物から読むので、2. と 3. の数字を先に入れておく。

## 5. 文章（D6・`docs/refresh/text-refresh/design.md`）

**手順は同じディレクトリの `texts.md`。** 数字が新しい書類に替わった会社の文章を、1社ずつ新しい書類に合わせる。

- **1回の上限は16社。** `update_texts.py queue --limit 16` が選んだ会社を上から順に処理する
- **始めてから3時間を過ぎたら、いま処理している会社を終えたところで止める**（次の会社に進まない）。残りは次の回が先頭から拾う
- 1社も選ばれなければ飛ばす

## 6. 文章の品質の集計（月初だけ・D10・`docs/refresh/text-quality/design.md`）

**`pipeline/data/analysis_quality/` に日本時間の先月のファイルが無ければ**作る。あれば飛ばす。

```
cd pipeline/analysis && python3 quality.py report
```

- 先月に書いた分析を物差しで数え、版5の分布と比べたものが書かれる。**ずれていても規格は直さない**（spec 1.14）。ずれていれば知らせ（Issue）が立つ
- 物差し（`quality.py`）と版5の分布（`quality_baseline.json`）は通る基準のファイル。触らない

## 7. ビルドと確かめ

```
cd pipeline
npm run build:data -- --out ../web/public/data
npm run build:brand
npm run check:data
npm test
cd ../web && npm test
```

- E2E は CI が回す。手元では回さなくてよい
- **落ちたら原因を調べて直す。** やり直しで直らない失敗（EDINET の形式の変更・コードの不具合）は、原因のコードを直して今日の PR に入れる（spec 1.12）
- **テスト・止める線の閾値（`pipeline/refresh/thresholds.json`）・生成の規格（`pipeline/*/prompts/`）を変えないと通らないなら、変えてよいが、その PR は自動でマージされない**（`pipeline/refresh/criteria.txt`）。データの更新だけを先に入れたいので、**基準を変える修正は別の PR にする**: 今日のデータの PR からはその修正を外し、落ちる会社を前の期の数字のまま残せるならそうする。残せないなら、今日はデータの PR を立てずに基準の PR だけを立てる

## 8. PR

**変更が1つも無ければ（`git status` が空）、PR を立てずに終わる。** その旨だけを返す。

1. 変更をコミットする（`pipeline/`・`web/public/`・`web/lib/brand/ogFacts.ts` と、直したコード）。メッセージは `データ更新 <日本時間の日付>` と、何社の数字を替えたか・新しく載った会社・働きやすさの版・文章を合わせた会社（前の書類のまま残った工程があればその理由）
2. 指定のブランチに push する
3. PR を立てる。タイトルは `データ更新 <日本時間の日付>`、本文は `.github/pull_request_template.md` の節で、「対応 Issue」には「定期実行のデータ更新（Issue なし）」と書く。動作チェックには 7. で回したものを書く
4. **PR に `refresh` のラベルを付ける**（GitHub のツールで Issue としてラベルを足す）。付けないと自動でマージされない
5. **PR を購読しない・CI を待たない**（見張りは自動マージと知らせのワークフローが引き受ける）。そのまま終わる。最後に、今日やったこと（数字・新しい会社・待ち行列・働きやすさ・文章・直したコード）を短くまとめて返す
