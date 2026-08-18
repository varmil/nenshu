# C1 企業詳細ページ v1 — plan.md

参照: Issue #52, `docs/company/spec.md` AC-1〜AC-10, ADR-0004, ADR-0005, ADR-0006
依存: C0（#51、マージ済み）

## Context

ランキングは「どの会社が高いか」に答えるが、読者の多くは特定の1社を頭に置いて訪れる。「◯◯（社名） 年収」という検索の受け皿が無く、その問いは1,867行の表の中でしか解けない（`docs/company/intent.md` H1）。

1社につき1枚、計1,867枚の `/company/[id]` を作る。#30 のチェックリストのうち **手持ちデータで作れる5項目**が v1 の範囲（ユーザー判断・2026-08-18）。10年推移は #54、株価・格付けは #55 に切り出してある。

## 事前に確定させた数値（実データで計測済み・受け入れ基準の元）

母集団統計（全1,867社、円）

| 目標年齢 | 平均 | 標準偏差 |
| ---: | ---: | ---: |
| 25歳 | 4,189,881 | 477,568 |
| 35歳 | 6,291,889 | 1,548,572 |
| 60歳 | 6,669,283 | 1,883,601 |

| 会社 | id | 目標年齢 | 推定年収 | 全体順位 | 上位 | 業界内 | 偏差値 | 平均との差 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| キーエンス | `6861` | 35歳 | 2,178万円 | 1位 | 0.1%未満 | 1/150 | 150.0 | ＋1,549万円 |
| キーエンス | `6861` | 25歳 | 788万円 | 1位 | 0.1%未満 | 1/150 | 127.3 | ＋369万円 |
| キーエンス | `6861` | 60歳 | 2,213万円 | 1位 | 0.1%未満 | 1/150 | 132.1 | ＋1,546万円 |
| トヨタ自動車 | `7203` | 35歳 | 859万円 | 120位 | 6.4% | 2/71 | 64.9 | ＋230万円 |
| みずほ銀行 | `E03532` | 35歳 | 755万円 | 280位 | 15.0% | 17/82 | 58.1 | ＋126万円 |
| 三菱商事（本社のみ） | `8058` | 35歳 | 1,578万円 | 3位 | 0.2% | 1/166 | 111.3 | ＋949万円 |

キーエンスの8年齢: 788 / 1,487 / 2,178 / 2,365 / 2,493 / 2,620 / 2,699 / 2,213万円。**60歳で下がる**のは業種カーブ自体が62歳・67歳に向けて落ちるため（既知の性質）。

## 変更するもの

### パイプライン（母集団統計の事前計算）

- `pipeline/scripts/build-data.ts` — `stats.json` を追加で出力する。8年齢 × 全社の「全体順位・業界内順位」、8年齢ぶんの母集団統計（平均・標準偏差）、業種ごとの社数
  - **リクエストごとに1,867社×8年齢を計算しない**（Workers Free の CPU 10ms/リクエスト制約。`docs/ranking/ssr-migration/design.md` の実測でウォーム時20〜28ms）
  - `/` はこのファイルを読まないので、トップページのペイロード（実測 gzip 64KB）は増えない
  - 推定は `web/features/ranking/lib/salary.ts` の `estimateSalary` をそのまま呼ぶ。**式を書き写さない**（ADR-0005 で決めた線）

### web

- `web/app/company/[id]/page.tsx`（新規） — Server Component。`searchParams` の `age` を読み、当該1社ぶんの8年齢の値を組み立ててクライアントへ渡す。存在しないIDは `notFound()`
- `web/features/company/lib/stats.ts`（新規） — `stats.json` の型と、偏差値・上位◯%・平均との差を出す純粋関数
- `web/features/company/lib/view.ts`（新規） — 1社ぶんの8年齢の表示用データを組み立てる純粋関数（テストの主対象）
- `web/features/company/components/CompanyDetail.tsx`（新規） — Client Component。年齢スイッチと `?age=` の同期
- `web/features/company/components/SalaryCurveChart.tsx`（新規） — 25〜60歳の折れ線。**依存を足さずインラインSVG**
- `web/features/ranking/components/RankingTable.tsx` / `RankingCardList.tsx` — 会社名を `<Link href="/company/{id}">` にする
- `web/next.config.ts` — `headers()` に `/company/:id` を足す（`/` と `/about` を列挙する作りのため）

### 再利用するもの（新しく作らない）

`estimateSalary`・`curveValuesInYen`・`interpolate`・`formatManYen`・`formatDecimal1`・`formatInt`・`AgeSwitch`・`TARGET_AGES`／`TargetAge`。すべて `features/ranking/` にある。

**`AgeSwitch` を `design-system/components/` へ昇格させるかは design.md で判断する**（`docs/company/overview.md` の共有コンポーネント）。

## テスト

「開発上の約束」に従い Unit と E2E の両方を書く。

- `features/company/lib/view.test.ts` — 上の表の値を実データで固定する。偏差値・上位◯%（0.1%未満の分岐を含む）・平均との差・8年齢ぶんの推定年収・存在しないID
- `features/company/lib/stats.test.ts` — 偏差値と上位◯%の純粋関数（境界値）
- `pipeline/scripts/build-data.test.ts` — `stats.json` の形（8年齢・1,867行ぶん・順位が1以上かつ社数以下・母集団統計が正）と、**`stats.json` の順位が実際に推定年収の降順と一致すること**
- `web/e2e/company-page.spec.ts`（新規） — AC-1〜AC-10。ランキングからの遷移、年齢スイッチでネットワークが発生しないこと、`?age=60` の直接オープン、404、モバイル幅で横スクロールしないこと、SSRのHTMLに金額が含まれること
- `web/e2e/ranking-filters.spec.ts` — 会社名がリンクになったことによる既存アサーションの影響を確認する

## 検証

1. `cd pipeline && npm test` / `cd web && npm run lint && npm run typecheck && npm test && npm run test:e2e`
2. `npm run build` で `/` が `ƒ`、`/about` が `○`、`/company/[id]` が `ƒ`
3. dev server で `/company/6861`・`/company/E03532`・`/company/8058` を実際に触る（年齢スイッチ・チャート・ランキングからの遷移・モバイル幅）
4. **表示される数値を上の表と1つずつ突き合わせる**
5. PR（`Closes #52`）→ 問題が無ければマージ

## リスク

- **偏差値150.0を出すこと。** 読者に壊れて見える。「上位◯%」の併記と注記で担保するが、実際の見た目を dev server で確認してから出す
- **`stats.json` が worker バンドルを膨らませる。** 1,867×8×2 の整数で概算150KB。Workers Free の上限は圧縮後3MB なので余裕はあるが、ビルド後のサイズを実測する
- **ランキングの会社名をリンクにすると既存のE2Eが壊れうる。** テキストのアサーションはリンクでも通るはずだが、実行して確かめる
- **canonical・sitemap はこの Unit では入れない**（U8・#53）。企業ページのtitle/descriptionだけ入れ、`metadataBase` を要する部分は U8 に寄せる
