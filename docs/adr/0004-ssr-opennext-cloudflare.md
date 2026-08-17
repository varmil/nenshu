# ADR-0004 静的書き出しをやめ、Cloudflare Workers 上で Next.js を SSR する

状態: Accepted

日付: 2026-08-17

## 文脈

U5（URLクエリとの同期）で、絞り込み・検索語をURLクエリに同期する仕組みを実装した。`output: 'export'`（ADR-0002）はビルド時に1回だけHTMLを生成するため、初期HTMLは常にビルド時の初期値（35歳・絞り込みなし）になる。フィルタ付きURL（例: `/?age=45&ind=銀行業`）を直接開いた場合も、サーバーが返すHTMLの中身は常に「絞り込みなし」で、実際の絞り込み結果はJSがURLを読んでから初めて反映される。

これによる見た目のチラつき自体は、URL読み取りを`useLayoutEffect`に変えることでほぼ解消できる（別PR #36）。しかしこれは対症療法で、**検索エンジンのクローラーがJS実行前に取得するHTMLの中身は、フィルタ付きURLに対して常にビルド時の初期値のまま**という制約自体は残る。

spec.md 136行目のSEO要件（「トップページの初期表示（35歳・絞り込みなしの上位100社）はHTMLに含める」）は現状のstatic exportで既に満たしている。今回の論点はそれを超えて、**フィルタ・検索語付きのURLについても、クロール時点のHTMLが実際のクエリに対応した内容を返す**ことを新たに目指すかどうかである。自然検索がNorth Star KPI（`docs/ranking/intent.md`）であり、「業種名 年収」のようなロングテールの検索流入を狙うなら、フィルタ済みURLが検索結果に正しい内容で載る必要があると判断した。

事前調査:

