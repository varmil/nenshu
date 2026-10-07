# 現在地: E2E の書き方

> CLAUDE.md の「現在地」節から移した（2026-10-07・トークン消費の削減。移しただけで、本文は1字も書き換えていない）。
> 文中の「上の」「下の」は、CLAUDE.md の「現在地」に並んでいた当時の位置を指す。対応する項は `docs/status/` のどれかにある（索引は CLAUDE.md）。
> **新しく分かったことはここに書く。CLAUDE.md には書かない**（CLAUDE.md は全セッション・全サブエージェントが毎回読むので、伸ばすとそのまま消費量になる）。

`web/`にPlaywright E2E（`npm run test:e2e`）を導入済み（175件）。ブラウザ操作ツールが使えないセッションでの動作チェックはこれで代替できる（`docs/ranking/ranking-filters/design.md` 参照）。見た目・機能の変更にはUnitテストとE2Eの両方を書く運用（「開発上の約束」参照）。

**画面を操作する spec は `e2e/appTest.ts` の `test` を使う。素の `@playwright/test` を使わない**（F1・#209）。`goto`／`reload` の直後に**ハイドレーションの完了**（`astro-island[ssr]` が消えるまで）と、`/` なら**全件データの到着**（E0）を待つ。

- **島に React が取り付く前のクリックはどこにも届かない。** SSR したボタンは最初から DOM にあるので Playwright の自動待機は素通りし、`click()` は成功したように見えて何も起きない。**F1 の1巡目はこれで27件落ちた**
- **`waitUntil` を明示した `goto`／`reload` では待たない**——ハイドレーション前の HTML を見るテスト（`e2e/theme.spec.ts` のちらつき防止）は、待った時点でその瞬間を過ぎる。そこから続けて操作するなら `waitForHydration(page)` を明示的に呼ぶ
- **ページ間の遷移を見るときは `click()` が返るのを待てない。** 素の HTML 取得になったので `click()` も `expect(locator)` も**新しい文書が届くまで返らず**、戻ってきた時点では次のページに入れ替わっている。前のページで起きたことを見たいときは、**クリックの前にページ内で記録を始めて `exposeFunction` で受け取る**（`docs/framework/astro-cutover/design.md`。そこに出てくる `navigation-progress.spec.ts` は F2・#210 で指示器ごと消した）
- **`astro dev` の開発ツールバーは切ってある**（`astro.config.mjs` の `devToolbar`）。オーバーレイが `h1` を3つ持ち込むので `locator("h1")` が strict mode で落ちる
