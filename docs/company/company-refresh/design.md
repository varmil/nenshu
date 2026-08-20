# C2 企業詳細ページのレイアウト刷新 — design.md

参照: Issue #83（親: #21）, `docs/company/spec.md` 1.11〜1.16・AC-11〜AC-16, `docs/timeseries/spec.md` 2.・AC-6〜AC-11
依存: #52（C1）, #80（U12）, #74（T0）

## ディレクトリ構成

```
web/features/company/
  components/
    CompanyDetail.tsx             2カラムの器
    SalaryCurveChart.tsx          年齢別の折れ線（縦軸目盛と ±20% の帯を追加）
    AgeSalaryTable.tsx            年齢 / 推定年収 / 推定範囲
    SalaryDistributionChart.tsx   位置バー＋9ビンのヒストグラム
    SalaryHistoryChart.tsx        10年推移の棒（T1）
    NeighborCompanies.tsx         水準が近い会社
    HowItWorks.tsx                この数字の作り方（3ステップ）
  lib/
    neighbors.ts                  同業種で金額が近い5社
    highlights.ts                 要点の箇条書き・推移の増減の文
    stats.ts                      binOf / formatBinLabel / positionPercent / estimateRange を追加
pipeline/scripts/build-data.ts    buildStats に buildDistribution を追加
```

## 表示基準に依存するもの / しないもの

**このページで最も取り違えやすい境界。** 同じ画面に両方が並ぶ。

| | 表示基準ごとに変わる | 独立（常に実測値） |
| --- | --- | --- |
| 金額・順位・偏差値・全体平均との差 | ○ | |
| 中位・ヒストグラムの階級と形 | ○ | |
| 水準が近い会社の5社 | ○ | |
| 要点の箇条書き（位置の記述） | ○ | |
| 年齢別の折れ線と表 | 選択中の点の強調だけ | 8点の値そのものは不変 |
| **平均年収推移（10年）** | | **○** |

型の側で分けてある。基準ごとに変わるものは `CompanyAgeStats`（`byBasis` の9件）に入れ、
推移は `CompanyView` の外の `SalaryHistory` として `CompanyDetail` に別の prop で渡す。
**推移を `byBasis` の中に置けば「年齢そろえにしたら過去の有報の数字が変わる」を作れて
しまう**ので、置けない形にした。

## 分布（`buildDistribution`）

`stats.json` に表示基準ごとの `{ median, min, width, counts[9] }` を足した。

**階級を固定値にできない。** 25歳そろえの分布は 249〜788万円、実測値は 332〜2,178万円で、
同じ区切りを当てると片方は9ビンのうち7つが空になる（実測）。表示基準ごとに幅と下限を決める。

- 幅は「2〜95パーセンタイルが9ビンに収まる最小の丸い数字」（10/20/25/50/100/200/250/500/1000万円）
- 下限は2パーセンタイルを幅で切り下げた値
- **両端のビンは外側を吸収する。** 最大2,178万円まで等間隔で並べると実データの9割が最初の
  2ビンに潰れる。ラベルは「◯万円未満」「◯万円以上」になる

結果の幅は実測値100万円・25歳20万円・30歳50万円。`build-data.test.ts` が「どの基準でも
9ビン・合計が1,867・空でないビンが7つ以上」を固定している。

**位置バーは順位から出す。金額の絶対値からではない**（`positionPercent`）。金額を最小〜最大に
線形で当てると、上位1社の外れ値だけで帯の9割が空く。

## 水準が近い会社（`findNeighbors`）

**リクエスト時に算出する。** ビルド時に持つと 1,867社 × 9基準 × 5社 の表になる。

1業種は最大173社（情報・通信業）。実測で **0.05ms/基準**、9基準ぶんまとめても 0.5ms 未満で、
C1 が確かめた「リクエスト時は当該1社ぶんの16回だけ」に足しても Workers Free の
CPU 10ms に収まる。

**9基準ぶんをサーバーでまとめて出し、`byBasis` に載せて渡す。** クライアントで出すには
`companies.json` 全件が要り、「送るのは当該1社ぶんだけ」（spec 2.）を壊す。表示基準の切替は
ネットワーク無しで済む（AC-12）。

