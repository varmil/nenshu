# overview.md — 企業詳細ページの分解マップ

`docs/company/spec.md` を Unit に割る。v1（企業詳細ページ1枚）の範囲だけを扱う。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| C0 | 企業IDの安定化 | なし | AC-5, AC-7 | パイプライン。表示は変わらない |
| C1 | 企業詳細ページ v1 | C0 | AC-1〜AC-10 | 施策の中核 |

`docs/ranking/overview.md` の **U8（検索エンジン向け導線）は C1 に依存する**（sitemap に企業ページのURLを載せるため）。施策は別だが順序としては C1 の後になる。

## 実施順序

```
C0 ─→ C1 ─→ （ranking施策の U8）
```

C0 を先にやるのは、**IDが決まらないと公開URLが決まらない**ため。C1 を作ってから ID を変えると、公開前とはいえURLの作り直しになる。

## C0 企業IDの安定化

現行 `makeId` は非上場107社に書類ID由来のIDを振っており、書類IDは毎年の有報提出で変わる（ADR-0006）。証券コード／EDINETコードに変える。

`edinet_code` 列をCSVに足す作業を含む。この列は `docs/product/product.md` の `timeseries` 施策（平均年収の10年推移）で年をまたぐ名寄せキーになるため、その時点で作り直さずに済む形にしておく。

**表示に影響しない Unit である。** 現行の `id` は React の `key` にしか使われていないため、ランキングの見た目・挙動は変わらない。既存のUnitテスト・E2Eが緑のままであることが完了条件の一部になる。

## C1 企業詳細ページ v1

spec.md の 1.1〜1.9 すべて。ルート・数値・チャート・ランキングからの導線を1つの垂直スライスとして出す。

順位・偏差値の**母集団統計をビルド時に確定させる**のもこの Unit に含む（spec.md 2. 非機能要件）。

## 共有コンポーネント

**年齢スイッチ（`features/ranking/components/AgeSwitch.tsx`）** — ranking 施策のものを企業詳細ページからも使う。**2つ目の施策から使う最初のコンポーネントになる。**

`docs/AI-DLC実践リファレンス_v10.pdf` の運用ルール④「featureをまたぐUIは `design-system/components/` へ昇格（Issue起票→設計承認を厚く）」に該当する。C1 の設計時に、昇格させるか `features/ranking/` から import するかを判断し、昇格させるなら `design-system/inventory.md` に記録する。

**推定年収の計算（`features/ranking/lib/salary.ts` ほか）** — 同じく ranking 施策の純粋関数をそのまま使う。**式を書き写さない**（ADR-0005 で決めた線。写すと片方の変更を取り逃す）。

**年齢別チャート** — 企業詳細ページにしか無いUIなので `features/company/components/` に留める。昇格させない。

## 昇格の判断

`features/company/components/` に置くものが既定。年齢スイッチだけが例外の候補になる。

## v1 の対象外

平均年収の10年推移（`timeseries` 施策）、株価推移・信用格付け（`market-data` 施策）、業績、同業他社の比較表。`docs/product/product.md` の施策マップを参照。
