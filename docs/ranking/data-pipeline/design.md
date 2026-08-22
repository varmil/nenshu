# U0 データ変換パイプライン — design.md

Unit内部の構造。技術選定の理由もここに含める（施策を横断しない・可逆な判断のため ADR にはしない）。

**2026-08-17追記（Issue #11）**: 当時リポジトリ直下に置いていた `package.json`/`tsconfig.json`/`scripts/`/`data/` は、`web/` との非対称を解消するため `pipeline/` 配下に移動した。以下の本文のパスは移動後（`pipeline/` 配下）の表記に更新済み。移動の経緯・root package.json の分割方針は `docs/ranking/project-foundation/design.md` を参照。

## 配置

`web/`（Next.js アプリ本体）は U1 未着手のため存在しない。U0 をそれに依存させないよう、リポジトリ直下に専用の軽量構成を置く。

```
pipeline/
  package.json              # devDependencies: typescript, tsx, vitest, @types/node
  tsconfig.json
  scripts/
    build-data.ts            # CLI 本体
    lib/
      csv.ts                 # data/ranking_unified_2026.csv の最小パーサ
      curve.ts               # 区分線形補間
      slug.ts                 # id 生成
    build-data.test.ts        # Vitest
```

出力先はデフォルト `public/data/`（ADR-0003 記載のパスそのまま）だが、`--out` 引数で変更可能にする。U1 が Next.js を `web/` にスキャフォールドする際、`--out ../web/public/data` を指定するだけで済むようにするため（`--out` は `pipeline/` からの相対パス）。

**テストランナーは Vitest。** TypeScript ネイティブで設定が軽く、後で Next.js（U1）と同居させても衝突しない。

## データソースの再確認

- `data/ranking_unified_2026.csv`: 1,867行、BOM付き・カンマ区切り・クォートなし（社名にカンマを含む行は0件、確認済み）。21列。
- 18列目の `industry` 列が産業大分類（賃金カーブのキー）をすでに保持している。`salary/curves.py` の `TSE33_TO_INDUSTRY` 表を TypeScript に再実装する必要はない。CSV の `industry` 列をそのまま使えば、`salary35` 列を計算したときと同じ産業キーが保証される。
- `sec_code` が空の行は107件（非上場）。名前の重複は全体で2件（日本瓦斯株式会社、株式会社バッファロー）だが、どちらも sec_code 空欄側では重複していない（確認済み）。
- `tse33` の値は33種類。`data/annual_curves.json` の `ANNUAL_INDUSTRY` は17キー（現在のデータに出現しない産業も含む。将来のデータ更新で出現しうるので17キーすべてを `curves.json` に残す）。
- `badge` 列は `""` または `"本社のみ"` の2値（173件が非空）。
- `avg_salary` / `employees_nonconsolidated` は CSV 上は浮動小数点表記（例: `21783259.0`）だが実質整数。

## `scripts/lib/curve.ts`

`salary/curves.py` の `_interp`（区分線形補間、範囲外は端の値で頭打ち）を直訳する。`bisect_right` 相当は素直な線形探索で十分（10点しかない）。

```ts
export function interpolate(points: number[], values: number[], x: number): number
```

## `scripts/lib/slug.ts`

id 生成方式（ユーザー承認済み: 機械的フォールバック）。

```ts
export function makeId(row: { secCode: string; name: string; docId: string }): string
```

- `secCode` が非空ならそれを返す（1,760件）。
- 空なら `name.normalize('NFKC')` から `[a-zA-Z0-9]` だけを抽出・小文字化し、非空なら `${ascii}-${docId.toLowerCase()}`、空なら `docId.toLowerCase()` を返す（107件）。
- 一意性は連番サフィックスではなく `doc_id`（EDINET書類ID、既に一意）に依存させる。走査順序に依存しない決定的な方式にするため。
- 「読める URL」ではない点は既知の制約として残す。Bolt 2 で企業詳細ページを作る際、正式な読み仮名データを調達してから作り直す前提。

## `scripts/build-data.ts`

1. `data/ranking_unified_2026.csv` を読み、BOM を落として `lib/csv.ts` でパース（1,867行になることをアサート、ならなければ例外で落とす）。
2. `data/annual_curves.json` を読み、`ANNUAL_INDUSTRY` を取り出す（17キー）。
3. `industries` = CSV の `tse33` 列のユニーク値を `localeCompare('ja')` でソート（手打ちの固定表は転記ミスのリスクがあるため避ける。データから再現可能な形にする）。
4. `curveKeys` = `Object.keys(ANNUAL_INDUSTRY)`（JS のオブジェクトキー順は文字列キーなら挿入順で確定するため、`annual_curves.json` に書かれた順がそのまま使える）。
5. 各行について:
   - `id` = `makeId(...)`
   - `tse33Idx` = `industries.indexOf(row.tse33)`
   - `curveIdx` = `curveKeys.indexOf(row.industry)`（見つからなければ例外 — CSV の産業大分類が `ANNUAL_INDUSTRY` のキーと不整合というデータ異常なので、握りつぶさず落とす）
   - `avgAge`, `avgTenure` はそのまま（小数第1位）
   - `avgSalary`, `employees_nonconsolidated` は `Math.round` して整数化
   - `badge` = `row.badge === '本社のみ' ? 1 : 0`
6. `id` の重複がないことをアサート（防御的。doc_id/sec_code の一意性に依存しているが、テストでも別途固定する）。
7. `<out>/companies.json`（`meta`, `industries`, `curveKeys`, `rows`）と `<out>/curves.json`（`agePoints: [22,27,32,37,42,47,52,57,62,67]`, `curves: ANNUAL_INDUSTRY`）を書き出す。
8. `companies.json` を gzip して 100KB を超えたら非ゼロ終了で失敗させる（Issue の完了条件）。
9. `meta.version` は `"2026-06"` 固定値（`docs/product/product.md` の「2026年6〜7月提出」に対応する今回のデータの版）、`generatedAt` は実行時刻の ISO 文字列。

## `scripts/build-data.test.ts`（Vitest）

Issue #1 の完了条件をそのままテストにする。

1. **行数**: `companies.json.rows.length === 1867`。
2. **salary35 の全数一致（最重要）**: 各行について `interpolate(agePoints, ANNUAL_INDUSTRY[row.industry], 35) / interpolate(agePoints, ANNUAL_INDUSTRY[row.industry], row.avgAge)` で factor を計算し、`Math.round(avgSalary * factor)` を CSV の `salary35` 列と1,867社**全件**で突き合わせる。ズレがあれば失敗させる。
   - Python の `round()` は銀行丸め、JS の `Math.round` は四捨五入。差が出た場合はここが原因になりうる。
3. **id の一意性**: 1,867件の `id` に重複がないこと。
4. **補間の境界**: `interpolate` が代表年齢の範囲外（22歳未満・67歳超）で端の値に頭打ちされること。
5. **gzip サイズ**: 実際に書き出した `companies.json` を gzip して 100KB 以内。
6. **産業大分類の非露出**: `industries`（表示用 tse33）と `curveKeys`（内部キー）が別配列として独立していることの構造チェック。

## `package.json` scripts

```json
{
  "scripts": {
    "build:data": "tsx scripts/build-data.ts",
    "test": "vitest run"
  }
}
```
