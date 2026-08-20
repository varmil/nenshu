# U12 ランキングのレイアウト刷新 — design.md

参照: Issue #80（親: #21）, `docs/ranking/spec.md` 1.10〜1.13・AC-7・AC-12〜AC-14, ADR-0007, ADR-0006
依存: #71（U11）, #79（design-system に sheet）

## ディレクトリ構成

```
web/features/ranking/
  components/
    RankingApp.tsx          2カラムの器。状態の変更口を1つに閉じる
    RankingFilters.tsx      絞り込み4種の中身（サイドバーとシートで共用）
    RankingFilterSheet.tsx  モバイルの器（design-system/ui/sheet）
    ActiveFilterChips.tsx   適用中チップ＋すべて解除
    SortSwitch.tsx          並び替え3択
    SalaryBar.tsx           年収バー＋全体平均の縦線
    CompanyLogoMark.tsx     社名の頭文字を入れた破線枠
    IndustryChips.tsx       業種33件（クロール経路を兼ねる）
    RankingTable.tsx        PC。table-fixed の7列
    RankingCardList.tsx     モバイル。1枚に収める高密度カード
  lib/
    activeFilters.ts        効いている絞り込みの一覧と「すべて解除」の差分
    population.ts           stats.json から母集団統計だけを抜く
    queryBroadcast.ts       ヘッダの検索欄 → ランキング状態への合図
web/features/navigation/components/
    HeaderSearch.tsx        共通ヘッダの検索欄（site-chrome 施策側に置く）
```

## データモデル

`RankingState` に `sort: SortKey`（`"salary" | "age" | "employees"`）が増えた。URL では
`?sort=age` / `?sort=emp`、既定の `salary` は出さない。並びは `age` → `ind` → `emp` →
`ten` → `aage` → `q` → **`sort`** → `page` の位置に入る。

`RankedCompany` に順位が2つある。

| | 意味 | 分母 |
| --- | --- | --- |
| `rank` | 絞り込み後の順位。1から振り直す（AC-3） | 絞り込み後の件数 |
| `populationRank` | 全1,867社の中での順位 | 1,867 |

**偏差値の隣に置く「上位◯%」は `populationRank` から出す。** 海運業7社に絞ったときの
`rank` は1〜7で、これを分子にすると1位が「上位14%」になり、母集団を取り違える。

`PopulationStats` は `stats.json` の部分集合で、`count` / `bases` / `population` の3つ
だけを持つ。`app/page.tsx` が `pickPopulationStats` で抜いて `RankingApp` に渡す。
`rankAll` / `rankIndustry`（1,867×9の配列2本）は**渡さない**——クライアントに直列化
されるとトップページの予算（Issue #22）を大きく超える。抜いた結果は JSON で1KB未満で、
`population.test.ts` がそれを固定している。

## 計算の順序（`buildRankedCompanies`）

```
全1,867行
  ↓ 表示基準の金額を出す（実測値なら補正しない）
  ↓ 金額の降順に並べる ──→ populationRank を振る
  ↓ フィルタ・検索を掛ける
  ↓ rank を1から振る
  ↓ 並び替え（rank には触らない）
  ↓ ページ切り出し
  └→ pageMaxSalary（年収バーの基準）
```

**絞り込みを金額の計算より後ろに置いている。** `populationRank` は母集団の中での位置
なので、絞り込んだあとの並びからは出せない。順序を逆にすると全件ぶんの計算が2回要る。

**`pageMaxSalary` はページ切り出しの後に採る。** ページ・フィルタ・並び替え・表示基準の
どれが変わっても基準が取り直されるのは、この1点に閉じているためである。とくに表示基準の
切替は金額そのものが別の系列に変わるので、片方の基準で両方を描くと**年齢そろえに切り
替えたとき棒だけ元の縮尺で残る**——最も気づきにくい壊れ方なので、単体・E2E の両方で固定
してある。

## 年収バー（`SalaryBar`）

`value / max` の比を幅にする。上限を固定額（デザイン案の2,500万円）に置かないのは、
下位ページで棒がすべて短くなって差が潰れるためである。全体平均の縦線は同じ基準で位置を
出し、**平均がページ最大を超える場合は描かない**（枠の外に描かない）。

幅は小数第1位に丸める。`65.32109865321099%` がそのまま `style` に載ると1ページ200本ぶんで
数KBになり、画面上の差は出ない（実測で gzip 73.4KB → 71.4KB）。

数字は隣のセルに出ているので `aria-hidden`。読み上げに同じ金額を二度言わせない。

## 2カラムの器

