# plan.md — W0 働きやすさデータの取り込み

Issue: [#149](https://github.com/varmil/nenshu/issues/149) ／ 親 [#148](https://github.com/varmil/nenshu/issues/148)
参照: `docs/worklife/spec.md` 1.（データ）・AC-1〜AC-5、ADR-0009、ADR-0006

着手前の段取り。作る形は `design.md`、技術の選定は ADR にある。

## 段取り

1. **`pipeline/salary35/` を `pipeline/salary/` に改名する。** パスとしての `salary35/` だけを置換し、**CSV の列名 `salary35` と変数名は触らない**（`build-data.test.ts` が全1,867社で固定しているため）。ルートと `pipeline/` の2つの `.gitignore`、`build-logos.ts` の2箇所、docs の参照を同時に直す。README は名前が実態と合っていないので本文ごと書き直す
   → 検証: `cd pipeline && npm test` と `cd web && npm test` が緑のまま。`git grep -n "salary35/"` が0件

2. **`run.load_edinet_codelist()` に `提出者法人番号` を読ませる。** コードリストの13列目。既存の6項目（提出者名・業種・上場区分・証券コード・種別・資本金）の隣に足すだけ
   → 検証: Python から呼んで1,867社ぶん引けること（引けない会社が0件であることは着手前に実測済み）

3. **`unified.py` に `--backfill-corporate-number` を足し、CSV に `corporate_number` 列を作る。** `--backfill-edinet-code`（C0）と同じ形にする。`HEADERS` に列を足す
   → 検証: 1,867行すべてに13桁が入る。1件でも空なら異常終了する

4. **`pipeline/scripts/lib/csv.ts` の `HEADER` と `UnifiedRow` を更新する。** ヘッダは完全一致で検証しているので、CSV を先に直すとここが落ちる。3の直後に必ずやる
   → 検証: `cd pipeline && npm test`

5. **`pipeline/worklife/extract.ts` を書く。** 女性活躍DBの ZIP を読み、236列のヘッダを完全一致で検証し、法人番号で内部結合し、列を選んで正規化し、`pipeline/data/worklife_2026.csv` を書く。**列は位置で読む**（見出しに重複があるため）。ZIP のファイル名・sha256・取得日を manifest に残す
   → 検証: 突合1,690社・記入率がサマリーに出る。異常値（残業 `-16.8`）を落とした件数と会社名が出る

6. **`extract.test.ts` を書く。** 正規化の規則を固定する。ヘッダ不一致で落ちること、欠測と `0` を区別すること、雇用管理区分を畳まないこと、`-16.8` を落として `103.0` を残すこと
   → 検証: `cd pipeline && npm test`

7. **`build-data.ts` に `buildWorklife()` を足す。** `worklife_2026.csv` から `worklife.json` を作る。`companies.rows` と**同じ並びの配列**にし、文字列プールを持つ。gzip 上限を超えたらビルドを落とす
   → 検証: `npm run build:data -- --out ../web/public/data` が通り、`worklife.json` が出る

8. **`build-data.test.ts` に追記する。** 行の並びが `companies.rows` と一致すること（ずれると別の会社の残業時間を出す）、突合社数、gzip サイズの上限
   → 検証: `cd pipeline && npm test`

9. **`vitest.config.ts` の `include` と `tsconfig.json` の `include` を広げる。** いまは `scripts/` しか見ていないので、6のテストが走らない
   → 検証: 6のテストが実際に実行されていることを出力で確かめる

10. **表示が変わっていないことを確かめる**（AC-5）。`worklife.json` はまだどこからも import しないので、既存のテストが緑のままであるはず
    → 検証: `cd web && npm run typecheck && npm run lint && npm run build`、`npm test`、`npm run test:e2e`

11. **トップページの HTML が増えていないことを確かめる**（AC-4）。`opennextjs-cloudflare build` → `wrangler dev --local` で gzip サイズを取り込みの前後で比べる
    → 検証: 着手前の実測（62,164 B）から動かないこと

12. **`design.md` を書く。** 出来上がった内部構造と、着手前・着手中に測った数値を残す

## 依存

- ADR-0009 に従い、突合は法人番号だけで行う。証券コードと社名は使わない
- `Edinetcode.zip` と女性活躍DBの ZIP は手元に置いてある。**取得は自動化しない**（ダウンロードURLに UUID が入るため）

## リスク

- **3と4の順序を逆にすると `parseUnifiedCsv` が落ちる。** ヘッダを完全一致で検証しているため。CSV を書き換えたら同じコミットで TypeScript 側も直す
- **1の改名で「salary35」を一律置換すると CSV の列名まで変わる。** `build-data.test.ts` が Python と TypeScript の一致を全1,867社で固定しているので、そこが壊れると推定式の検証が消える。置換はパス（`salary35/`）に限る
- **7で `companies.rows` と別のループを回すと行がずれる。** `stats.json` が同じ制約を持っていて、`build-data.test.ts` がそれを固定している。同じ形にする
- **9を忘れると6のテストが「書いたのに走っていない」状態になる。** 実行件数を目視で確かめる
