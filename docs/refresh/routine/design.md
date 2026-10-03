# design.md — D8 定期実行・自動マージ・知らせ

Issue: [#878](https://github.com/varmil/nenshu/issues/878)
spec: `docs/refresh/spec.md` 1.12・1.13・1.14・1.17・AC-12・AC-14・AC-18 ／ 段取り: `plan.md` ／ 使う Unit: D4（`docs/refresh/numbers/`）・D7（`docs/refresh/worklife-fetch/`）・D1（`docs/refresh/ci/`）

毎日1回、定期実行のセッションがデータを更新して PR を立てる。**マージするか・知らせるかは GitHub Actions が決める**——どちらもセッションの報告ではなく、CI の結果とリポジトリのファイルから。

---

## 全体

```
定期実行（Claude Code の Routine・毎日 日本時間の朝）
  └ .claude/skills/refresh-daily/SKILL.md の手順
      数字（D4）→ 女性活躍DB（D7）→ ビルド → 文章（D6）→ 品質の集計（D10・月初だけ）→ ビルド → テスト → PR（ラベル refresh）
                                                          │
GitHub Actions                                            ▼
  ci.yml（D1）── 完了（または PR にラベル）──→ refresh-automerge.yml ─→ automerge.py
                                    ├ マージ（CI が通り、基準のファイルに触れていない）
                                    ├ refresh-criteria を付けて止める（基準のファイルに触れている）
                                    ├ refresh-ci-failed を付ける（CI が落ちた）
                                    └ refresh-alerts.yml を呼ぶ
  refresh-alerts.yml ─→ alerts.py sync（main への push・上から呼ばれたとき・毎日 12:17）
                          件を数え、Issue を立てる／直す／閉じる（ラベル refresh-alert）
```

| ファイル | 役目 |
| --- | --- |
| `.claude/skills/refresh-daily/SKILL.md` | 定期実行の手順。定期実行の設定は「この skill に従う」だけを書く |
| `.claude/skills/refresh-daily/texts.md` | そのうち文章の工程（D6・`docs/refresh/text-refresh/design.md`） |
| `.github/workflows/refresh-automerge.yml` | CI の完了を受けて automerge.py を呼ぶ |
| `.github/workflows/refresh-alerts.yml` | alerts.py sync を呼ぶ |
| `pipeline/refresh/automerge.py` | マージするかの判定（`decide`）と、ラベル・マージ |
| `pipeline/refresh/alerts.py` | 件の数え上げ（`collect`）と Issue との突き合わせ（`plan`） |
| `pipeline/refresh/criteria.txt` | 通る基準のファイルの一覧 |
| `pipeline/refresh/thresholds.json` | 止める線の閾値（1か所に寄せた） |

## どこで何を回すか

- **機械の工程（EDINET・女性活躍DB の取得、ビルド）も定期実行のセッションの中で回す。** API キー（`EDINET_API_KEY` など）はこの環境の環境変数にあり、GitHub Actions で回すにはリポジトリの secrets を運営者が設定する手間が増える。線 B の読み直しは生成AIの工程なので、どのみちセッションが要る。取得の作法（女性活躍DB の名乗りと1日1回）もセッションの中で守られる
- **判定は GitHub Actions で回す。** 「テストが通ったか」をセッションの報告で決めない（spec 1.12・C6 の「報告を数えない。ファイルを数える」）
- **有料のサービスは増やしていない。** 定期実行は Claude Code のセッション（ADR-0010 の追記）、判定は GitHub Actions、配信は Cloudflare Workers の無料枠のまま

## 定期実行

- Claude Code の Routine（毎日・日本時間 6:46。`CRON_TZ=Asia/Tokyo 46 6 * * *`）。**定時の発火は、リポジトリ付きの1つのセッションに新しい依頼として届く**（2026-09-30 の発火で確かめた）。毎日新しいセッションを立てる形ではない
  - **前の回の会話はセッションに残るが、使わない。** 依頼文が毎回「main から作り直し、`SKILL.md` を読み直す」を言い、手順と状態はリポジトリにある。会話が長くなれば自動で要約される（2回の回で約48万トークン）
  - **手で発火（`fire_trigger`）させると、リポジトリの無い新しいセッションが立つ**（2026-09-29 に確かめた）。手で1回回したいときは、そのセッションにメッセージを送る
  - **そのセッションが消えると定期実行は止まる。** 止まったことは知らせ（`routine:stalled`）が拾う
  - **セッションを立て直すとき**は、リポジトリを付けた新しいセッションを立て、同じ依頼文・同じ時刻の Routine をそのセッションに向けて作り、前の Routine を止める（Routine の向け先は後から変えられない）
- 設定に書くのは「`refresh-daily` の skill に従う」と、PR を購読しないことだけ。**手順の変更は PR で入れる**（`.claude/` は基準のファイル）
- **モデルと推論の設定**（spec 1.14）: Sonnet の最新版（いまは `claude-sonnet-5-5`）・推論は「超高」（`xhigh`）。Sonnet に新しい版が出たら、定期実行のモデルを乗り換える（基準の変更には当たらない）。版5は Opus 5 で書かれているので、モデルを変えたことによる品質のずれは月1回の見張り（D10）が見る
  - **モデルは定期実行のセッションの設定に、推論はリポジトリの `.claude/settings.json` の `effortLevel` に持つ。** Routine にもセッションの設定にも推論の欄が無い。2026-09-30 の回は `effortLevel` が無く、推論は `medium` だった（文章の記録の `claude-opus-5-5@medium`・16社。この回はまだ Opus を使っていた）
  - **サブエージェントには `model` を指定しない。** セッションのモデルを引き継ぐ。指定すると、セッションの設定と違うモデルで書き、記録にもそのモデルが残る（2026-10-02・10-03 の回は、docs が Opus と書いていたため私が `opus` を指定していた）
  - **推論の強さは、サブエージェントのシステムプロンプトの `reasoning_effort` の数字で確かめられる**（`xhigh` で Opus 40・Sonnet 30、`medium` で Opus 10。2026-10-03 に確かめた。数字はモデルごとの目盛りで、名前との対応表は無い）
  - **`effortLevel` はセッションの起動時にしか読まれない。** 実行中のセッションは設定ファイルを変えても元のまま。変えたら定期実行のセッションを立て直す（上）
  - この設定はこのリポジトリで開く**すべての**セッションの既定になる（会話の中の `/effort` で変えられる）
  - **実際に使った推論は文章の記録（`<モデル>@<推論>`）に残り、決めた設定と違えば知らせ（`routine:effort`）が立つ**
- セッションは PR を立ててラベルを付けたら終わる。CI を待たない・マージしない・購読しない
- 前の回の PR に `refresh-ci-failed` が付いていれば、原因を調べて直した上で今日の PR に入れ、前の PR を閉じる。**今日の回は main の `universe.json` から読み直すので、前の回の書類を取りこぼさない**

## 自動マージ

`refresh-automerge.yml` が CI（`ci.yml`）の完了を受けて動く。**PR に `refresh` のラベルが付いたときにも動く**（`pull_request_target`）——セッションは PR を立ててからラベルを付けるので、CI がそれより先に終わると取りこぼす。このときはその PR の最新のコミットの CI を探し、終わっていれば判定し、終わっていなければ CI の完了を待つ。どちらのきっかけでも PR のコードは checkout しない。**動くのは main にあるワークフローとスクリプト**（`workflow_run` はデフォルトブランチの定義を使い、チェックアウトも main）なので、PR の側で判定や基準の一覧を書き換えても、その PR の判定には効かない。

`decide()` の判定（上から順に）:

| 条件 | 結果 |
| --- | --- |
| PR が開いていない・`refresh` のラベルが無い・CI の実行が PR の最新のコミットのものでない | 何もしない |
| CI の3つのジョブ（`pipeline`・`web`・`e2e`）のどれかが `success` でない | `refresh-ci-failed` を付ける |
| 基準のファイルに1つでも触れている | `refresh-criteria` を付け、触れたファイルを PR にコメントして止める |
| それ以外 | squash でマージする（`--match-head-commit` で、判定した後に積まれたコミットは入れない） |

- **ラベルの無い PR（運営者・Unit の PR）は自動ではマージしない。** Unit の PR は CLAUDE.md「Unit完了後の運用」のとおり
- マージは `GITHUB_TOKEN` で行う。**`GITHUB_TOKEN` の push は他のワークフローを起こさない**ので、知らせの同期は `workflow_dispatch` で呼ぶ（これだけは起こせる）。Cloudflare のビルドは GitHub App への通知で動くので、`GITHUB_TOKEN` のマージでも本番に出る
- ジョブの名前は `ci.yml` と `automerge.py` の `REQUIRED_JOBS` の2か所にある。変えるなら両方

### 通る基準のファイル

`pipeline/refresh/criteria.txt`（glob）。spec 1.12 の3つに、それを迂回できるものを足した。

| 区分 | ファイル | 入れた理由 |
| --- | --- | --- |
| テスト | `**/*.test.ts(x)`・`**/test_*.py`・`web/e2e/**`・`web/testing/**`・テストの設定・`pipeline/scripts/check-data.ts`・`tools/perturb/**` | spec 1.12 |
| テストを回す仕組み | `package.json`（3つ）・`.husky/**`・`.lintstagedrc.mjs`・`.github/**` | `test` のスクリプトや CI を書き換えればテストを外せる |
| 止める線の閾値 | `pipeline/refresh/thresholds.json` | spec 1.12。4つのファイルに散っていた定数を1つに寄せた |
| 生成の規格 | `pipeline/*/prompts/**`・`pipeline/analysis/gate.py`・`pipeline/summary/gate.py` | spec 1.12。機械ゲートは規格の一部 |
| 文章の品質の物差し（D10） | `pipeline/analysis/quality.py`・`quality_baseline.json` | 書き換えると知らせが消せる |
| 手順と判定そのもの | `.claude/**`・`criteria.txt`・`automerge.py`・`alerts.py` | 手順を書き換えて工程を飛ばせる。一覧を書き換えて自分を外せる（main の一覧で判定するので効かないが、入った後の回に効く） |

**`build-data.ts` は入れていない。** ビルドの中のガード（社数の減り・台帳と成果物の突き合わせ・推移の右端）はここにあるが、やり直しで直らない失敗を直す PR（spec 1.12）の多くがここに触れる。閾値は `thresholds.json` に出したので、線の値を変える PR は見分けられる。ガードそのものを外す変更は、`build-data.test.ts`（基準）が落ちることで止まる。

## 知らせ

`alerts.py` が件を数え、開いている `refresh-alert` の Issue と突き合わせる。

| 鍵 | 件 | 出どころ |
| --- | --- | --- |
| `numbers:<EDINETコード>` | 数字を反映できなかった会社 | `pipeline/data/numbers_pending.csv`。`unresolved`・`not_eligible` はすぐ、`fetch_failed`・`reread` は2日続けて残ったら（1回の取得の失敗は次の回で直ることが多い） |
| `texts:<EDINETコード>` | 文章を書き直せず、前の書類の文章のまま出している会社（D6） | `pipeline/data/texts_pending.csv`。1社1件で、落ちた工程を並べる。同じ書類では選び直さないのですぐ |
| `quality:analysis` | 分析の書き方が版5からずれている（D10・`docs/refresh/text-quality/design.md`） | `pipeline/data/analysis_quality/` のいちばん新しい月の集計。次の月がずれていなければ閉じる |
| `worklife:rejected` | 女性活躍DB の版を検証で落とした | `pipeline/worklife/manifest.json` の `rejected` |
| `routine:stalled` | 定期実行が止まっている | `pipeline/data/universe.json` の書類一覧を読んだ日が3日以上前（ふだんは昨日） |
| `routine:effort` | 定期実行の推論の設定が決めたものと違う | `pipeline/data/company_analysis.csv` のいちばん新しい日（日本時間）に書いた分析の `model`（`<モデル>@<推論>`）を、`.claude/settings.json` の `effortLevel` と比べる。次の回が決めた設定で書けば閉じる |
| `pr-criteria:<番号>` | 基準を変えるので止めた PR | 開いている `refresh` の PR の `refresh-criteria` |
| `pr-failed:<番号>` | CI が落ちた PR | 同じく `refresh-ci-failed` |

- **1件につき Issue 1つ。鍵は本文の1行目**（`鍵: numbers:E02485`）。タイトルは中身が変われば直す
- 件が無くなったら Issue を閉じる（コメントを残す）。同じ鍵の Issue が2つあれば新しいほうを閉じる。**鍵の無い Issue には触らない**（運営者が手で立てたもの）
- 件は **main のファイル**から数える。マージされていない PR の中の待ち行列は数えない——その PR が止まっていること自体が件になる
- **「コードでは直せない失敗」**（API キーの失効・外部サービスの設定）は、書類一覧が進まなくなることで `routine:stalled` として現れる。専用の件は置いていない
- Issue は `GITHUB_TOKEN`（github-actions）が立てる。セッションの GitHub のツールで Issue を書くと山括弧の文字列が落ちる（CLAUDE.md）ので、そちらは使わない

## 閾値

`pipeline/refresh/thresholds.json`。値は D4・D7・D0 で決めたまま。

| キー | 値 | 使う場所 |
| --- | --- | --- |
| `numbers.rereadChange` | 0.5 | 線 B ①（`update_numbers.py`） |
| `numbers.rereadTop` | 30 | 線 B ② |
| `build.maxCountDropRatio` | 0.05 | ビルドの社数の減り（`build-data.ts` の `checkCountDrop`） |
| `build.maxPeriodRangeMonths` | 36 | 決算期の幅（`build-data.ts`） |
| `worklife.maxMatchedDropRatio` | 0.05 | 女性活躍DB の突合の減り（`extract.ts`） |

Python は `json` で、TypeScript は `pipeline/scripts/lib/thresholds.ts` で読む。

## テスト

- `pipeline/refresh/test_automerge.py`: glob の読み方、**いまの `criteria.txt` で**データ更新の PR が触るファイル（D4・D7 の1回目で実際に変わったもの）は基準に当たらず、コードの修正も当たらず、基準の各区分は当たること。`decide()` の各分岐、どの PR をどの CI の実行で判定するか（`targets()`。ラベルが CI の後に付いた場合・先に付いた場合）
- `pipeline/refresh/test_alerts.py`: 待ち行列の理由ごとの件の出し方（取り直すものは2日目から）、女性活躍DB・止まっている・推論の設定（日本時間のいちばん新しい日だけ・リポジトリの設定が `xhigh`）・PR のラベルの件、Issue との突き合わせ（立てる・直す・閉じる・重複を閉じる・鍵の無い Issue に触らない）
- ワークフローそのものは main に入ってからしか動かない（`workflow_run`）。入った後の1回目の定期実行で、PR → CI → マージ → 知らせの同期を通しで確かめる（2026-09-29 の手の回 #894・2026-09-30 の定時の回 #899 で、PR が立ってから4分前後でマージされ、直後に知らせが同期された）
