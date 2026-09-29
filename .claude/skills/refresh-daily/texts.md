# 定期実行: 文章の差分生成（refresh の D6）

`SKILL.md` の「5. 文章」から読む。設計は `docs/refresh/text-refresh/design.md`、仕様は `docs/refresh/spec.md` 1.5〜1.8。

数字が新しい書類に替わった会社の文章（分析と要約・説明文・給与の決定方針）を、新しい書類に合わせる。**規格（`pipeline/*/prompts/`）は1字も変えない。** 生成と検証はエージェント（Agent ツール）に回させ、このセッションは機械の工程と、その間の受け渡しだけをする。

## 決まり

- **1社の工程を全部終えてから次の会社に移る**（spec 1.6）。順番は 分析と要約 → 説明文 → 給与の決定方針 → 台帳。ほかの会社の分析を先に書き進めない
- **生成と検証は別のエージェントに回させる。** 同じエージェントに自分の文を検証させない。書き直しのたびに検証は新しいエージェントにする
- **エージェントの報告を数えない。ファイルを数える。** 通ったかどうかは `merge` と `finish` が成果物から決める
- **書き直しは工程ごとに2回まで。** それでも通らなければそのまま `merge` する——前の書類の文章が残り、`finish` が理由を待ち行列に書き、知らせ（Issue）が立つ。**通すために規格を緩めない・検証の判定を覆さない**
- 1社の途中で詰まった（コマンドが落ちる・エージェントが書かない）ら、その工程は飛ばして次の工程へ進み、最後に `finish` を回す。落ちた工程は待ち行列に残る

## 0. 選ぶ・モデルを決める

```
cd pipeline/refresh
python3 update_texts.py queue --limit <上限>
```

- 上限は `SKILL.md` にある。出てきた会社を上から順に処理する
- 書いたモデルを記録する値を決める: `MODEL="<このセッションのモデル ID>@${CLAUDE_EFFORT}"`（モデル ID はシステムプロンプトにある。例 `claude-opus-5-5@xhigh`）。3つの工程の `merge` に渡す

## 1. 原文を取る

```
python3 update_texts.py prepare <EDINETコード>
```

工程ごとに「回せる」か理由が出る。**回せない工程は飛ばす**（`finish` が理由を待ち行列に書く）。`queue` がその会社に選ばなかった工程も飛ばす。

## 2. 分析と要約（`pipeline/analysis/`）

```
cd pipeline/analysis
python3 generate.py clear
python3 generate.py plan --only <EDINETコード>
```

1. **生成エージェント**に `prompts/gen_task.md` の手順を渡す（バッチ `work/batch_0001.json` → `work/gen_0001.jsonl`）
2. `python3 generate.py gate`。要約か分析が機械ゲートに落ちたら、`work/gate_reasons.jsonl` の理由を生成エージェントに渡して `gen_0001.jsonl` を書き直させ、`gate` をやり直す（書き直しの回数に数える）
3. **検証エージェント**（生成とは別）に `prompts/verify_task.md` の手順を渡す（`work/gated_0001.json` → `work/verify_0001.jsonl`）
4. `false` があれば、その理由を生成エージェントに渡して **`work/gated_0001.json` のその会社の本文**（`summary`・`headline`・`analysis`）を書き直させる（`prompts/verify.md`「落ちたら書き直す」）。`python3 generate.py check-gated` で機械ゲートを当て直し、通ったら新しい検証エージェントに 3. をやり直させる
5. `python3 generate.py merge --model "$MODEL"`

## 3. 説明文（`pipeline/summary/`）

```
cd pipeline/summary
python3 generate.py clear
python3 generate.py plan --only <EDINETコード>
```

- **前の説明文がある会社は検証だけ**（spec 1.8）。`plan` が前の文を生成物（`gen_0001.jsonl`）として置くので、生成エージェントは要らない。**前の説明文が無い会社**は「書く」バッチになるので、生成エージェントに `prompts/generate.md` の手順を渡す（`work/batch_NNNN.json` → `work/gen_NNNN.jsonl`）
- `python3 generate.py gate` → **検証エージェント**に `prompts/verify.md` の手順を渡す（`work/gated_0001.json` → `work/verify_0001.jsonl`）
- `python3 generate.py retry`。書き直す会社があれば、生成エージェントに `prompts/generate.md` の「書き直し」で書かせ、`gate` → 新しい検証エージェント → `retry` を繰り返す（`retry` が2回で止める）
- `python3 generate.py merge --model "$MODEL"`。検証だけで通った会社は、文と書いたモデルが前のままで出典が新しい書類になる。落ちた会社は前の説明文が残る

## 4. 給与の決定方針（`pipeline/paypolicy/`）

```
cd pipeline/paypolicy
python3 pick.py clear
python3 pick.py plan --docs <数字の書類 ID>
```

1. **エージェント**に `prompts/pick.md` の手順を渡す（`work/batch_0001.json` → `work/pick_0001.jsonl`）。文は書かせず、番号だけを答えさせる
2. `python3 pick.py gate`。落ちたら（範囲が不正・答えが無い）その理由をエージェントに渡して `pick_0001.jsonl` を書き直させ、`gate` をやり直す（2回まで）
3. `python3 pick.py merge --model "$MODEL"`
4. **`referenced`（参照だけ）と答えたら**、`python3 pick.py plan --referenced --docs <書類 ID>` で参照先の節のバッチ（`batch_0002.json`）を作り、1〜3 をやり直す（`pick_0002.jsonl`）

## 5. 台帳に書く

```
cd pipeline/refresh
python3 update_texts.py finish <EDINETコード>
```

工程ごとに「新しい書類になった」か「前の書類のまま——理由」が出る。ここまでで1社。次の会社の 1. へ。

## 終わったら

- 処理した会社・前の書類のまま残った工程と理由を、PR の本文と最後の報告に書く
- ビルドは `SKILL.md` の 6. で回し直す（説明文・要約と分析・給与の決定方針がデータに入る）
