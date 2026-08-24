# overview.md — Worker の実行予算の分解マップ

`docs/runtime/spec.md` を Unit に割る。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| R1 | 企業詳細ページを事前生成する | なし | AC-1〜AC-12 | `open-next.config.ts`・`app/company/[id]/page.tsx`・`features/company/`・`lib/seo/company.ts` に触る。**企業詳細の `?age=` を無くす**ので company 施策の spec も変わる（ADR-0012）。※共有: `lib/seo/`・`lib/history/` |

## 実施順序

```
R1（単独）
```

## R1 企業詳細ページを事前生成する

spec.md の 1.・2. すべて。

**2つを1つの Unit にする理由は、片方だけでは出せないため。** `force-static` のページは `searchParams` を読めないので、`?age=` を残したまま事前生成することはできない。逆に `?age=` だけ先に外しても、CPU は1msも減らない。

- **`incrementalCache` を挿す前に事前生成しても意味が無い**（spec AC-2）。既定の `"dummy"` は事前生成した結果を1枚も返さないので、`○ (Static)` と出ているページも毎回描き直される。**`/about` が企業詳細より重かったのはこれが理由だった**
- **読み取り専用の `staticAssetsIncrementalCache` を選ぶ。** KV・R2・D1 のバインディングを増やさずに済む（`docs/product/product.md` の制約）。再検証はできないが、このサイトのデータは年1回のビルドでしか変わらない
- **アセットへの配置は `opennextjs-cloudflare deploy` が自動でやる。** 手で置く工程は無い
- **`?age=` を外すと、企業詳細のメタデータは1組に固定される。** U16（#135）が企業詳細で直していた「タイトルの金額と画面の金額が食い違う」は、起きようが無くなる。**それでも `usePageMeta` は呼び続ける**——ランキングから遷移してきたときに前のページの canonical と description が `<head>` に残るため（`e2e/metadata.spec.ts` が実際に捕まえた）
- **戻る/進むで表示基準は復元されなくなる。** URL に無いものは復元できない。ランキング側の絞り込み・ページ番号は URL が正のまま変わらない（U14・Issue #108）

## 他施策から触られる箇所

**企業詳細ページの `?age=` は company 施策の C1（#52）が入れ、U11（#71）が実測値を既定にしたもの。** R1 でこれを外す（ADR-0012）。`docs/company/spec.md` の AC-3 が対応する受け入れ基準で、R1 と同じ PR で改訂する。

**この先 `/company/[id]` に項目を足す Unit（C5〜C7・#159〜#161）は、`searchParams` を読めない。** 読みたくなったらそれは「このページを動的に戻す」という決定なので、ADR-0012 を改訂すること。

## 共有コンポーネント

無し。新しい UI を作らない。

## R1 の対象外

spec 5. のとおり。とくに **`/` の事前生成**と**データファイルの分割**（#165 で一度やって #179 で戻した）は含めない。
