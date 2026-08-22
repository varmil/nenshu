# S3 データの時点（決算期）の明示 — plan.md

参照: Issue #134（親: #104）, `docs/site-chrome/spec.md` 1.4・5.（AC-17〜AC-20）, ADR-0006
依存: #53（U8・`web/lib/seo/`）, #68（S1・ページタイトルの決め）

## Context

サイトのどこを読んでも「有価証券報告書ベース」までしか分からず、**その有報がいつのものかが書いていない**（親 Issue #104）。読者は目の前の数字が今年のものか去年のものかを確かめられない。検索でも、競合が競っているのは鮮度と規模（`spec.md` 1.4 の実測）で、規模＝社数だけは既にタイトルに入れてある。

決算期は `pipeline/data/ranking_unified_2026.csv` の `period_end` 列に入っているが、**web にも `companies.json` にも渡っていない**。いま web が持っている時点らしきものは `companies.meta.version`（`"2026-06"`＝提出期のハードコード）だけで、これは決算期ではない。

## 先に確かめたこと（実測）

`period_end` の分布（`ranking_unified_2026.csv` 全1,867行）

| 決算期 | 社数 |
| --- | ---: |
| 2026-03 | 1,865 |
| 2026-04 | 2（株式会社ヤガミ・株式会社ダイサン。どちらも 2026-04-20） |

**1つの決算期で代表できる**（99.9%）。ただし全社が同じではないので、`/about` の「対象範囲」では「3月期が中心」と断る。

## 作業の順序

**下（データ）から上（画面）へ積む。** 表示側から先に書くと、決算期の文字列を仮で直書きすることになり、AC-20 の「直書きしない」を自分で破ってから直すことになる。

1. **パイプラインに `period_end` を通す。** `parseUnifiedCsv` に列を足し、`build-data.ts` が最頻の決算期を数えて `companies.meta` に載せる。ここで Unit テストを1本書き、`companies.json` を作り直す
2. **web の型と、文字列を組み立てる1か所を作る。** `CompaniesData["meta"]` に決算期を足し、`web/lib/data/period.ts` に「決算期 → `2026年3月期`」を置く。Unit テストで境界（1桁の月・欠けたとき）を固定する
3. **SEO（title・description）に載せる。** `lib/seo/ranking.ts`・`app/company/[id]/page.tsx`・`app/about/page.tsx`・`app/layout.tsx`。既存の `lib/seo/ranking.test.ts` に追記する
4. **画面に出す。** ランキングのリード文・企業詳細の「有価証券報告書の実測値」の見出し・`/about` の「対象範囲」。**重ねない**（1画面1回、`spec.md` 5.1）
5. **E2E を書く。** 3と4を1本ずつ、既存ファイルに追記する
6. **docs を締める。** design.md・`docs/ranking/overview.md`・`docs/company/overview.md`・CLAUDE.md の「現在地」

## 検証の順序

1. `cd pipeline && npm test`（1のあと。ここが緑にならないと `companies.json` を作り直せない）
2. `npm run build:data -- --out ../web/public/data` で JSON を作り直し、`git diff --stat` で**増えたのが `meta` だけ**であることを確かめる（`generatedAt` 以外の値が動いていたら推定式か並びが変わっている）
3. `cd web && npm run lint && npm run typecheck && npm test && npm run build`
4. `npm run test:e2e`
5. **dev server を立てて `/`・`/about`・`/company/6861` を実際に見る。** 見るところは、モバイル幅（390px）でリード文が3行に伸びていないか、実測値モードの画面に「推定」の語が現れていないか（ranking AC-1）、決算期が1画面に2回出ていないか
6. PR（`Closes #134`）→ 問題が無ければマージ

## リスク

- **リード文が長くなってモバイルで行が増える。** `RankingApp` の1文目は公開後の指摘で「2文まとめると390pxで3行になる」ため1文に削った経緯がある。決算期を足す先はその1文目なので、実機幅で行数を見る。伸びるなら文の側を削って釣り合わせる
- **`/` の HTML サイズ。** 予算は gzip 75,000 バイト（`spec.md` AC-16・`docs/logo/spec.md` AC-13）で現状 62,563 B。足すのは1ページに数十バイトなので問題にならないはずだが、ビルド後に測って design.md に残す
- **`companies.json` の作り直しで別の値が動く。** `build-data.ts` は `stats.json`・`history.json` も書く。2の `git diff` で確かめる
- **既存テストが title・description を完全一致で見ている可能性。** `lib/seo/ranking.test.ts` と `e2e/seo.spec.ts` を先に読んでから3に入る
