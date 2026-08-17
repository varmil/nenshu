# SSR移行（ADR-0004） — Unit実行プラン

## 参照

- Issue #37（完了条件の正）。参照: `docs/adr/0004-ssr-opennext-cloudflare.md`。
- `docs/ranking/project-foundation/design.md`（現在のCloudflareデプロイ構成、「踏んだ罠」節）。

## Context

U5完了後、フィルタ付きURL（例: `/?age=45&ind=銀行業`）を直接開くと、`output:'export'`が生成する静的HTMLは常にビルド時の初期値（35歳・絞り込みなし）になり、実際の絞り込み結果はJS実行後にしか反映されないことが判明した。見た目のチラつき自体はPR #36（`useEffect`→`useLayoutEffect`）でほぼ解消できるが、**検索エンジンのクローラーがJS実行前に取得するHTMLの中身は常にビルド時の初期値のまま**という制約は残り、フィルタ済みURLのSEOという目的そのものを達成できない。

ADR-0004（承認済み）で、Cloudflare Workers上でNext.jsをフルSSR（`@opennextjs/cloudflare`、PPRは使わない）に切り替えることを決定した。本プランはその実装。データ更新が年1回である一方、SSR成果物はリクエストごとに再計算されるコストがあるため、エッジキャッシュも合わせて導入する。

## 事前確認（済み）

- Next.js 16.3.1で`searchParams`はServer Componentの`page`に`Promise<{ [key:string]: string|string[]|undefined }>`として渡され、読むとそのルートは自動的に動的レンダリングになる（`export const dynamic = 'force-dynamic'`は不要）。PPR/Cache Componentsは`cacheComponents:true`を明示しない限り無効のままなので、ADR-0004どおりPPRには触れない。
- `"use client"`コンポーネントもSSR時はサーバー上で一度実行される。`useState`の初期値・`useMemo`はSSR中に評価されるが、`useEffect`/`useLayoutEffect`はブラウザでのみ実行される。つまり`RankingApp`に`initialState`をpropsで渡せば、既存の`useMemo(() => buildRankedCompanies(...))`がSSR時にもそのまま正しく動く。**`page.tsx`側で`rankedCompanies`を別途計算する必要はなく、`initialState`だけ渡せば足りる。**
- `buildRankedCompanies`・`parseSearchParams`・`matchesFilters`等は既にReact非依存の純粋関数で、そのままServer Componentから呼べる。
- OpenNext Cloudflare adapter（`@opennextjs/cloudflare`）はNext.jsをworkerd上のNode.jsランタイムモードで動かす。Workers Free planは圧縮後Worker本体3MB・メモリ128MB・リクエストあたりCPU時間10ms・1日10万リクエストまで無料。データは`companies.json`133KB＋`curves.json`1.5KBで無視できるサイズ。CPU時間10msに収まるかは未実測（このUnitで確認する）。
- `docs/ranking/project-foundation/design.md`に「踏んだ罠」として記録済み: プロジェクト作成時、Cloudflareが自動検出する「Next.js」テンプレートのビルドコマンドは`npx opennextjs-cloudflare build`だった（当時は`output:'export'`だったため`.next/standalone`が無く失敗し、静的アセット配信の設定に戻した経緯がある）。今回はこの構成に**意図的に戻す**。

## 確定事項（設計の骨子。詳細はdesign.mdへ）

- `web/next.config.ts`: `output: 'export'`を削除。`initOpenNextCloudflareForDev()`を追加。
- `web/open-next.config.ts`（新規）: `defineCloudflareConfig({})`。R2 incremental cacheは今回導入しない（ISRを使わないため）。
- `web/wrangler.jsonc`: SSR用の設定（`main`・`compatibility_flags`・`assets`・`services`）に総入れ替え。
- `web/app/page.tsx`: `searchParams`を読み、`initialState`を計算して`RankingApp`に渡す。
- `web/features/ranking/lib/urlState.ts`: Next.jsの`searchParams`オブジェクト→`URLSearchParams`の変換関数を追加。
- `web/features/ranking/components/RankingApp.tsx` / `hooks/useRankingState.ts`: `initialState`をpropsで受け取る。マウント時のURL再読み込み・`isFirstWrite`ガード・`useIsomorphicLayoutEffect`（PR #36）を削除し、`popstate`リスナーだけ残す。
- SSR成果物をエッジでキャッシュする（`Cache-Control`/`Cloudflare-CDN-Cache-Control`ヘッダー。効かない場合はCache API直接実装かCache Ruleを検討）。
- Cloudflareダッシュボードのビルド/デプロイコマンド変更が必要（ユーザー作業）。

## 段取り

1. `docs/ranking/ssr-migration/design.md` を書く。
2. `@opennextjs/cloudflare`を`web/package.json`に追加し、`npx npm@10.9.2 install`でロックファイルを更新する。
3. `next.config.ts`・`open-next.config.ts`・`wrangler.jsonc`・`.dev.vars`・`.gitignore`を設定する。
4. `urlState.ts`に`searchParams`変換関数を追加し、Unitテストを書く。
5. `page.tsx`を書き換える。
6. `RankingApp.tsx`・`useRankingState.ts`を書き換える。
7. `npm run build`が`output:'export'`なしで通り、`web/out/`が生成されないことを確認する。
8. `npx opennextjs-cloudflare build`を実行し、`.open-next/`が生成されること、Worker本体サイズが3MB以内に収まることを確認する。
9. `npx wrangler dev`でローカルにWorkersランタイムを起動し、`curl`で`/`と`/?age=45&ind=銀行業`を叩いて生HTMLに正しい絞り込み結果とCache-Controlヘッダーが含まれることを確認する。
10. `npm run lint && npm run typecheck && npm test`。
11. `npm run test:e2e`（既存＋新規の生HTTPでのSEO検証テスト）。
12. `docs/ranking/project-foundation/design.md`にCloudflareダッシュボードの新しいビルド/デプロイコマンドを追記する。
13. PRを作成する（`Closes #37`）。**通常のUnit自動マージの対象外として扱う**（本番デプロイ設定と密結合しているため、マージ後にユーザーへダッシュボード更新を依頼し、タイミングを合わせる）。
14. PR #36はこのUnitで不要になるため、マージせずクローズする。
15. 本番デプロイ後、`curl -I`でエッジキャッシュ（`CF-Cache-Status`）の効果を確認する。

## リスク

- Workers Free planのCPU時間10ms/リクエストにフィルタ+レンダリングが収まるか未実測。
- Cloudflareダッシュボードの変更はユーザーの手作業が必要。マージのタイミングを誤ると本番のデプロイが止まりうる。
- `@opennextjs/cloudflare`とNext.js 16.3.1の組み合わせでの実績が薄い可能性がある。
- エッジキャッシュが`Cache-Control`ヘッダーだけで自動的に効くとは限らない（`*.workers.dev`運用のため）。

## この後

続けて `docs/ranking/ssr-migration/design.md` を書いてから実装に入る。
