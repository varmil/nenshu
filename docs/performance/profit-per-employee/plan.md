# plan.md — P0 一人当たり経常利益の取り込み

Issue: [#155](https://github.com/varmil/nenshu/issues/155) ／ 親 [#154](https://github.com/varmil/nenshu/issues/154)
参照: `docs/performance/spec.md` 1.（データ）・AC-1〜AC-5、ADR-0006

着手前の段取り。作る形は `design.md`。

## 段取り

1. **T0 のキャッシュで足りるかを最初に確かめる。** 有報1件を開いて、「主要な経営指標等の推移」に経常利益が何期ぶんタグ付けされているかを見る。**ここが読めないまま実装に入らない**
   → 検証: キーエンス（S100YAHE）の1件で `Prior4YearDuration` 〜 `CurrentYearDuration` の5期が取れること

2. **書類を取り直す。** キャッシュ（`pipeline/salary/cache/`）は `.gitignore` 済みなので、まっさらなコンテナでは空になっている。`salary_history.csv` の `doc_id` を使い、**書類一覧を引き直さずに**落とす
   → 検証: 1,867件が `PK` で始まるZIPとしてキャッシュに入る（失敗0件）

3. **`extract.py` で経常利益を抜く。** 連結（コンテキストに `Member` が付かないもの）と単体（`_NonConsolidatedMember`）の両方を取り、long 形式の CSV に落とす
   → 検証: 年ごとの社数がサマリーに出る

4. **測る**（#155 の「着手前に測ること」）。取れた社数・業種別のカバー率・**上位30社の顔ぶれ**・5期そろう社数・**赤字の社数**・業種中央値に対する倍率の分布・小売業とサービス業の異常値
   → 検証: 上位に持株会社が並んでいないことを目で確かめ、`design.md` に残す

5. **`UnifiedRow` に `employeesConsolidated` を足す。** CSV には列があるがパーサが読んでいない。**空が191社あるので `number | null`**
   → 検証: `cd pipeline && npm test`

6. **`parsePerformanceHistoryCsv` を書く。** `parseSalaryHistoryCsv` と同じ方針（ヘッダ完全一致で検証、想定外なら落とす）
   → 検証: 同上

7. **`build-data.ts` に `buildPerformance()` を足す。** 直近5期の中央値を従業員数で割り、業種中央値を出す。`companies.rows` と**同じ並びの配列**にする。gzip 上限を超えたらビルドを落とす
   → 検証: `npm run build:data -- --out ../web/public/data` が通り、`performance.json` が出る

8. **`build-data.test.ts` に追記する。** 並びが `companies.rows` と一致すること、金融3業種が欠けないこと、赤字が負のまま残ること、単体で代用されること、gzip 上限
   → 検証: `cd pipeline && npm test`

9. **表示が変わっていないことを確かめる**（AC-5）。`performance.json` はまだどこからも import しない
   → 検証: `cd web && npm test`、`npm run test:e2e`、トップページの HTML サイズが動かないこと

10. **`design.md` を書く。** 出来上がった構造と4で測った数値を残す

## 依存

- T0（#74）が `salary_history.csv` に10年ぶんの `doc_id` を持っている。**そこから落とすので書類一覧の再取得は要らない**
- C0（#51）の企業ID（証券コード／EDINETコード）で `companies.json` と揃える

## リスク

- **キャッシュが空の環境では取得に時間がかかる。** 2026年ぶん1,867件で約17分（並列3・実測1.8件/秒）。**10年ぶん17,684件なら約150分**なので、P0 の範囲では最新年だけを落とす
- **連結と単体の取り違えは静かに通る。** どちらも同じ要素名で、コンテキストの接尾辞だけが違う。取り違えると持株会社が上位に並ぶので、**4で上位30社の顔ぶれを必ず目で見る**
- **赤字を欠損として捨てると「データが無い」と区別できなくなる。** 59社ある
- **5と6の順序を逆にすると `parseUnifiedCsv` の型が合わない。** ヘッダを完全一致で検証しているので、CSV 側は既に列を持っている（読んでいなかっただけ）
