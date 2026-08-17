# CLAUDE.md

年齢補正した年収ランキングを公開する静的サイト。AI-DLC に沿って開発する。

AI-DLC のフェーズ定義・ドキュメント種別（spec / overview / plan / design の違い）・承認ゲートは `docs/AI-DLC実践リファレンス_v10.pdf` が正。plan.md や design.md を書く前、Unit に着手する前は必ずこれを読み、記載されている型に従う。

## このリポジトリの読み方

決定はすべて `docs/` にある。セッションをまたぐ前提はここから読む。

| 知りたいこと | 読む場所 |
| --- | --- |
| 開発の進め方（フェーズ・ドキュメント種別・承認ゲート） | `docs/AI-DLC実践リファレンス_v10.pdf` |
| プロダクト全体の面・アクター・施策一覧 | `docs/product/product.md` |
| 用語の定義 | `docs/product/glossary.md` |
| なぜ作るか・成功指標 | `docs/ranking/intent.md` |
| 何を作るか・受け入れ基準 | `docs/ranking/spec.md` |
| Unit の分解と順序 | `docs/ranking/overview.md` |
| 不可逆な技術決定 | `docs/adr/NNNN-*.md` |

Unit ごとの `plan.md` / `design.md` は、その Unit に着手する時点で書く。事前に埋めない。

## 採用スタック

Next.js（App Router / `output: 'export'`）、TypeScript、Tailwind CSS、shadcn/ui、Cloudflare Pages。
サーバーサイドの実行環境を持たない。API もデータベースもない。

バージョンは Next.js に限らず全般的に、特筆した理由がない限り着手時点の最新安定版を使う。固定が必要になったらADRに理由を書く。

理由は ADR-0001 と ADR-0002 にある。

**`next/navigation` の `useSearchParams()` は使わない。** `output: 'export'` では、`useSearchParams()` を使うコンポーネントは `<Suspense>` で囲んでいても静的HTMLへのプリレンダーからスキップされ（`BAILOUT_TO_CLIENT_SIDE_RENDERING`）、実行時に完全にクライアント側でレンダリングされる。U5で実際にこれを踏み、ランキング表がHTMLから消える回帰を起こした（`docs/ranking/url-sync/design.md`参照）。クエリ文字列を読みたいときは `window.location.search` を直接読む。`useRouter()`・`usePathname()` にはこの制約はない。

## エージェントが従う優先順位

既存コードベース ＞ `web/design-system/` のレジストリ ＞ モック。

色は `design-system/tokens/tokens.css` の CSS 変数だけを使う。生の hex を書かない。
コンポーネントは `design-system/ui/`（shadcn プリミティブ）と `design-system/components/`（合成物）から取る。
在庫にないものが必要になったら、その場で作らず Issue を起票する。

## 開発上の約束

- 数値の出典と計算方法は必ずユーザーから見える場所に置く。根拠を隠した推定値を表示しない。
- 推定値と実測値を同じ書式で並べない。年齢補正後の金額は推定であることが読んで分かる形にする。
- データの再生成は `pipeline/scripts/build-data.ts` に集約する。手作業で JSON を編集しない。
- `package.json`（ルート・`pipeline/`・`web/` それぞれ）を変更したら、その場で `npm install` を実行して対応する `package-lock.json` を更新し、同じコミット・同じPRに含める。ロックファイルが `package.json` とずれた状態でマージしない。
- **`web/` のロックファイルを更新したら、ローカルのnpmバージョンではなく `npx npm@10.9.2 ci`（Cloudflareのビルド環境が使うバージョン。変わっていたらビルドログの `Detected the following tools` 行で確認）で `npm ci` が通ることを確認する。** ローカルのnpmが新しいと、optionalDependencies（`@emnapi/*` 等）の解決がnpmバージョン間で微妙に異なり、ローカルでは通るのにCloudflareの `npm ci` だけ「lock fileとずれている」で失敗することがある（実際に2回発生した）。**このルールは `web/` に限る。** Cloudflareがビルドするのは `web/` だけで、ルートと `pipeline/` はCIの対象外のため、ローカルのnpmで `npm ci` が通ることの確認で足りる。
- **見た目（レイアウト・レスポンシブ・キーボード操作等）または機能に変更があるときは、Unitテスト（統合テスト含む）とE2Eテスト（`web/e2e/`, `npm run test:e2e`）の両方を書き、リポジトリに残す。** その場限りの動作確認で済ませない。ロジックの正しさはUnitテストで固定し、実際にブラウザでどう描画・動作するか（型チェック・Unitテストでは検出できない領域）はE2Eで固定する。U3でこの運用により実際にモバイル幅の横スクロールバグを検出できた（`docs/ranking/ranking-filters/design.md`参照）。既存のE2Eファイル（例: `web/e2e/ranking-filters.spec.ts`）に該当する変更なら新規ファイルを増やさずそこに追記してよい。

## Unit完了後の運用

Unit の実装を終えたら、次の順で進める。

1. **動作チェック**: ビルドとテストを実行する。見た目・機能に変更があるUnitは「開発上の約束」のとおりUnitテスト・E2Eテストを書いたうえで、UIを持つUnitはさらに dev server を起動して実際にブラウザで機能を触って確認する（型チェック・テストが通ることはコードの正しさの保証であって、機能の正しさの保証ではない）。**ブラウザ操作ツールがそのセッションで使えない場合は、E2Eテストの実行結果で代替してよい。** `package.json` に変更があるなら `package-lock.json` が更新・ステージされているかもここで確認する（「開発上の約束」参照）。
2. 対応する Issue に紐づけた PR を作成する（`Closes #<番号>`）。
3. **動作チェックに問題がなければ、承認を待たずにマージしてよい。** 問題が見つかった場合はマージせず、内容を報告する。

この許可は Unit の実装フロー（ビルド・テスト・PR・マージ）に限る。破壊的な操作（force push・履歴の書き換え等）や、この運用の対象外の判断が要る場面は都度確認する。

## 現在地

Bolt 1（MVP: ランキング1ページ）に着手する段階。U0（データ変換パイプライン、`docs/ranking/data-pipeline/`、Issue #1）・U1（プロジェクト基盤とデザイントークン、`docs/ranking/project-foundation/`、Issue #2）・U2（ランキング表と年齢スイッチ、`docs/ranking/ranking-table/`、Issue #3）・U3（フィルタ4種、`docs/ranking/ranking-filters/`、Issue #4）・U4（フリーワード検索、`docs/ranking/free-word-search/`、Issue #5）は実装済み。**Cloudflare Workers への自動デプロイは接続済み・稼働中**（https://nenshu.fkmks-247.workers.dev/ 、設定は `docs/ranking/project-foundation/design.md` 参照）。次は `docs/ranking/overview.md` の U5（URLクエリとの同期、U3・U4に依存）。`useRankingState` は業種・従業員数・在籍年数・平均年齢・`query`（フリーワード）の絞り込みがすべて揃った状態。U5はこれらをURLクエリパラメータへ同期する形で乗る（`docs/ranking/spec.md` §1.7 参照）。`web/`にPlaywright E2E（`npm run test:e2e`）を導入済み。ブラウザ操作ツールが使えないセッションでの動作チェックはこれで代替できる（`docs/ranking/ranking-filters/design.md` 参照）。見た目・機能の変更にはUnitテストとE2Eの両方を書く運用（「開発上の約束」参照）。
