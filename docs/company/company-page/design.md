# C1 企業詳細ページ v1 — design.md

参照: Issue #52, `docs/company/company-page/plan.md`, `docs/company/spec.md`

## ディレクトリ

```
web/
├─ app/company/[id]/page.tsx            # Server Component。searchParams を読み notFound() を出す
└─ features/company/
   ├─ types.ts                          # CompanyStatsData / CompanyView
   ├─ lib/
   │  ├─ stats.ts                       # 偏差値・上位◯%・平均との差（純粋関数）
   │  └─ view.ts                        # 1社ぶん8年齢の表示データを組み立てる
   └─ components/
      ├─ CompanyDetail.tsx              # Client。年齢スイッチと ?age= の同期
      └─ SalaryCurveChart.tsx           # インラインSVGの折れ線
pipeline/scripts/build-data.ts          # stats.json を追加出力
```

## データフロー

```
build-data.ts（ビルド時・1回）
   │  1,867社 × 8年齢の推定年収を estimateSalary で計算
   │  → 全体順位・業界内順位・母集団統計（平均・標準偏差）・業種ごとの社数
   ▼
web/public/data/stats.json
   │
   │  import（worker バンドルに同梱。/ は読まない）
   ▼
app/company/[id]/page.tsx（リクエストごと）
   │  id → 行番号（モジュール初期化時に1回だけ Map を作る）
   │  buildCompanyView(): その1社ぶん、8年齢の表示データ（数十個の数値）
   ▼
CompanyDetail（Client）
   │  受け取った8件を年齢で切り替えるだけ。計算もフェッチもしない
   ▼
SalaryCurveChart（SVG）
```

## なぜ順位を事前計算するか

順位は「その年齢時点の推定年収で全1,867社を並べたときの位置」なので、1社ぶんを出すにも母集団全体の推定が要る。リクエストのたびに 1,867社 × 8年齢 ＝ 約15,000回の補間を回すことになる。

**Workers Free の CPU 上限はリクエストあたり10ms**で、`docs/ranking/ssr-migration/design.md` の実測ではウォーム状態のトップページが既に20〜28msだった（エラーが出ていないのはコールドスタート用の別枠に助けられているという見立て）。ここに毎回15,000回の計算を足す判断はしない。

ビルド時に確定させれば、リクエスト時の計算は**当該1社ぶんの8年齢＝16回の補間**だけになる。

## `stats.json` の形

```ts
interface CompanyStatsData {
  ages: number[];                              // TARGET_AGES と同じ8点
  count: number;                               // 1867
  population: { mean: number; sd: number }[];  // 円・整数。ages と同じ並び
  industryCounts: number[];                    // companies.industries と同じ並び
  rankAll: number[][];                         // companies.rows と同じ並び × ages
  rankIndustry: number[][];                    // 同上
}
```

**会社IDをキーにした辞書ではなく、`companies.rows` と同じ並びの配列にする。** ページは id から行番号を引く必要が既にあるので、その添字をそのまま使える。IDを1,867回書かないぶん小さくなる。

順位は同額を同順位にする（自分より高い会社の数 ＋ 1）。`companies.json` と `stats.json` の行がずれると別の会社の順位を出してしまうので、`build-data.ts` が同じループで両方を作る。

## 偏差値と上位◯%

```
偏差値   = 50 + 10 ×（推定年収 − population[k].mean）÷ population[k].sd
上位◯%  = 全体順位 ÷ count × 100
```

`sd` は母標準偏差（`n` で割る）。標本標準偏差（`n − 1`）ではない——対象は「掲載している1,867社」そのもので、そこから母集団を推定しているわけではないため。

**上位◯%は 0.1% 未満のとき「上位0.1%未満」と出す。** 1位は 0.054% で、「上位0.1%」と丸めると2位以下と区別がつかず、「上位0.05%」と出すと桁を増やす理由が読者に伝わらない。

**偏差値は100を超える。** 35歳時点のキーエンスで150.0（対数変換しても107.4）。年収分布が右に強く裾を引くためで、正規分布を前提にした指標を非正規分布に当てている。数字の隣に必ず「上位◯%」を置き、100を超えうる理由を本文で注記する（`docs/product/glossary.md`）。

## `AgeSwitch` を昇格させるか → 昇格させない

`docs/company/overview.md` が C1 の設計時に判断すると書いていた論点。**`features/ranking/components/AgeSwitch.tsx` をそのまま import する。**