- Next.js 16（本プロジェクトが既に使用中。ビルドログで`16.3.1`確認済み）でPartial Prerendering（PPR）は実験フラグではなく`cacheComponents`として正式安定化している。
- Cloudflare WorkersでNext.jsをフルSSR実行するには`@opennextjs/cloudflare`（OpenNext Cloudflare adapter）を使う。Next.jsをNode.jsランタイムモードでworkerd（V8 isolate）上に載せる。
- Cloudflare Workers Free planの制約: 圧縮後Worker本体3MB、メモリ128MB、リクエストあたりCPU時間10ms、1日10万リクエストまで無料（[Cloudflare Workers Pricing](https://www.srvrlss.io/provider/cloudflare/)、[Easton: Cloudflare Free Tier Limits](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/)）。
- 本サイトのデータは`companies.json`が133KB、`curves.json`が1.5KB（ADR-0003）。DBもAPIコールも無く、フィルタ計算は1,867行の配列操作1回のみ。3MB上限・10ms CPU時間の両方に対して十分小さい想定だが、実測での確認は移行実装時に行う。

## 決定

**デプロイ先はCloudflare Workersのまま、配信方式を静的アセット配信からNext.jsのフルSSR（`@opennextjs/cloudflare`）に切り替える。**

**PPR（Partial Prerendering）は使わない。** 素の（全体が動的な）SSRで、トップページはリクエストごとにクエリパラメータをサーバーコンポーネントで同期的に読み、絞り込み済みの結果をそのままHTMLとして返す。

## 理由

- このサイトには「遅い動的部分」が存在しない。全データはビルド時に確定済みで、フィルタ計算はミリ秒未満。PPRの価値は「静的シェルを即座に返しつつ、遅い動的部分だけをSuspenseでストリーミングする」ことにあるが、ストリーミングする理由がある遅延が無い。PPRを導入するとSuspense境界・postponed stateの分だけ実装と検証の複雑さが増えるのに、得られるTTFBの改善はほぼゼロ。素のSSRで同じ「常に正しい初期HTML」という結果を、より単純な実装で得られる。
- U5で`useSearchParams()`がstatic exportでは静的HTMLから丸ごと除外されることが判明し（`docs/ranking/url-sync/design.md`）、回避策として`window.history`の直接操作＋クライアント側読み取りに倒した経緯がある。この構成は「初回レンダーのHTMLが常にビルド時の初期値」という制約自体を生み出しており、対症療法を重ねるより、SSRに切り替えて制約の発生源を無くすほうが筋がよい。
- OpenNext Cloudflare adapterはCloudflare公式が関与するアダプタで、Next.jsの主要機能をWorkers上でサポートしている。データサイズ・計算量ともにFree planの制約に対して十分小さく、追加コストなしで移行できる見込み。

## 結果

- **ADR-0001の「サーバーサイドの実行環境は要らない」という前提、およびADR-0002の`output: 'export'`は本ADRにより一部supersedeされる。** Cloudflareを使うという判断そのもの（商用利用可・無料枠・帯域無制限）はADR-0001のまま有効。Next.js + shadcn/ui + TypeScriptというADR-0002の技術選定も有効。変わるのは配信方式（静的ファイル配信→SSR）だけ。
- ログイン・会員機能・動的APIを持たないという方針（intent.mdの「作らないもの」）は変えない。SSRはあくまで「ビルド時に確定済みの静的データを、リクエスト時にクエリでフィルタして返す」だけで、DBも外部APIも持ち込まない。
- Bolt 2で計画している企業詳細1,867ページ・業種33ページ・年齢別8ページは、クエリに依存せず内容が決まるため`generateStaticParams`によるビルド時事前生成のままで問題ない。ランキングのトップページ（`/`）だけが真にリクエスト依存でSSRを要する。
- デプロイ設定（ビルドコマンド・`wrangler` 設定等）が変わる。`docs/ranking/project-foundation/design.md`の記載を更新する必要がある。
- **移行実装前に、Free planのCPU時間10ms上限に実際のフィルタ+レンダリングが収まるかを実測で確認する。** 収まらない場合はWorkers Paid（月5ドル、CPU時間の上限が大幅に緩和される）への移行を検討する。収益化前に固定費が発生する判断になるため、実測結果を見てから決める。

**2026-08-17追記（本番デプロイ後の実測）**: ダッシュボードのCPU時間中央値は235ms前後だったが、エラー（`Error 1102`等）は一件も発生していない。ローカルの同一ビルドでの実測（`next start`・`wrangler dev`ともにウォームアップ後18〜35ms）との乖離から、235msの大半はコールドスタート（isolate起動）由来と推定している（Cloudflareはisolate起動用CPU予算をリクエスト単体の10ms上限とは別枠で確保しており、200ms→400msに引き上げられている）。Free planのままで様子を見る判断とした。詳細は`docs/ranking/ssr-migration/design.md`の「本番デプロイ後のCPU時間の実測」参照。合わせて、`Cache-Control`ヘッダーだけでは自動キャッシュされず`wrangler.jsonc`に`cache.enabled: true`の明示が必要だったことも判明した（同ドキュメント参照）。
- 実装は本ADR承認後、専用のUnitとして`plan.md`/`design.md`を書いてから進める。既存のU0〜U5の成果物（`useRankingState`のロジック、`buildRankedCompanies`、フィルタ・検索の純粋関数群）はサーバーコンポーネント側でそのまま再利用できる想定。

## 却下案

**PPRを使う** — 前述のとおり、遅い動的部分が存在しないためストリーミングの効果がない。Suspense境界・postponed stateの複雑さだけが増える。

**静的exportのまま、フィルタ済みURLごとに事前生成する（全組み合わせSSG）** — 年齢8×業種34×従業員規模4×在籍年数4×平均年齢4 ≒ 17,408通りにもなり、Cloudflareの1デプロイあたりファイル数上限（2万）に対し、Bolt 2で計画済みの企業詳細1,867ページ・業種33ページ・年齢別8ページと合算すると現実的に厳しい。加えて自由入力の検索語（`q`）は原理的に列挙不可能で、この方式ではそもそもカバーできない。

**クライアント側のチラつき対策だけで済ませる（`useLayoutEffect`修正のみ、PR #36）** — 見た目のチラつきは緩和できるが、検索エンジンのクローラーがJS実行前に見るHTMLの中身は常にビルド時の初期値のままで、フィルタ済みURLのSEOという目的そのものを達成できない。
