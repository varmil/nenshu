# design.md — D6 文章の差分生成

Issue: [#876](https://github.com/varmil/nenshu/issues/876) ／ plan: `plan.md` ／ spec: `docs/refresh/spec.md` 1.5〜1.9・1.11・1.13・1.14・AC-4・AC-5・AC-6・AC-16

数字が新しい書類に替わった会社の文章（分析と要約・説明文・給与の決定方針）を、定期実行の中で1社ずつ新しい書類に合わせる。機械の仕事は `pipeline/refresh/update_texts.py` と各工程のスクリプトが持ち、生成と検証は定期実行のセッションがエージェントに回させる。手順は `.claude/skills/refresh-daily/texts.md`。

---

## 出来上がり

```
定期実行（SKILL.md）
  2. 数字 → 3. 女性活躍DB → 4. ビルド
  5. 文章 ─ update_texts.py queue --limit 16
            └ 1社ずつ:
                update_texts.py prepare <会社>          原文を取る
                analysis/generate.py  plan --only → 生成 → gate → 検証 → (書き直し) → merge
                summary/generate.py   plan --only → (生成) → gate → 検証 → retry → merge
                paypolicy/pick.py     plan --docs → 判定 → gate → merge（参照なら2回目）
                update_texts.py finish <会社>           台帳と文章の待ち行列
  6. ビルドと確かめ → 7. PR
```

| もの | 置き場所 | git |
| --- | --- | --- |
| 選び方・原文の取得・台帳と待ち行列への書き込み | `pipeline/refresh/update_texts.py` | ○ |
| 文章の待ち行列（落ちた工程と理由） | `pipeline/data/texts_pending.csv` | ○ |
| 分析の切った原文（1社ぶん取り直したもの） | `pipeline/analysis/cache/overlay.csv` | ×（`.gitignore`） |
| 分析の原文の字数と SHA-1 | `pipeline/data/analysis_text_manifest.csv`（その会社の行を差し替える） | ○ |
| 説明文の原文（事業の内容） | `pipeline/data/business_text.csv`（その会社の行を差し替える） | ○ |
| 給与の決定方針の節の HTML | `pipeline/paypolicy/cache/<書類ID>.json` | × |
| `prepare` の結果（工程ごとに回せるか） | `pipeline/refresh/work/texts/<会社>.json` | × |
| 定期実行の手順 | `.claude/skills/refresh-daily/texts.md` | ○（通る基準のファイル） |

## 選び方（`queue`）

台帳（`ledger.csv`）の工程ごとの書類が、数字の書類（`doc_numbers`）と食い違う会社を拾う。

- **工程**は3つ: 分析と要約（`doc_analysis`）・説明文（`doc_description`）・給与の決定方針（`doc_pay_policy`）。**給与の決定方針は、数字の書類の決算期末が 2026-03-31 以後の会社だけ**（開示府令 (58-2) の適用。`paypolicy/fetch.py` の `FIRST_PERIOD_END`）
- **同じ書類で落ちた工程は選び直さない。** 文章の待ち行列に `(会社, 工程, 書類)` があれば外す。選び直すと、落ち続ける会社が毎日上限を使う。その会社の次の有報が出たら書類が変わるので、また選ばれる
- **並びは、途中で止まった会社が先。** いまの書類で済んだか落ちた工程があり、まだ残っている工程がある会社（spec 1.6「残りは次の回の最初に」）。残りは**実測値の全体順位（`ranking_unified.csv` の `rank_raw`）の高い順**（spec 1.7）
- 上限は `--limit`。値は定期実行の手順（`SKILL.md`）が持つ

新しく載った会社は文章の列が空なので、3つとも選ばれる。書けるまでは節が出ない（ビルドは文章の無い会社に節を出さない。spec 1.9）。

## 原文を1社ぶん取る（`prepare`）

定期実行のコンテナにはキャッシュが無い。選んだ会社の数字の書類だけを EDINET から取る。

- **CSV 形式（type=5）の ZIP**（`edinet.fetch_csv`）から、分析の4節（`extract_analysis.update_one`）と事業の内容（`summary/extract.update_one`）。どちらも全件の抽出と同じ `extract()` を通す
- **XBRL 本体（type=1）**から給与の決定方針の節（`paypolicy/fetch.fetch_one`）。掛かる期のときだけ
- 取れなかった工程は理由を `work/texts/<会社>.json` に残す。その工程は回さず、`finish` が待ち行列に書く

### 分析の原文は gzip を書き直さない

分析は、切った原文の gzip（`analysis_text_cut2200-1500-3000-1500.csv.gz`・17MB）から読む。**1社替えるだけで gzip は全体が別物になり**、毎日コミットすると履歴が17MB ずつ増える。だから:

- 取り直した会社の切った原文は **`analysis/cache/overlay.csv`**（git に置かない）にだけ置く
- コミットするのは**マニフェストのその会社の行**（書類 ID・節ごとの字数と SHA-1）だけ
- `generate.py` の `sources_by_code()` は gzip の上に overlay を重ね、**書類 ID がマニフェストと食い違う行を捨てる**。取り直した会社の gzip の行は古い書類の原文のまま残るので、次のコンテナではその会社は原文が無い扱いになる（使うと、新しい書類の SHA-1 で古い書類の原文から書いた文を取り込むことになる）
- `merge` は**原文に無い会社の行も書き戻す**（`order = src の並び + 残り`）。原文の並びだけで書くと、前の回に取り直した会社の要約と分析が CSV から消える
- 全社を回し直す（規格の版を上げる等）ときは、`extract_analysis.py` でキャッシュから gzip を作り直す。`plan` は使える原文の数がマニフェストと合わなければ止まる（名指しのときは見ない）

説明文の原文（`business_text.csv`）は1社1行の CSV なので、その会社の行を差し替えてコミットする。

## 工程ごとの入口

### 分析と要約（`analysis/generate.py`）

- `plan --only <会社>`: 原文が変わったかどうかは見ずに、名指しの会社のバッチを作る
- 書き直しは C9 と同じく **`work/gated_0001.json` の本文を書き直させて検証をやり直す**（`prompts/verify.md`「落ちたら書き直す」）。`check-gated` が書き直した本文に機械ゲートを当て直す（`merge` まで待たずに分かる）
- `merge` は、書き直しが落ちたら前の版を残す（C9 の183回目から）

### 説明文（`summary/generate.py`）

- `plan --only <会社>`: **前の説明文（`verdict=ok`）がある会社は検証だけ**（spec 1.8）。前の文を生成物（`gen_NNNN.jsonl`）として置いたバッチを作るので、あとは `gate` → 検証パス → `retry` → `merge` のいまの流れに乗る。**前の説明文が無い会社**（新しく載った会社・前に落ちた会社）は書くバッチになる
- `merge` は**書き直しが落ちたら前の説明文を残す**（`reject_reason` に「書き直しが落ちたので前の版を残した（理由）」）。C6 の `merge` は落ちると空で上書きしていた——新しく書くなら「まだ無い」だが、書き直しでは「あったものが消える」
- **文が前と同じなら、書いたモデルと日時は前のまま**（検証だけで通った会社）。出典（`source_doc_id`）だけが新しい書類になる

### 給与の決定方針（`paypolicy/pick.py`）

- `plan --docs <書類 ID>`（C18 からある）
- `merge` は、**答えが決まったら（own・none）同じ会社の前の書類の記録を外す**。記録は書類 ID で持つので、外さないと1社に2行残り、ビルドが古いほうを読む。**参照先で答え直す前（referenced）は外さない**——2回目が通らなければ、`finish` が新しい書類の書きかけを外して前の書類の記録を残す
- 範囲の判定には検証パスが無い（C18 と同じ。文は原文から機械が切り出す）。機械の検査（`gate`）に落ちたら答え直させる

## 台帳と文章の待ち行列（`finish`）

**通ったかどうかは成果物で決める。** 成果物の書類がいまの数字の書類になっていれば通った。エージェントの報告は見ない。

- 台帳の3列を、成果物が指す書類に合わせる（分析 = `company_analysis.csv` の `source_doc_id`、説明文 = `company_summary.csv` の `source_doc_id`、給与の決定方針 = `pay_policy.json` の `doc_id`）。ビルドの `checkLedgerDocs` が同じ突き合わせをしているので、成果物だけ書いて台帳を書かないとビルドが落ちる
- 落ちた工程は **`pipeline/data/texts_pending.csv`** に書く

| 列 | 中身 |
| --- | --- |
| `edinet_code`・`stage`・`doc_id` | 会社・工程（`analysis`・`description`・`pay_policy`）・落ちた書類 |
| `name` | 社名（知らせの題に使う） |
| `reason` | `prepare` の理由（原文が取れない等）か、成果物に残った理由（検証パスの指摘・機械ゲート）。拾えなければ「回していない」 |
| `since` | 最初に落ちた日。同じ書類で落ち続けるあいだは動かない |

- 次の書類で通れば、その工程の行は消える
- 知らせ（`alerts.py`）が1社につき Issue 1つにする（鍵 `texts:<EDINETコード>`）。同じ書類では選び直さないので、1日目から知らせる（数字の `fetch_failed` のような2日の猶予は置かない）

## 書いたモデル（spec 1.14・AC-16）

3つの工程の `merge --model` に、実際に使ったモデルと推論の設定を `<モデル ID>@<推論>` の形で渡す（例 `claude-opus-5-5@xhigh`。推論は環境変数 `CLAUDE_EFFORT`）。

| 工程 | 記録する場所 |
| --- | --- |
| 分析と要約 | `company_analysis.csv` の `model` |
| 説明文 | `company_summary.csv` の `model`。**検証だけで通った会社は前のまま**（文を書いたモデル） |
| 給与の決定方針 | `pay_policy.json` の `model`（C18 の記録には無い。D6 から足す） |

生成と検証のエージェントはセッションのモデルを引き継ぐ。

## 1回の上限

（実測の後に書く）
