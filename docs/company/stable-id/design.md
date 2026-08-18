# C0 企業IDの安定化 — design.md

参照: Issue #51, `docs/adr/0006-public-url-strategy.md`, `docs/company/stable-id/plan.md`

## データフロー

```
Edinetcode.zip（公開・APIキー不要）
        │  提出者名 / 証券コード / 上場区分 / EDINETコード
        ▼
unified.py  backfill_edinet_code()
        │  edinet_code 列を埋める
        ▼
data/ranking_unified_2026.csv
        │  parseUnifiedCsv() → UnifiedRow.edinetCode
        ▼
scripts/lib/slug.ts  makeId()
        │  sec_code || edinet_code
        ▼
web/public/data/companies.json  rows[i][0]
        │
        ▼
/company/[id]   ← C1（#52）で実装する
```

EDINET から取り直す通常経路（`run.build()` → `unified.build()`）では、`edinet.to_record()` が既に `edinet_code` を record に入れているため、`HEADERS` に列を足すだけで埋まる。`backfill_edinet_code()` は **既存 CSV に後から列を足すための経路**で、`--from-csv` と同じ位置づけになる。

## 突合のアルゴリズム

`Edinetcode.zip` は現時点のスナップショットなので、証券コードだけでは足りない（上場廃止で証券コードが外れた3社が引けない）。段階的に絞る。

```
1. 証券コード（4桁）で引く。候補が1件ならそれを採る          … 1,757件
2. 正規化した社名で引く。候補が1件ならそれを採る               …   109件
3. 候補が複数 → CSV の listed 列（上場区分）が一致するものに絞る …     1件
4. まだ複数 → 他の行に未割り当てのコードに絞る
5. それでも決まらない → 社名を列挙して異常終了する            …     0件
```

社名の正規化は `NFKC` 正規化のうえ空白（半角・全角）をすべて除去するだけにする。法人格は**除去しない**——コードリスト側も法人格を含む正式名称を持っており、除去すると同名衝突が増えるだけで得が無い。

### なぜ上場区分での絞り込みが要るか

CSV に「日本瓦斯株式会社」が2件ある。

| 社名 | 証券コード | 上場区分 | 業種 | EDINETコード |
| --- | --- | --- | --- | --- |
| 日本瓦斯株式会社 | 8174 | 上場 | 小売業 | `E03051` |
| 日本瓦斯株式会社 | （無し） | 非上場 | 電気・ガス業 | `E04524` |

前者は手順1で決まる。後者は社名だけでは `E03051` と区別できず、上場区分で `E04524` に落ちる。手順4（未割り当てで絞る）も同じ答えを出すが、意味のある根拠で先に絞るほうを前に置いた。

### 未解決を異常終了にする理由

空のまま進めると `makeId` が例外を投げる場所まで問題が持ち越され、原因が分かりにくくなる。何より、**同名の別会社に静かに紐づくとURLが別の会社を指したまま公開される**。パイプラインの側で「解決できなかった社名」を全部出して止める。

## `makeId` の変更

```ts
export function makeId(row: { secCode: string; edinetCode: string; name: string }): string {
  if (row.secCode) return row.secCode;
  if (row.edinetCode) return row.edinetCode;
  throw new Error(`${row.name} に証券コードもEDINETコードもありません`);
}
```

`docId` を引数から落とす。**書類ID由来のフォールバックを残さない**のがこの Unit の眼目なので、渡せる状態にしておかない。

`makeId` が例外を投げうるので、`build-data.ts` の呼び出しは今までどおり（`buildData` 全体が throw する設計に既に乗っている）。

## CSV の列

`edinet_code` は `doc_id` の直前に置く。EDINET 由来の識別子どうしを隣に並べ、`git diff` を読みやすくする。

```
… , badge, industry, source, period_end, edinet_code, doc_id
```

`csv.ts` の `HEADER` はこの並びと1文字ずつ一致していなければ例外を投げる作りなので、Python 側の `HEADERS` と同時に直す。

## 冪等性

`--backfill-edinet-code` は、既に `edinet_code` が埋まっている行もそのまま突合し直して同じ値を書く。2回流しても差分が出ない。既存値を信用して飛ばさないのは、**列があること**と**中身が正しいこと**を別に扱わないため。

## テストの位置

`pipeline/scripts/build-data.test.ts` に足す。ここは既に「CSV を読んで `companies.json` を組み立てる」経路全体を実データで固定している場所で、ID もその成果物の一部になる。

Python 側の `backfill_edinet_code` に単体テストは置かない。テストを書くとコードリストのモックを持つことになり、**実物のコードリストと突合して1,867件が解決すること**のほうが確かめたい性質そのものだからである。代わりに「未解決なら異常終了」を実行時の不変条件として置き、TypeScript 側のテストが結果（一意性・形式・具体的な会社のID）を固定する。

## 変えないもの

- ランキングの表示・挙動。`id` は React の `key` にしか使われていない（`RankingTable.tsx`・`RankingCardList.tsx`）
- `salary35` などの派生列。この Unit は推定式に触らない
- `companies.json` のスキーマ（`CompanyRow[0]` が `id` であることは変わらない）