PC は `md:grid md:grid-cols-[13.5rem_1fr]`（216px のサイドバー＋本文）。サイドバーは
`md:sticky md:top-4`。モバイルは1カラムで、絞り込みは `sheet` に入れる。

**シートの開閉は URL に載せない。** 絞り込みの結果に影響せず、共有された URL で勝手に
パネルが開くほうが不自然になる。

**適用中チップは本文の上に置く**（サイドバーの中ではない）。モバイルでは絞り込みが
シートに隠れるので、何が効いているかが画面から消えてしまう。

### サイドバーに入れて分かったこと

- **`ToggleGroup` の既定は `w-fit flex-row` で折り返さない。** 3択が216pxに収まらず、
  はみ出したボタンが本文の表に重なって**クリックが表側に吸われた**。`FilterToggleGroup`
  側で `w-full flex-wrap` にした。E2E（AC-4）が検出した
- **表は `table-fixed` にした。** 自動レイアウトだと社名の列が中身の幅まで伸び、2カラムに
  したぶん狭くなった本文からはみ出す（実測 978px / 枠 752px）。列幅を先に決め、入らない
  社名は省略記号で切る

## 業種チップ（`IndustryChips`）

`<a href="/?ind=…">` の実体を持たせる。ADR-0006 で `/industry/[x]` を作らないと決めた
ので、`?ind=` の URL に辿り着ける道がここにしか無い。**U8 が予定していたリンクハブは
これで足りるため、U8 の範囲を canonical・sitemap・robots に狭めた**（`overview.md`）。

**読者のクリックでは遷移させない。** 素直に辿らせると RSC ペイロードの再取得が走り、
AC-7（操作でネットワークが発生しない）を壊す。左クリックだけを横取りして状態を更新し、
修飾キー付き・中クリック（新しいタブで開く）はブラウザに任せる。

## ヘッダの検索（`HeaderSearch`）

共通ヘッダは `app/layout.tsx` が持っていて、`RankingApp` の**祖先ではなく兄弟**にある。
props でも context でも渡せないので、**URL を経路にする**。

```
HeaderSearch ── pushState ──→ URL
      └─ dispatchEvent(RANKING_STATE_CHANGED_EVENT) ──→ useRankingState が読み直す
```

`pushState` は `popstate` を発火しないので専用の合図が要る。合成した `PopStateEvent` を
投げる手もあるが、由来が読めなくなるので名前を付けた。`useRankingState` は `popstate` と
同じハンドラを繋ぐだけである。

`/` 以外のページでは素の `<form action="/" method="get">` として振る舞い、`/?q=…` へ
遷移する。離散的な操作なのでネットワークを許容してよく、JS が動かない環境でも同じ経路で
動く。パスの判定は `usePathname`——読むだけで RSC の再取得を起こさないので、禁止している
`useRouter` / `useSearchParams` には当たらない。

**`value` は常に渡して制御コンポーネントに統一する。** `/` かどうかで `value` と
`defaultValue` を出し分けたら、React が「非制御から制御へ変わった」と警告した。

## `features/company` からの import

`deviationScore` / `topPercent` / `formatDeviation` / `formatTopPercent` を
`features/company/lib/stats.ts` から取っている。`AgeSwitch` を company 側から取っている
のと逆向きで、2つの feature が相互に依存する形になった。

これらは本来「年収ドメイン」の共有物で、`TargetAge`・`estimateSalary`・`format` と同じ
既知の負債にあたる（`docs/company/company-page/design.md`）。U12 で解消しないのは、
共有モジュールの切り出しが2施策のファイル移動を伴い、この Unit の範囲を超えるためである。

## 実測値

| | 変更前 | U12 |
| --- | ---: | ---: |
| `/` の HTML（gzip） | 66,459 B | **72,244 B**（+8.7%） |
| `/?age=35`（gzip） | 68,187 B | 72,151 B |
| `/about`（gzip） | 10,595 B | 10,844 B |
| `/company/6861`（gzip） | 7,938 B | 8,250 B |
| `/company/` へのプリフェッチ | 0件 | **0件** |

増えたぶんは行あたりの情報量（バー・偏差値・上位◯%・業種の副見出し）と業種チップ33件で、
`stats.json` から渡した母集団統計は1KB未満しか占めていない。**Issue #22 の予算は
`companies.json` 単体（gzip 44KB）ではなくこのページ側の値で見るべきで、4,000社規模では
この行の作りのままでは収まらない。**

テスト: 単体 221 passed（うち U12 ぶん 34）、E2E 117 passed（うち `ranking-refresh.spec.ts`
24）。
