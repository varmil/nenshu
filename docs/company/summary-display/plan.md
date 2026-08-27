# C7 企業詳細ページへの表示 — plan.md

参照: Issue [#161](https://github.com/varmil/nenshu/issues/161)（親: [#158](https://github.com/varmil/nenshu/issues/158)）, `docs/company/spec.md` 1.18（AC-21〜AC-23）, [ADR-0010](../../adr/0010-company-summary-sourcing.md)
依存: [#160](https://github.com/varmil/nenshu/issues/160)（C6）

## Context

C6 が説明文を作った（`pipeline/data/company_summary_2026.csv`・2,960社中 2,783社）。
これを `/company/[id]` の h1 直下に出す。**ここまでの2つの Unit はどちらもオフラインで、
読者からは何も見えていない。** C7 が画面に出して初めて #158 が閉じる。

**画面に足すのは文と出典の1行だけで、数値は1つも増えない。** 出す位置はモックの
アートボード 4b（PC）/ 2b（モバイル）が3行の紹介文を描いているところ——C3（#89）が
「データが無い」として空けたまま残した場所になる。

**この Unit の重さはデータの配り方にある。** 説明文は 2,783社ぶんで raw 約950KB あり、
**トップページに載せてはいけない**（Issue #22）し、**1社ぶんだけをクライアントに送る**
（AC-23）。既存の `worklife.json`・`history.json`・`profit-history.json` が同じ制約の下に
あるので、その形に合わせる。

## 進め方

1. **`summaries.json` の形と大きさを先に決める。** `companies.rows` と同じ並びに揃えるのか
   IDの辞書にするのかで gzip が変わるので、**両方を実測してから選ぶ**。上限は実測に余裕を
   足した値を置き、超えたらビルドを落とす（既存の6ファイルと同じ扱い）
2. **`build-data.ts` に書き出しを足す。** CSV の突合が全社ぶん当たることを確かめる
   ——`buildWorklife` が `matched !== byId.size` で落としているのと同じガードを置く。
   **落ちないと、突合キーを間違えたまま「説明文の無い会社」として静かに配ることになる**
3. **説明文の有無で出し分ける分岐を純関数にする**（AC-9）。画面のコンポーネントに `if` を
   直接書くと、「空の器を出さない」ことをテストで固定できない
4. **画面に置く。** 順位行の直後に説明文、その下に出典の1行。**`/about` への導線を張る**
   （AC-22）。決算期は `companyFiscalPeriodLabel` から引く——直書きしない
5. **モバイルで行数を実測する。** 130字は 390px で何行になるか、年齢スイッチがどこまで
   押し下がるかを見る。**押し下がりが読めない量なら、そこで初めて畳むか位置を変えるかを
   決める**（先に畳む実装を入れない）
6. **`/about` に生成の方法を書く。** 説明文からの導線の行き先になるので、画面より先に
   書けない（節の見出しが決まらないとリンクが書けない）
7. **Unit テストと E2E を書く**（AC-9・AC-10）。E2E は**説明文のある会社と無い会社の両方**
   ——片方だけだと「空の器を出さない」ことが通らない
8. **HTML と Worker バンドルの増分を実測する**（AC-11）。`/company/[id]` は静的アセットな
   ので**バンドルに入るのは `summaries.json` の同梱ぶんだけ**のはずだが、それは測って
   確かめる
9. **`/` の HTML が ±0 であることを確かめる。** `summaries.json` を `src/pages/index.astro`
   から読まないことの担保で、**測らないと気づけない**（Issue #22）
10. **spec の AC-22 を実態に合わせる。** 「決算期は `companies.meta.fiscalPeriod` 由来」と
    書いてあるが、E1（#172）でこの値は `fiscalPeriodRange` に変わり、**1社ぶんを出せる
    場所では会社ごとの決算期を出す**規則になっている

## 検証の順序

1. `cd pipeline && npm run build:data -- --out ../web/public/data` が通り、サマリーに充足率が出る
2. `cd pipeline && npm test`（`build-data.test.ts` に突合のテストを足す）
3. `cd web && npm run typecheck && npm run lint && npm test`
4. `cd web && npm run build` → `/company/[id]` の HTML と Worker バンドルを実測
5. `cd web && npm run test:e2e`
6. dev サーバーを起動してブラウザで触る（説明文のある会社・無い会社・モバイル幅）

## 非対象

meta description と JSON-LD への流用（S2・#116 と衝突する。別 Issue）、ランキング表への
表示（#22）、説明文の検索対象化、会社ごとの手動での上書き。