`design-system/` は shadcn プリミティブとその合成物の在庫で、`inventory.md` に並んでいるのは `button` / `table` / `badge` のような**ドメイン語彙を持たないもの**だけである。`AgeSwitch` は `TargetAge`（25〜60の8値）と `TARGET_AGES` に依存していて、これは `docs/product/glossary.md` の「目標年齢」そのもの。昇格させると、design-system がドメイン語彙を抱えるか、型を二重に持つかのどちらかになる。

**既知の負債として記録しておく。** `TargetAge` / `TARGET_AGES` / `estimateSalary` / `format` は本来「年収ドメイン」の共有物で、ranking が唯一の施策だった経緯で `features/ranking/` に置かれている。3つ目の施策が同じものを使うか、`features/ranking` が `features/company` を import したくなった時点で、共有レイヤに切り出す。今それをやると、動いているコードを推測で動かすことになる。

## チャート

**依存を足さずインラインSVGで描く。** recharts（shadcn の chart が使う）はクライアントJSを100KB近く増やす。描くのは8点の折れ線1本で、SSRされた `<svg>` で足りる。JSが動く前から線が見える。

- `viewBox` と `width: 100%` で可変幅にする（モバイルで横スクロールを出さない）
- 縦軸は 0 起点にしない。8点の最小〜最大に少し余白を足した範囲にする。0起点にすると差が潰れて読めない。**代わりに各点の金額を数値で併記**して、目盛りの取り方で誤読させない
- 選択中の目標年齢の点を強調する
- 色は `design-system/tokens/tokens.css` の CSS 変数（`--color-primary` 等）だけを使う。生の hex を書かない
- `role="img"` と `aria-label`、加えて `sr-only` の一覧（「25歳 788万円」…）を置く。**画像ではなく数値として読み上げられる**ようにする（spec.md 2. アクセシビリティ）

`SalaryCurveChart` は `"use client"` を付けない。クライアントコンポーネントである `CompanyDetail` の子なので同じバンドルに入るが、それ自体は状態を持たない純粋な描画になる。

## 年齢の URL 同期

`?age=` を `window.history.pushState` で書く。`useRouter()` は使わない（U5 で踏んだ RSC ペイロード再フェッチの問題。`docs/ranking/url-sync/design.md`）。

既定値の35歳は URL に出さない。`popstate` で読み直す。`useRankingState` と同じ作法だが、同期するのが1つの値だけなのでデバウンスも `pushState`/`replaceState` の出し分けも要らない。**`useRankingState` を共用しない**——あちらは7つの値とページ番号を持ち、企業ページには存在しない概念が大半を占める。

## ランキングからの導線

`RankingTable` / `RankingCardList` の会社名を `<Link href={`/company/${id}`}>` にする。

CLAUDE.md の「`useRouter()`/`router.push()` を高頻度なクライアント側状態変更に使わない」には抵触しない。同じ規約が「**ページ間の遷移など離散的でネットワークを許容してよい操作は `<Link>` にしてよい**」と明記している。

## 404

存在しないIDは `notFound()`。旧形式の書類ID（`s100yfah` 等）もここに落ちる。C0 でIDを移したので、旧IDのURLは外部に一度も公開されていない。

## エッジキャッシュ

`next.config.ts` の `headers()` は `/` と `/about` を列挙する作りなので `/company/:id` を足す。データはビルド時に確定していて実行中は変わらないので、`/` と同じ値（ブラウザ1時間・エッジ24時間）でよい。

**404も同じヘッダーが付く。** 存在しないIDへのアクセスが最大24時間キャッシュされる。年1回のデータ更新で新しく載った会社のページが最大24時間出ないことになるが、更新頻度が年1回である以上これは実害にならない（`/` について同じトレードオフを `docs/ranking/ssr-migration/design.md` で受け入れている）。

## `buildCompanyView` が1リクエストで2回走る

`generateMetadata` と本体の両方が呼ぶ。1回あたり Map の検索と16回の補間で、`cache()` で包むほどの重さではない。包まないぶん依存が減る。

## この Unit で入れないもの

- **canonical・sitemap・robots**（U8・#53）。`metadataBase` を要するため、URL戦略ごと U8 に寄せる。C1 では `generateMetadata` で title と description だけ入れる
- 同業他社の比較表、10年推移（#54）、株価・格付け（#55）
