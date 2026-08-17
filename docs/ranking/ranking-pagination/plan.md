# U6 0件・端の状態と段階表示 — Unit実行プラン

## 参照

- Issue #7（完了条件の正）。参照: `docs/ranking/spec.md` §1.8, AC-8。依存: U3, U4（実装済み）。

## Context

現状、`RankingState.visibleCount`は100固定で、上位100件を超える結果を見る手段が無い（0件時の案内も無い）。ユーザーとの相談の結果、「もっと見る」ボタンや無限スクロールではなく、**通常のページネーション**を採用することにした（SEO上の理由。shadcn/uiに`pagination`コンポーネントがある）。

これに伴い、**spec.md §1.9「対象外（MVP）」からページネーションを削除し、正式にU6のスコープとして取り入れる**（ユーザー承認済み）。ADR-0004でSSR化済みのため、`?page=2`等のURLもリクエスト時に正しい内容でSSRされ、各ページが独立してクロール可能になる——静的export時代にはできなかった組み合わせ。

## 決定事項（設計の骨子。詳細はdesign.mdへ）

- spec.md §1.9からページネーションの除外を削除し、§1.8にページネーション仕様（ページサイズ100、`page`クエリパラメータ、1始まり）を追記する。
- `RankingState.visibleCount: number` → `page: number`（1始まり、既定1）。`PAGE_SIZE = 100`定数を`types.ts`に置く。
- URLパラメータの末尾に`page`を追加: `age → ind → emp → ten → aage → q → page`。既定値（1）は省略。不正値は無視して1に倒す。
- `buildRankedCompanies`は`{ companies, totalCount }`を返すようにする。要求pageが総ページ数を超える場合は最終ページにクランプする。
- `totalCount === 0`のとき、0件案内メッセージを表示する（AC-8。エラー表示にしない）。
- フィルタ変更時は`page: 1`にリセットする。
- ページネーションUIは**クライアント側完結**（`pushState`、ネットワーク非発生）にする。**`next/link`の`<Link>`による実ナビゲーション＋Suspenseは検討したが不採用** — 現在すでに全企業データが初回HTMLにembedされており（gzip後64KB/100KB予算）、クライアントは既に全件保持しているため、ページ送りで通信してもデータ量は減らず意味がない。将来的な掲載企業数拡大（Issue #22）でアーキテクチャを見直す際に再検討する。
- 「読み込み中の状態」は`useTransition()`の`isPending`で表現する。E2Eでの安定した検証は難しい可能性が高く、正直に明記する。

## 段取り

1. `docs/ranking/ranking-pagination/design.md`を書く。
2. `docs/ranking/spec.md`を更新する。
3. `web/features/ranking/types.ts`: `visibleCount`→`page`、`PAGE_SIZE`定数追加。
4. `web/features/ranking/lib/urlState.ts`: INITIAL_STATE更新、`page`のbuild/parse追加、カノニカル順序テスト更新。
5. `web/features/ranking/lib/rank.ts`: `totalCount`付き返り値・ページ切り出し・クランプ。`rank.test.ts`更新。
6. `web/features/ranking/lib/pagination.ts`（新規）: ページ番号範囲の計算。テストを書く。
7. `npx shadcn@latest add pagination`。
8. `web/features/ranking/components/RankingPagination.tsx`（新規）、`RankingApp.tsx`に組み込み・0件案内・page:1リセットを追加。
9. `npm run build`・`npm run lint`・`npm run typecheck`・`npm test`。
10. E2Eを書く: AC-8の0件案内、ページ送りで内容が変わる、フィルタ変更でpageが1に戻る、`?page=2`直接オープンのSSR内容を生HTTPリクエストで検証、ページ送り操作中にネットワークリクエストが発生しないこと。
11. Issue #7の完了条件を一つずつ確認する。
12. `CLAUDE.md`の現在地を更新。
13. Issue #22に、全件embedアーキテクチャのpayload予算消費状況をコメントする。

## リスク

- `visibleCount`→`page`のstate shape変更の影響範囲を丁寧に確認する。
- `useTransition`のpending状態がE2Eで安定して検証できない可能性。

## この後

続けて`docs/ranking/ranking-pagination/design.md`を書いてから実装に入る。
