# C20 ランキングへ戻る導線 — plan.md

参照: `docs/company/spec.md` 1.24・AC-37, `docs/adr/0006-public-url-strategy.md`, ADR-0012, Claude Design `企業詳細 ランキング導線.dc.html`（1b）
依存: C3
Issue: 未起票（このセッションから Issue を立てられなかった。起票したらここに番号を書く）

## Context

企業詳細の本文は「このページの出典」で終わり、ランキングへはパンくずかヘッダのロゴまで戻るしかない。
Claude Design で4案（0 現状・1a トップ1本・1b 業種＋全体の2本・1c 該当ページへ直行）を並べ、1b を採った。
1c はランキング側に行のハイライトと順位のずれの扱いが要るので、この Unit では作らない。

## 進め方

1. spec に 1.24 と AC-37 を足し、overview に C20 の行を足す
2. 行き先と文言を組み立てる関数を書き、パンくずと同じ行き先になることをユニットテストで固定する
3. 描画のコンポーネントを書き、`CompanyDetail` の本文＋サイドバーの grid とフッタの間に置く
4. E2E を既存の `e2e/company-refresh.spec.ts` に足す（節の並びの h2 の一覧・置き場所・押した先・PC とモバイルの並び）。
   横スクロールは AC-15 の 375px のループに任せる
5. typecheck・lint・vitest・build・E2E を通す
