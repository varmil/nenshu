# design.md — W0 働きやすさデータの取り込み

Issue: [#149](https://github.com/varmil/nenshu/issues/149) ／ 親 [#148](https://github.com/varmil/nenshu/issues/148)
参照: `docs/worklife/spec.md` 1.（データ）、ADR-0009、ADR-0006

出来上がった内部構造。作業の順序は `plan.md`、施策を跨ぐ決定は ADR にある。

## ディレクトリ構成

```
pipeline/
  salary/          ← salary35 から改名。有報＋賃金カーブで年収データセットを作る
  worklife/        ← この Unit で足した
    source/        女性活躍DBの ZIP の置き場（gitignore）
    manifest.json  置いた ZIP のファイル名・sha256・行数・突合結果
    csv.ts         引用符と改行を含む CSV の読み書き
    positivedb.ts  236列の検証・位置での読み取り・正規化
    json.ts        worklife.json の並び（エンコード／デコード）
    extract.ts     ZIP → data/worklife_2026.csv
  data/
    worklife_2026.csv   1,548行。コミットする
  scripts/build-data.ts  worklife_2026.csv → web/public/data/worklife.json
```

**ディレクトリは「作るデータセット」で切り、ソースはファイル名で表す。** `salary/` が EDINET と e-Stat の2ソースを使うのと同じで、`worklife/` も将来ソースが増えうる（若者雇用促進総合サイト）。ソース名でディレクトリを切ると、そのとき割れる。

**`salary35` → `salary` の改名で置換したのはパスだけ。** CSV の `salary35` 列と Python の変数名は触っていない——列は「35歳時点の推定年収」を正しく指しており、`build-data.test.ts` が Python と TypeScript の実装一致を全1,867社で固定している。

## データの流れ

```
Edinetcode.zip ─→ run.load_edinet_codelist()（提出者法人番号を追加）
                     ↓
                  unified.py --backfill-corporate-number
                     ↓
      data/ranking_unified_2026.csv（corporate_number 列が増えて22列）
                     ↓                         ↓
女性活躍DB ZIP ─→ worklife/extract.ts ──────────┘（法人番号で内部結合）
                     ↓
      data/worklife_2026.csv（1,548行・33列）
                     ↓
      scripts/build-data.ts の buildWorklife()
                     ↓
      web/public/data/worklife.json（gzip 127.4KB）
```

## 突合

**法人番号だけ**（ADR-0009）。有報側は `edinet_code` から EDINETコードリストの `提出者法人番号` を引いて `corporate_number` 列に持つ。

`backfill_corporate_number()` は**1件でも引けなければ異常終了する**。空のまま進むとその会社だけ黙って「データ無し」になり、突合率が落ちたことに気づけない。実測では1,867社すべてで引けた。

`extract.ts` は女性活躍DBの64,879行を**1行ずつ捨てながら読む**（`forEachCsvRow`）。要るのは1,867社ぶんだけで、236列×64,879行を配列に溜めると1,500万個の文字列になる。

**出力の行順は有報CSVと同じ。** 会社の順序が2つのファイルで食い違わない。

## CSV の読み書き

**`pipeline/scripts/lib/csv.ts` の `split(",")` は使えない。** 「男女の賃金の差異 注釈・説明」は自由記述で、716社ぶんが改行・カンマ・引用符を含む。行で切ると1社の途中で切れる。`worklife/csv.ts` に RFC 4180 の読み書きを置いた。

**引用符の中の CRLF はそのまま残す。** 注釈は箇条書きが多く、改行が意味を持つ。

## 236列の読み方

**位置で読む。名前では引かない。** 見出しには重複があり（`1.採用した労働者に占める女性労働者の割合-女性(%)` が5回など）、名前で引くと最後の列に倒れて静かに別の指標を返す。

`positivedb.ts` が全236列の見出しを定数で持ち、**1つでも違えば `HeaderMismatchError` で止める**。厚労省が列を足したときに添字がずれると、別の指標を残業時間として公開してしまう。

見出し番号（1始まり）と添字の対応は `at()` 1か所に閉じてあり、`COL` は spec.md 1.3 の表と同じ番号で書いてある。

## 値の扱い

| 実測された値 | 実装 |
| --- | --- |
| 平均残業時間 `-16.8` | **落とす**（`normalizeRow` が `DroppedValue` を返し、サマリーに会社名を出す） |
| 有給取得率 100超 | 残す（前年繰越の消化） |
| 男女の賃金の差異 638.6 | 残す（少人数区分の外れ値だが値としては正しい） |
| `-`・空文字・非数値 | `null`。**`0` とは区別する** |

**負の残業時間は全体値と区分別の両方に入っていた。** ビジネスエンジニアリング株式会社の1社で、`overtime_all` と `overtime_unit:正社員` の2箇所。着手前の調査では全体値しか見ておらず、区分別の側は実装して初めて出た。両方に同じ規則をかけている。

**雇用管理区分は畳まない。** 三菱商事は 総合職14.1 / 一般職3.3 / 嘱託その他3.2 / 派遣社員5.6 の4区分を持つ。総合職と派遣社員を平均した数字に意味は無い。

## `worklife.json` の並び

`companies.json` と同じ**文字列プール＋フラットな配列**。定義は `worklife/json.ts` の1か所にある。

```
rows[i] = 0                                  ← 突合できなかった会社
        | [ 残業(全体), 公表範囲idx, 有給(全体),
            差異(全), 差異(正規), 差異(非正規),
            対象期間idx, 集計時点idx, 最終更新idx,   ← ここまで固定9
            残業の区分数, (区分名idx, 値) × 区分数,
            有給の区分数, (区分名idx, 値) × 区分数 ]
notes[i] = 0 | "自由記述"                     ← 716社だけ持つ
```

**行は `companies.rows` と同じ並び。** `stats.json` と同じ制約で、**行がずれると別の会社の残業時間を出す**。`build-data.test.ts` が全行で固定している。

**雇用管理区分は件数を先に置いて可変長にした。** 5スロット固定にすると、区分を持たない会社（残業で1,124社）のぶんだけ空の要素が並ぶ。可変長にして要素数がおよそ半分になった。

**注釈は行の配列と別に持つ。** 平均186字の長い文字列で、数値だけを読む場面で跨がずに済む。

**この並びは W1（表示）の読み手が写すことになる。** web からは `pipeline/` を import できないので、`decodeRow` と同じ規則を web 側にもう一度書く必要がある。**変えるときは両側を直す**——`json.ts` の冒頭にその旨を書いてある。

## 実測

### 突合と記入率（`npm run extract:worklife` の出力）

```
4e6b3d07-99_20260820_utf8_bom.zip  sha256 8fbe973ba01f11d4…  64879行
法人番号で突合: 1690社 (90.5%)
  うち3指標のいずれも無い: 142社（行を作らない）
data/worklife_2026.csv: 1548行
  平均残業時間        1037社（突合比 61.4% / 全社比 55.5%）
  年次有給休暇の取得率 1032社（突合比 61.1% / 全社比 55.3%）
  男女の賃金の差異    1475社（突合比 87.3% / 全社比 79.0%）
  賃金の差異の注釈    716社（突合比 42.4% / 全社比 38.4%）

落とした異常値 2件:
  ビジネスエンジニアリング株式会社（9010001101119） overtime_all = -16.8
  ビジネスエンジニアリング株式会社（9010001101119） overtime_unit:正社員 = -16.8
```

**着手前の調査（1,038社）と残業の記入率が1社違う**のは、異常値を落とした会社が残業を1つも持たなくなったため。**注釈も718社→716社**で、これは3指標を1つも持たない2社が行ごと落ちたため。

### サイズと Worker（`opennextjs-cloudflare build` → `wrangler dev --local`）

| | W0 の前 | W0 の後 | 差 |
| --- | ---: | ---: | ---: |
| トップ `/` の HTML（raw） | 373,821 B | **373,821 B** | **±0** |
| `/company/6861` の HTML（raw） | 97,511 B | **97,511 B** | **±0** |
| Worker バンドル（gzip） | 1,462.72 KiB | **1,462.71 KiB** | **±0** |
| `worklife.json` | — | gzip 127.4 KB | — |

**`worklife.json` はまだどこからも import していない**ので、Worker には1バイトも入っていない。W1 で `/company/[id]` が読んだ時点で、着手前に測った +152.5 KiB（gzip）ぶんが乗る。

gzip の上限は **160KB** に置いた（実測127.4KB に対して2割強の余白）。超えたら注釈を別ファイルに切り出す——増分の6割がそこなので、最初の手札になる。

## 決めたこと

**注釈・説明は同梱する。** 着手前に「同梱したまま Worker で測って、効いていたら分ける」と決め、測った結果は初回リクエスト +約20ms・定常は変化なしだった。v1 は同梱でよい。

**DuckDB・D1 は使わない。** 1,690行の読み取り専用データで、リクエスト時の処理は主キーで1行引くだけ。DuckDB-WASM は Workers のバンドル上限（gzip 3MB）に入らない。D1 が要るのは Issue #22（4,000社規模）の側。

## 既知の負債

**~~`build-logos.ts` の `readEdinetCodeZip`~~ は外した。** `corporate_number` が CSV に入ったので、ロゴのパイプラインが `Edinetcode.zip` を別途読む必要が無くなった。同じ列を2箇所から引くと、片方だけ古いスナップショットを見る状態を作れてしまう。

外す前に**全1,867社で値が一致することを確かめた**（ZIPから引けない会社0件・値が違う会社0件）。使われなくなった `scripts/lib/logo/houjin.ts`（`parseEdinetCodeList` / `splitCsvLine` / `readEdinetCodeZip`）と、それを見ていたテスト2件も消した。CSV の引用符処理はより完全な `worklife/csv.ts` が持っている。

**これで `Edinetcode.zip` を必要とするのは Python 側（`unified.py --backfill-corporate-number`）の1か所だけになった。**

**`pipeline/tsconfig.json` の `npx tsc --noEmit` は W0 の前から `build-data.ts:119` で落ちる**（`readonly` タプルと `CompaniesShape` の不一致）。pipeline に `typecheck` スクリプトは無く CI にも乗っていないので、この Unit では触っていない。