近さで選び、**並べるときは金額の降順に直す**——近さ順のままだと上下に交互に跳ねて読みにくい。

## 要点の箇条書き（`buildHighlights`）

**数値から機械的に導ける事実だけ。** 会社ごとの解説文は spec 1.10 で対象外のまま。

「若い／長い／大きい」の判定は**ランキングのフィルタと同じ三分位**を使う
（`features/ranking/lib/filter.ts` の `classifyAvgAgeBucket` ほか）。画面の別の場所で
「〜40歳」と区切っているのに、ここだけ別の線で「若い」と書いたら読者が混乱する。

**該当しない項目は出さない。** 三分位の真ん中に入りバッジも無い会社は2項目になる
（`highlights.test.ts` が固定）。項目数を揃えるために薄い記述を足さない。

## 推定範囲 ±20%

`ESTIMATE_RANGE_RATIO = 0.2` を1か所に置き、表とチャートの帯が同じ値を使う。

**目安の幅であって統計的な信頼区間ではない**旨を、表の `caption`・チャートの
`figcaption`・`/about` の3か所に置いた。**帯だけを見ると信頼区間に見える**ので、
図の側の断りを省けない。E2E が「ページ内に2か所」と `/about` にあることを固定している。

折れ線の縦軸は帯の外側まで入る範囲にした（折れ線だけに合わせると帯が枠から出る）。目盛は
4本で、丸い数字に寄せず描画範囲を等分する——0起点ではないので、丸めた目盛は誤読を招く。

## 10年推移（T1）

`history.json` は `app/company/[id]/page.tsx` からだけ読み、当該1社ぶんの10件を渡す。
**`app/page.tsx` からは import しない**（Issue #22・timeseries spec 3.）。実測で `/` の
HTMLサイズは変わっていない。

**値の無い年は棒を描かず、軸ラベルは残す**（AC-7）。内挿しない。縦軸は0起点でよい——
年齢別の折れ線と違い、ここで見たいのは水準そのものの増減である。折れ線との共通化は
していない（軸の取り方が違う。`docs/timeseries/overview.md`）。

増減の文は**実在する最初と最後の値**で書く（`buildHistorySummary`）。端の年が欠けている
会社があるので、常に2017→2026とは限らない。

## 器

PC は `md:grid-cols-[1fr_16rem]`（本文＋右サイドバー）、サイドバーは `md:sticky md:top-4`。
モバイルは1カラム。実測で 1280 / 768 / 390px のいずれも横スクロールは出ない。

パンくずの末尾は現在地なのでリンクにしない。ロゴ枠は U12 で作った
`features/ranking/components/CompanyLogoMark` を使う（`AgeSwitch` と同じ扱いで、
`design-system/` には昇格させない）。

## `features/ranking` との相互依存

U12 で ranking → company の向き（`deviationScore` ほか）ができ、C2 で
`CompanyLogoMark`・`classifyAvgAgeBucket`・`filter.ts` を company → ranking で使うようになった。

**この Unit では解消しない。** 「年収ドメイン」の共有モジュールを切り出すのは2施策のファイル
移動を伴い、レイアウト刷新と混ぜて1つの PR にすべきものではない（plan.md の判断どおり）。
既知の負債として `docs/company/company-page/design.md` にある一覧に、この2件を足した扱いになる。

## 実測値

| | C1 時点 | C2 |
| --- | ---: | ---: |
| `/company/6861`（gzip） | 8,250 B | **12,873 B** |
| `/company/6861?age=35`（gzip） | — | 12,818 B |
| `/company/7203`（gzip） | — | 12,722 B |
| `/`（gzip） | 72,244 B | **72,232 B**（変わらず） |
| `/about`（gzip） | 10,844 B | 11,219 B |
| `stats.json` | 132,856 B | 133,702 B（+846 B） |
| `/company/` へのプリフェッチ | 0件 | **0件** |

増分の内訳は、近傍5社×9基準（約2.2KB raw）・分布9基準（約0.6KB raw）・10年推移10件・
年齢別の表8行・3ステップ。**`/` は変わっていない**（timeseries AC-5）。

テスト: 単体 243 passed（web 19ファイル）＋ pipeline 27 passed、E2E 137 passed
（`company-refresh.spec.ts` 20件を新規）。
