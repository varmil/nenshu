# plan.md — W1 企業詳細ページの働きやすさの節

Issue: [#150](https://github.com/varmil/nenshu/issues/150) ／ 親 [#148](https://github.com/varmil/nenshu/issues/148)
参照: `docs/worklife/spec.md` 2.（表示）・AC-6〜AC-12、ADR-0009、`docs/product/glossary.md`

着手前の段取り。作る形は `design.md`、施策を跨ぐ決定は ADR にある。

## 段取り

1. **`web/lib/data/worklife.ts` に読み手を書く。** `pipeline/worklife/json.ts` の `decodeRow` と同じ規則を写す（`pipeline/` は web から import できない）。**掲載が無い会社は行が `0`** なので `null` を返す
   → 検証: 実物の `worklife.json` に対する `worklife.test.ts` が、spec が名指しする7社（7203・8058・6861・1952・E03532・4689・8306）の値で通る

2. **先に「データが無い」ときの形を決める。** 3指標のいずれも無い会社が全1,867社中319社あり、**これは例外ではなく主要な状態**である（AC-10）。値がある場合の見た目から作ると、欠測が後付けの分岐になる
   → 検証: `buildWorklifeView(null)` が3指標ぶんの空の器を返す

3. **`features/company/lib/worklife.ts` に表示ビューを組む。** 全体値と雇用管理区分を1つの並びにし、**登録順のまま**返す。バーの塗りは上限100で止め、**値そのものは丸めない**
   → 検証: 単体テストで、並べ替えないこと・100超をそのまま返すこと・欠測行を落とすこと

4. **`WorklifeSection.tsx` を書く。** 1指標＝1行、PC は2カラム・モバイルは上下（アートボード 6b / 6c）。単位は見出しに1回だけ
   → 検証: 390px の三菱商事（区分5件）で横スクロールが出ない

5. **`app/company/[id]/page.tsx` から渡す。** `findRowIndex` を `view.ts` から export し、`stats.json` と同じ添字で引く
   → 検証: `/company/7203` の初期HTMLに `20.3` と `67.0` が入っている

6. **表示基準と独立であることを固定する**（AC-11）。`byBasis` の中に入れず、`CompanyDetail` の別の prop にする
   → 検証: 年齢そろえに切り替えても3指標が変わらず、リクエストが0件

7. **トップページの HTML が増えていないことを確かめる。** `app/page.tsx` から `worklife.json` を読まない（Issue #22）
   → 検証: `next start` に対して raw サイズを前後で比べる

8. **E2E を書く**（`e2e/company-worklife.spec.ts`）。AC-6〜AC-12 をそのまま並べる

9. **`design.md` を書く。** 出来上がった構造と、決めた語（節見出し・全体値のラベル）を残す

## 依存

- W0（#149・実装済み）が `worklife.json` を出している。この Unit は読んで描くだけ
- C3（#89）で組み直した2カラムのレイアウトに節を1つ足す

## リスク

- **区分名を正規化したくなる。** 1,009種類あり、切り口が3通り混在する。**やらないと決めた**（spec 2.2b）ので、テストで「並べ替えない」「振り替えない」を固定してから実装する
- **`decodeRow` の写し違いは合成データでは見つからない。** 両側が同じ勘違いをしていれば通る。**実物の `worklife.json` に対してテストを書く**
- **`worklife.json` を `app/page.tsx` から import すると Issue #22 が悪化する。** import 経路を増やさない
- **節の見出しに「働きやすさ」と書くと総合評価に見える。** 3指標がそれを代表しているわけではない（spec 5. の未決事項）
