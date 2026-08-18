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

Next.js（App Router）、TypeScript、Tailwind CSS、shadcn/ui、Cloudflare Workers。
**Cloudflare Workers上で`@opennextjs/cloudflare`によりフルSSRする（ADR-0004）。** `output: 'export'`の静的書き出しではない。API もデータベースも持たない点は変わらない（DBもAPIコールも無く、ビルド時に確定済みの静的データをリクエスト時にフィルタして返すだけ）。

バージョンは Next.js に限らず全般的に、特筆した理由がない限り着手時点の最新安定版を使う。固定が必要になったらADRに理由を書く。

理由は ADR-0001・ADR-0002・ADR-0004にある（ADR-0004がADR-0001の「サーバー実行環境は要らない」・ADR-0002の`output:'export'`を一部supersede）。

**クエリ文字列を読みたいときは、`app/page.tsx`（Server Component）の`searchParams`プロップで読む。** `next/navigation`の`useSearchParams()`（クライアントフック）は使わない。**`useRouter()`/`router.push()`もフィルタ操作等の高頻度なクライアント側状態変更には使わない**——RSCペイロードの再フェッチによるネットワーク発生・競合状態の問題をU5で実際に踏んだ（`docs/ranking/url-sync/design.md`参照）。クライアント側での状態⇄URL同期は`window.history.pushState`/`replaceState`を直接呼ぶ（`useRankingState`参照）。**ページ間の遷移など離散的でネットワークを許容してよい操作は`<Link>`にしてよい**（`/` ⇄ `/about` は`<Link>`を使っている）。ただしページネーションは、現状1,867社ぶんの全データが初回HTMLにembedされておりクライアントが既に全件保持しているため、`<Link>`にする意味が無く使っていない（U6・Issue #22参照）。

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

**Bolt 1（MVP: ランキング1ページ＋計算方法ページ）の全Unit U0〜U7が実装済み。** U0（データ変換パイプライン、`docs/ranking/data-pipeline/`、Issue #1）・U1（プロジェクト基盤とデザイントークン、`docs/ranking/project-foundation/`、Issue #2）・U2（ランキング表と年齢スイッチ、`docs/ranking/ranking-table/`、Issue #3）・U3（フィルタ4種、`docs/ranking/ranking-filters/`、Issue #4）・U4（フリーワード検索、`docs/ranking/free-word-search/`、Issue #5）・U5（URLクエリとの同期、`docs/ranking/url-sync/`、Issue #6）・U6（0件・端の状態とページネーション、`docs/ranking/ranking-pagination/`、Issue #7）・U7（計算方法ページ`/about`、`docs/ranking/about-page/`、Issue #8）。

**Cloudflare Workers への自動デプロイは接続済み・稼働中**（https://nenshu.fkmks-247.workers.dev/ ）。`output:'export'`をやめ`@opennextjs/cloudflare`でフルSSRしている（ADR-0004）。`/`は`searchParams`を読むので`ƒ (Dynamic)`、`/about`は`○ (Static)`。SSR成果物はエッジでキャッシュ（`wrangler.jsonc`の`cache.enabled: true`＋`next.config.ts`の`headers()`）、`_next/static/*`はWorkerを経由しないため`public/_headers`で設定している。デプロイ設定は`docs/ranking/project-foundation/design.md`参照。

**アクセス解析は Microsoft Clarity**（Issue #44）。`web/lib/analytics/clarity.ts` にタグを置き、`app/layout.tsx` から `next/script` の `strategy="afterInteractive"` で読む。npmパッケージは使わない（同じタグを注入するだけでJSバンドルが増えるため）。**本番ビルドでのみ有効**（`isClarityEnabled`）——開発サーバーとE2Eの実行ぶんが実セッションとして計測に混ざるのを防ぐため、またE2Eの「操作中にネットワークリクエストが発生しない」テスト（リクエスト数を0で固定）を壊さないため。

年齢・4フィルタ・検索語・ページ番号は`?age=&ind=&emp=&ten=&aage=&q=&page=`としてURLに同期済み（`page`は1始まり、既定値は省略）。

**未解決の課題（Bolt 2 に入る前に判断が要る）:**

- **Issue #42: 若年側の推定が過大になる。** 式が「産業平均に対する倍率は何歳でも同じ」と仮定しているが、実際の倍率は中央値1.22倍・最大4.32倍（キーエンス）で、25歳時点が高給企業で大幅に過大に出る（キーエンス1,642万円・三菱商事1,491万円）。**実装のバグではなくモデルの仮定の問題。** 対処候補（標準労働者カーブ／初任給アンカー／令和7年データへの更新／就職四季報）はIssueに調査済み。当面は`/about`の限界セクションに定量的に開示している。
- **Issue #22: 掲載企業数を増やす際のペイロード。** 全件embedアーキテクチャは1,867社で既にgzip後64KB/100KB予算を消費しており、4,000社規模では超過見込み。

次は `docs/ranking/overview.md` の Bolt 2（`/age/[age]`・`/industry/[industry]`・`/company/[id]`。パス設計は確定済み）。

`web/`にPlaywright E2E（`npm run test:e2e`）を導入済み。ブラウザ操作ツールが使えないセッションでの動作チェックはこれで代替できる（`docs/ranking/ranking-filters/design.md` 参照）。見た目・機能の変更にはUnitテストとE2Eの両方を書く運用（「開発上の約束」参照）。
