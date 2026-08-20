# U11 実測値モードと既定化 — design.md

参照: Issue #71（親: #21）, ADR-0007, `docs/ranking/spec.md` AC-1・AC-2・AC-7・AC-9・AC-11
plan: `./plan.md`

実装しながら決めたこと。決定は Issue のコメントではなくここに置く（CLAUDE.md）。

## 1. モードを別フィールドにせず `targetAge: TargetAge | null` にした

plan.md の判断のとおり実装した。**実際にやってみて効いたのは「型が変更箇所を全部数え上げてくれた」こと**である。`RankingState.targetAge` と `RankedCompany.estimatedSalary` を null 許容にした直後に `npm run typecheck` を回すと、直すべき7ファイルがそのまま並んだ。

```
app/company/[id]/page.tsx        stats.json の型が変わった
features/ranking/components/RankingApp.tsx        AgeSwitch / RankingTable / RankingCardList への受け渡し
features/ranking/components/RankingTable.tsx      formatManYen(null) が通らない
features/ranking/components/RankingCardList.tsx   同上
features/ranking/lib/rank.test.ts                 estimatedSalary が null になりうる
features/company/lib/view.test.ts                 byAge → byBasis
```

`basis: "raw" | "age"` を別に持つ設計だと、`targetAge` の型が変わらないぶんこの列挙が起きない。**分岐を書き忘れた箇所が型エラーにならず、実行時に「実測値モードなのに補正済みの金額が出る」形で表に出る。** 型を狭くしたことがそのままテストの網になった。

## 2. `stats.json` は添字を黙ってずらさず `bases` を新設した

実測値ぶんを足す最小の差分は「`estimates` の先頭に1列足す」だけだが、それだけだと `ages` という名前のまま中身が9要素になり、`stats.rankAll[i][0]` が指すものが 25歳 から 実測値 に変わる。**`view.ts` の側を直し忘れても型は通る**（どちらも `number[][]`）。

`ages: number[]` を捨てて `bases: (number | null)[]` に改名した。名前が変わることで参照側が全部型エラーになり、1で書いたのと同じ数え上げが効く。値も `[null, 25, 30, ...]` と自己記述的になり、`bases.indexOf(35)` のように書ける。

`view.ts` は `TARGET_AGES.map(...)` をやめ **`stats.bases.map(...)` で回す**ようにした。並びの正は `stats.json` の側にあり、両方が独立に順序を知っていると片方の変更で静かにずれるため。

## 3. 母集団統計は実測値と年齢そろえで別物になる（実測）

| 表示基準 | 平均 | 標準偏差 |
| --- | ---: | ---: |
| 実測値 | 719万円 | 200万円 |
| 35歳そろえ | 629万円 | 155万円 |

デザイン案（`改善案.dc.html` 5a）が仮値として置いていた「平均664万円・標準偏差189」とは違う。**実測値のほうが平均も散らばりも大きい。** 年齢そろえは平均年齢の高い会社を引き下げる方向に働くので、分布が縮む。

順位も動く。

| 会社 | 平均年齢 | 実測値 | 35歳そろえ |
| --- | ---: | ---: | ---: |
| キーエンス | 35.0歳 | 2,178万円・1位・偏差値122.9 | 2,178万円・1位・偏差値150.0 |
| 三菱商事 | 42.3歳 | 2,113万円・2位 | 1,578万円・3位 |
| トヨタ自動車 | 40.5歳 | 1,006万円・121位 | 859万円・120位 |

**キーエンスは平均年齢がちょうど35.0歳なので金額が両モードで一致するが、偏差値は 122.9 と 150.0 で大きく違う。** 母集団が違うためで、これは間違いではない。company-page の E2E は両方を別々に固定してある。

## 4. 実測値では「推定」の語を1つも出さない

`RankingTable` の列見出し・`RankingCardList` のラベル・`CompanyDetail` の見出し・`TableCaption`・フッタの断り書きの5か所を出し分けた。E2E で `getByText("推定", { exact: true })` が **0件**であることを固定している（`e2e/ranking-basis.spec.ts`・`e2e/company-page.spec.ts`）。

実測値のとき `RankingTable` から「平均年収（実績）」列を、`RankingCardList` から「平均年収」行を落とした。**大きく出している金額と同じ値なので、残すと同じ数字が1行に2回出る。**

## 5. 実測値では列が1つ減るので、表は既存より狭くなる

PC で表が右にはみ出す（`従業員数` 列が切れる）現象と、業種セレクトの表示が `__all__` になる不具合は、**どちらも main に既にある**。`git stash` して同じ画面を撮って確認した。この Unit では触らない（U12 でランキングを2カラムに組み直すときにまとめて直す）。→ セレクトの件は Issue #72 に切り出した。

## 6. `/about` の数値もデータから出す

「2つの表示基準」の節に、平均年齢の範囲（27.1歳〜60.6歳）と母集団平均（719万円 / 629万円）を書いた。**ハードコードしていない。** `buildAboutFacts` に `coverage` と `population` を足し、`aboutFacts.test.ts` が実データと一致することを固定している（`docs/ranking/about-page/design.md` の「データから出せる値はデータから出す」という線引きのまま）。

`population` は `stats.json` を読まずに自分で平均を出している。**`/about` は静的レンダリング（`○`）で、`stats.json` を import すると 1,867×9 の順位表までバンドルに入る。** 要るのは平均2つだけなので割に合わない。

## 7. 既存 E2E が17本落ちた。1本ずつ理由を見て直した

既定が変わったので当然だが、**惰性で期待値を書き換えないこと**を守った。分類すると3種類だった。

1. **年齢そろえの挙動を見ているテスト**（company-page の大半、theme の「選択中の年齢タブ」）→ `?age=35` を明示して開くように変えた。テストの意図は変わらない
2. **既定の文言・並びを見ているテスト**（`h1` の「年齢補正年収ランキング」、ページ送りの2ページ目先頭）→ 新しい既定での正しい値に更新した。2ページ目の先頭は実測値101位の**オリックス**（旧・戸田建設）
3. **年齢スイッチを操作の足場に使っていたテスト**（analytics の「45歳を押す」、url-sync の一部）→ 実測値では無効なので、「年齢そろえ」を押す操作に置き換えた。**このテスト群が落ちたこと自体が AC-11 が効いている証拠**になっている

新規は16本（`ranking-basis.spec.ts` 11本、company-page 4本、about 1本）。合計 75 → 91 本。

## 8. 意味が変わるのは「クエリ無しの `/`」だけ

`/?age=45` のように年齢を明示して共有された既存URLは見え方が変わらない。変わるのは `/` と `/company/[id]`（クエリ無し）を開いたときだけである。**`?age=35` が「35歳そろえ」を指すという関係は前後で保たれている**ので、既存の被リンクの意味が壊れることはない。

`buildSearchParams` が 35歳でも `age=35` を出すようになった点だけが表記の変更で、これは実測値と区別が付かなくなるのを防ぐため（ADR-0007）。

## 未着手のまま残したもの

- **`/` の `generateMetadata`。** `/` の title は `app/layout.tsx` の静的な `OpenReport | 年収ランキング` のままで、表示基準による出し分けをしていない。モード別の title・description・canonical は U8（Issue #53）が `/` に `generateMetadata` を入れるときにまとめて行う。いま入れると U8 と二重に触ることになる
- **企業詳細ページのクライアント側切替では `<title>` が変わらない。** `pushState` で URL だけ書き換えているため。U5 以降のランキングと同じ挙動で、この Unit で新しく生じた問題ではない
