# CLAUDE.md

年齢補正した年収ランキングを公開する静的サイト。AI-DLC に沿って開発する。

AI-DLC のフェーズ定義・ドキュメント種別（spec / overview / plan / design の違い）・承認ゲートは `docs/AI-DLC実践リファレンス_v10.pdf` が正。plan.md や design.md を書く前、Unit に着手する前は必ずこれを読み、記載されている型に従う。

**PDF はテキスト抽出できる。** `npm run pdftext -- docs/AI-DLC実践リファレンス_v10.pdf [開始頁] [終了頁]`（全13頁。**型の定義は p.13**、スコープ構造は p.3、実践例は p.7〜8）。**素の正規表現でパースしようとしない**——このPDFはフォントがサブセット化されており、ToUnicode を自前で辿ると文字化けする（実際に一度やって読めなかった）。`tools/pdftext.mjs`。

### 型の要点（PDF p.13 の表そのまま。迷ったら PDF を読む）

| ファイル | 単位 | 役割 | 書くこと | 書かないこと |
| --- | --- | --- | --- | --- |
| `spec.md` | Intentに1つ | 仕様 | 何を作るか（WHAT）・なぜ（WHY）・受け入れ基準 | 実装方法（How） |
| `overview.md` | 施策に1つ | 分解マップ | Unit一覧・依存・実施順序・共有コンポーネント | Unitの中身 |
| `plan.md` | Unitに1つ | 実行プラン | **着手前の段取り。作業手順と検証の順序（動詞的）** | 使用技術（→ADR）・クラス構造やファイル一覧（→design） |
| `design.md` | Unitに1つ | 設計 | **出来上がりの内部構造（名詞的）。コンポーネント・データモデル・API・シーケンス・ディレクトリ構成** | 施策を跨ぐ決定（→ADR） |

**plan.md は動詞、design.md は名詞。** plan に「変更するファイル一覧」を書くと design の仕事を先取りすることになる。

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
| Unit の起票からマージまでの手順 | この CLAUDE.md の「Unit の起票（着手前）」「Unit完了後の運用」／`.github/ISSUE_TEMPLATE/`・`.github/pull_request_template.md` |

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

## Unit の起票（着手前）

**1 Unit = 1 Issue = 原則1 PR = `docs/<施策>/<unit>/` の plan.md・design.md。** AI-DLC リファレンスのスコープ構造どおり、**Issue が Unit の正**（契約書）で、完了条件はそこにある。

着手の順序は次のとおり。

1. **`docs/<施策>/overview.md` の Unit 一覧に載っていない Unit は着手しない。** 先に overview.md に行を足す（ID・依存・対応する受け入れ基準・共有コンポーネントに触るか）。ID は施策ごとの連番（ranking は `U`、company は `C`）。
2. **Issue を立てる。** タイトルは `[Unit] <ID> <名前>`、ラベルは `unit` と `bolt-N`。テンプレは `.github/ISSUE_TEMPLATE/unit.md` で、**参照（spec の節・ADR）／依存／完了条件／非対象は必須**。完了条件は spec.md の受け入れ基準に対応させ、チェックできる形で書く。
3. **その Issue 番号を持って plan.md を書き、着手する。** plan.md・design.md の冒頭から Issue を参照する（Issue → spec → ADR がリンクで辿れる状態にする）。

Unit にしないもの——1コミットで終わる修正・ドキュメントのみの変更・依存更新——は Issue 無しで進めてよい。その場合は PR 本文の「対応 Issue」に理由を1行書く。**plan.md や design.md を書きたくなった時点でそれは Unit なので、先に Issue を立てる。**

まだ Unit に割れていない要望・課題は `.github/ISSUE_TEMPLATE/idea.md`（`【親】` 始まり、ラベル無し）で起票し、割った時点で `[Unit]` Issue を子として立てて親をリンクする。

**進めながら分かったことは Issue のコメントに書かない**（`docs/` の外に「AI が読めない決定」を作らないため）。行き先は決定の性質で分ける。

- **施策を跨ぐ／不可逆な決定** → `docs/adr/NNNN-*.md`
- **Unit の内部構造に関する決定** → その Unit の `design.md`。**決定の経緯を並べるのではなく、決まった構造として書く**（型は PDF p.13 が正）。選択の理由は構造の説明に添える短い根拠に留め、長い比較検討が要るなら ADR に切り出す
- **spec の受け入れ基準に関わる発見** → `spec.md` を改訂する

## Unit完了後の運用

Unit の実装を終えたら、次の順で進める。

1. **動作チェック**: ビルドとテストを実行する。見た目・機能に変更があるUnitは「開発上の約束」のとおりUnitテスト・E2Eテストを書いたうえで、UIを持つUnitはさらに dev server を起動して実際にブラウザで機能を触って確認する（型チェック・テストが通ることはコードの正しさの保証であって、機能の正しさの保証ではない）。**ブラウザ操作ツールがそのセッションで使えない場合は、E2Eテストの実行結果で代替してよい。** `package.json` に変更があるなら `package-lock.json` が更新・ステージされているかもここで確認する（「開発上の約束」参照）。
2. 対応する Issue に紐づけた PR を作成する（`Closes #<番号>`）。本文は `.github/pull_request_template.md` の節をそのまま埋める（動作チェックの結果と docs の更新をここで突き合わせる）。
3. **動作チェックに問題がなければ、承認を待たずにマージしてよい。** 問題が見つかった場合はマージせず、内容を報告する。

この許可は Unit の実装フロー（ビルド・テスト・PR・マージ）に限る。破壊的な操作（force push・履歴の書き換え等）や、この運用の対象外の判断が要る場面は都度確認する。

## 現在地

**Bolt 1（MVP: ランキング1ページ＋計算方法ページ）の全Unit U0〜U7が実装済み。** U0（データ変換パイプライン、`docs/ranking/data-pipeline/`、Issue #1）・U1（プロジェクト基盤とデザイントークン、`docs/ranking/project-foundation/`、Issue #2）・U2（ランキング表と年齢スイッチ、`docs/ranking/ranking-table/`、Issue #3）・U3（フィルタ4種、`docs/ranking/ranking-filters/`、Issue #4）・U4（フリーワード検索、`docs/ranking/free-word-search/`、Issue #5）・U5（URLクエリとの同期、`docs/ranking/url-sync/`、Issue #6）・U6（0件・端の状態とページネーション、`docs/ranking/ranking-pagination/`、Issue #7）・U7（計算方法ページ`/about`、`docs/ranking/about-page/`、Issue #8）。

**Cloudflare Workers への自動デプロイは接続済み・稼働中**（https://nenshu.fkmks-247.workers.dev/ ）。`output:'export'`をやめ`@opennextjs/cloudflare`でフルSSRしている（ADR-0004）。`/`は`searchParams`を読むので`ƒ (Dynamic)`、`/about`は`○ (Static)`。SSR成果物はエッジでキャッシュ（`wrangler.jsonc`の`cache.enabled: true`＋`next.config.ts`の`headers()`）、`_next/static/*`はWorkerを経由しないため`public/_headers`で設定している。デプロイ設定は`docs/ranking/project-foundation/design.md`参照。

**アクセス解析は Microsoft Clarity**（Issue #44）。`web/lib/analytics/clarity.ts` にタグを置き、`app/layout.tsx` から `next/script` の `strategy="afterInteractive"` で読む。npmパッケージは使わない（同じタグを注入するだけでJSバンドルが増えるため）。**本番ビルドでのみ有効**（`isClarityEnabled`）——開発サーバーとE2Eの実行ぶんが実セッションとして計測に混ざるのを防ぐため、またE2Eの「操作中にネットワークリクエストが発生しない」テスト（リクエスト数を0で固定）を壊さないため。

年齢・4フィルタ・検索語・ページ番号は`?age=&ind=&emp=&ten=&aage=&q=&page=`としてURLに同期済み（`page`は1始まり、既定値は省略）。

**推定式はADR-0005の2点モデル**（`web/features/ranking/lib/salary.ts`）。目標年齢が平均年齢より下では、その会社の賃金カーブが「22歳＝業種平均の水準」と「平均年齢＝実測の平均年間給与」の2点を通ると置いて間を業種カーブの形で結ぶ。平均年齢より上はADR-0003の倍率一定のまま。Issue #42（若年側の過大推定）はこれで解消した（キーエンス25歳 1,642万→788万）。**カーブは`curves.json`に千円で入っているので、`curveValuesInYen`で円に揃えてから`estimateSalary`に渡すこと**——旧式は比しか取らないので揃えなくても合っていた。経緯と却下案（標準労働者カーブは効果が小さく60歳側が悪化する）は`docs/ranking/estimation-model/design.md`とADR-0005にある。

**Python側（`pipeline/salary35/curves.py`の`estimate_salary`）も同じ式で、CSVの`salary35`列はこれで計算してある。** 両者が一致することは`pipeline/scripts/build-data.test.ts`がweb の`estimateSalary`を直接importして全1,867社で固定している。**推定式を変えたらPython・TypeScriptの両方を直し、`cd pipeline/salary35 && python3 unified.py --from-csv ../data/ranking_unified_2026.csv` でCSVの派生列を作り直してから`npm run build:data -- --out ../web/public/data`を回すこと**（EDINETから取り直す必要は無い）。Pythonの`round()`は偶数丸めでJSの`Math.round`と違うので、Python側は`floor(x+0.5)`を使う。

**Bolt 2 に着手中（企業詳細ページと公開URL戦略）。Inceptionは完了。**

**既定の表示基準は「実測値」＝有報の平均年間給与そのまま（ADR-0007・U11・Issue #71）。** 年齢補正は「年齢そろえ」として読者が明示的に選ぶモードになった。ランキングと企業詳細の両方に同じ2モードがある。

- **モードは `age` の有無で表す。`basis` のようなパラメータは無い。** `/` = 実測値、`/?age=35` = 年齢そろえ。状態は `RankingState.targetAge: TargetAge | null` の1つの値で持ち、`null` が実測値。分けると「実測値なのに年齢がある」矛盾した状態が表現できてしまうため
- **年齢そろえなら35歳でも `age=35` を出す。** 35歳を既定として省略していた頃とは違う——省くと実測値のURLと区別が付かない
- **`stats.json` の `population`/`rankAll`/`rankIndustry` は `bases = [null, 25, 30, ..., 60]` の9列**（先頭が実測値）。**行がずれると別の会社、列がずれると別の表示基準の順位を出す。** `view.ts` は `stats.bases` を回して並びの正を1か所に寄せている
- **母集団は基準ごとに別物。** 実測値は平均719万円・標準偏差200万円、35歳そろえは629万円・155万円。キーエンスは平均年齢がちょうど35.0歳なので金額は両モードで同じ2,178万円だが、偏差値は122.9と150.0で違う
- **実測値では「推定」の語を1つも出さない**（バッジも断り書きも）。有報そのままの数字に推定の体裁を被せない
- 実測値のとき年齢スイッチは**消さずに `disabled` にする**——消すと切り替えて何が増えるのか分からないため
- 経緯と実測値は `docs/ranking/salary-basis/design.md` と ADR-0007 にある

**サイト名は OpenReport**（`docs/site-chrome/spec.md` 1、Issue #68）。**ドメインは `openreport.net` が最有力だが未取得**（2026-08-20 時点）——U8 の canonical・sitemap の基点になるので、決まるまで `metadataBase` は1か所に閉じておく。ページタイトルは `/` が `OpenReport | 年収ランキング`、`/about` が `計算方法 | OpenReport`。**`/` の `h1` は「年齢補正年収ランキング」のまま**——ブランドは共通ヘッダが持ち、`h1` はページの内容を表す。

**サイト共通の外装は `site-chrome` 施策**（`docs/site-chrome/`）。全ページ共通ヘッダ（`features/navigation/components/SiteHeader.tsx`）と、ライト/ダークの切替（`features/theme/`）がここに属する。

- **表示モードは `<html>` のクラスが正で、サーバーには一切送らない。** SSRの出力はエッジで24時間キャッシュされる（`next.config.ts` の `s-maxage=86400`）ため、HTMLに焼くとある読者の選択が他の読者に配られる
- **FOUC は `<body>` 先頭の素の `<script>` で殺している。`next/script` は使わない**——strategy はどれも「描画をブロックしない」ことが目的で、ここで欲しい「ブロックしてでも先に走る」と逆になる。E2E は `waitUntil: "domcontentloaded"` の時点で class を見ることで、ハイドレーション後に付いた場合を弾いている
- **モードによる描き分けは JS でやらない。** アイコンも読み上げ名も両方をHTMLに出し、`dark:` バリアントで見せ分ける。以前はモードをJSで読んでサーバー側ではアイコンを出さない実装にしており、**ボタンが約86ms 空のまま残ってからアイコンが現れる**ちらつきになっていた（実測）。`e2e/theme.spec.ts` が生のHTTPレスポンスに両アイコンが入っていることで固定している
- **`--primary` はライトとダークで別の値。** ライトをそのままダーク背景に置くと 2.72:1 で AA を割る（実際に割っていた）。`tokens.test.ts` のコントラストテストは**両モードで回す**（`:root` だけ見ていたのがこの見逃しの原因）

**`/age/[age]`・`/industry/[industry]` は作らない（ADR-0006・Issue #49）。** ADR-0004でフルSSRになった時点で「パスにしなければクロールできない」前提が消え、Googleのファセットナビゲーション指針もパスとクエリを区別しない。年齢8件・業種33件は `?age=`・`?ind=` のまま自己canonical＋sitemap登録にし、他の組み合わせ・`q`・`page` は正規URLへ寄せる。実装はU8（Issue #53）。

**企業ページのIDは 証券コード（1,760社）／EDINETコード（107社）**（ADR-0006）。現行の書類ID由来のIDは毎年の有報提出で変わり、URLが年1回リセットされてしまうため。`edinet_code` 列は将来の10年推移でも名寄せキーになる。実装はC0（Issue #51）。

**企業詳細ページ `/company/[id]` の施策は `docs/company/`** （product.mdの施策マップで `ranking` とは別施策）。v1は手持ちデータで作れる5項目（平均年収・年収偏差値・全体順位・業界内順位・年齢別チャート）。C1（Issue #52）で実装済み。

- **順位・偏差値の母集団統計は `stats.json` にビルド時に確定させてある**（`pipeline/scripts/build-data.ts` の `buildStats`）。Workers FreeのCPU 10ms/リクエスト制約があるため、リクエストごとに1,867社×8年齢（約15,000回の補間）を回さない。リクエスト時の計算は当該1社ぶんの8年齢＝16回だけ。`/` は `stats.json` を読まないのでトップページのペイロードは増えない
- `rankAll` / `rankIndustry` は `companies.rows` **と同じ並びの配列**。IDをキーにした辞書にしていない。**行がずれると別の会社の順位を出すので、`companies` と同じループで作ること**
- **年齢別チャートは依存を足さずインラインSVG**（`features/company/components/SalaryCurveChart.tsx`）。rechartsは使わない。縦軸は0起点にせず、代わりに各点の金額を数値で併記している
- **`AgeSwitch` は `design-system/` に昇格させず `features/ranking/` から import している。** `TargetAge`/`TARGET_AGES` というドメイン語彙に依存しており、design-systemに持ち込むと語彙か型が二重になるため。`TargetAge`・`estimateSalary`・`format` が本来「年収ドメイン」の共有物である点は既知の負債（`docs/company/company-page/design.md`）
- ランキングの会社名は `<Link href="/company/{id}">`。ページ間遷移なので `<Link>` でよい（上の規約どおり）。**ただし `prefetch={false}` を必ず付ける**——既定だとビューポートに入った時点でRSCペイロードを取りに行き、1ページ100社ぶんで**本番のトップページ表示だけで34件のリクエストが飛んだ**（実測。修正後は0件）。全ルートが動的レンダリングなので、そのぶんWorkerが起動する
- **プリフェッチは本番ビルドでしか動かないので、devサーバーに対して走るE2Eでは検出できない。** `npm run measure:prefetch`（`web/scripts/measure-prefetch.mjs`）で `npm run build && npx next start -p 3211` に対して測る。動的ルートへの `<Link>` を増やしたときはこれを回すこと
- **ページ間の遷移は `next/link` を直接使わず `features/navigation/components/NavLink` を使う。** プリフェッチを切った代償で、クリックからRSCペイロードが届くまでの待ちが体感に出る（「一瞬もたつく」）。Next.js公式の `useLinkStatus()` で待ちを拾い、画面上端に細いプログレスバーを出している（`features/navigation/`、`app/layout.tsx` の `<NavProgressBar />`）。`next/link` の直接importは `eslint.config.mjs` の `no-restricted-imports` で止めている（例外は `NavLink.tsx` 自身だけ）——`<Link>` のままでも型もテストも通り、そのリンクだけバーが出ないことに気づけないため。**`nextjs-toploader` 系のライブラリは使わない**——この用途のライブラリは軒並み更新が止まっており（2026-08時点で最新の `holy-loader` でも9か月前）、いずれも `history.pushState` を差し替えるので、`pushState` を直接呼んでURL同期している当サイトとは相性が悪い
- **`loading.tsx` は置かない。効かないため。** `loading.js` のフォールバックはプリフェッチで先に配られて初めて効く仕組みで、`prefetch={false}` では配達自体が起きない。RSCの到着を2.5秒遅らせて実測してもスケルトンは一度も出なかった（`docs/company/company-page/design.md`）

**年収偏差値は100を超える。** 35歳時点のキーエンスで150.0（全体平均629万・標準偏差155万に対して2,178万）。年収分布が右に強く裾を引くためで、対数変換しても107.4。**必ず「上位◯%」を隣に併記し、100を超えうる理由を注記する**（glossary参照）。

順序: C0（#51）→ C1（#52）→ U11（#71）→ **U12（#80）** → **C2（#83）** → U8（#53）。**U8 のリンクハブは U12 の業種チップで賄えたので、U8 の範囲は canonical・sitemap・robots に狭めた**（`docs/ranking/overview.md`）。

**Issue #21（UI改善・Claude Design の `改善案.dc.html`）に着手中。** アートボード 5a/5b/5c（実測値モード）は U11、4a/2a/5c（レイアウト刷新）は **U12（Issue #80）で実装済み**。残りは、**C2（Issue #83）も実装済みで、Issue #21 のアートボードは全て実装した**（T0・T1 も込み）。計画は `~/.claude/plans/tingly-sleeping-puppy.md`。

**ただし Issue #84: 見た目がモックとズレている。** U11・U12・C2 は `改善案.dc.html` を**直接読まずに**実装した——MCP `claude_design` がそのセッションで繋がっておらず、計画に書き起こした仕様から組んだため。**`claude mcp add` は済ませてあるので、次のセッションからはモックを読める**（MCPのツールはセッション開始時にしか登録されない）。合わせ直しは #84 で行う。

**ランキングは U12（`docs/ranking/ranking-refresh/`、Issue #80）でレイアウトを刷新済み。**

- **並び替え3種**（年収が高い順＝既定／平均年齢が若い順／従業員数が多い順）を `?sort=` で同期。**並び替えても順位の列は振り直さない**——順位は「金額で何位か」の意味なので、平均年齢順に並べたら `1,204位 / 87位 / …` と飛ぶのが正しい
- **順位は2つある。** `rank`（絞り込み後・1から振り直す）と `populationRank`（全1,867社の中）。**偏差値の隣の「上位◯%」は後者から出す**——海運業7社に絞ったときの `rank` を分子にすると1位が「上位14%」になる
- **偏差値は単独で出さない**（glossary）。表・カードとも上位◯%を併記している
- **`/` は `stats.json` から母集団統計（`count`/`bases`/`population`）だけを抜いて渡す。** `rankAll`/`rankIndustry` は1,867×9の配列2本で、クライアントに直列化するとページの予算を超える。抜いた結果は1KB未満（`population.test.ts` が固定）
- **業種チップ33件は `<a href="/?ind=…">` の実体を持つが、左クリックは横取りして状態更新にする。** 実体はクロール経路（ADR-0006 で `/industry/[x]` を作らないと決めたため）、横取りはAC-7（操作でネットワークを起こさない）のため。修飾キー付きはブラウザに任せる。**これで U8 のリンクハブは不要になった**
- **検索は共通ヘッダに移した**（`features/navigation/components/HeaderSearch.tsx`）。ヘッダは `RankingApp` の祖先ではなく兄弟なので、URLを経路にして `pushState` ＋ `RANKING_STATE_CHANGED_EVENT` で届ける。`/` 以外では素の `<form action="/">` として遷移する
- **`ToggleGroup` の既定は折り返さない**（`w-fit flex-row`）。216pxのサイドバーで3択がはみ出し、本文の表に重なってクリックが吸われた。表は `table-fixed` にしないと社名の列が枠を超える（978px / 枠752px）。どちらもE2Eが検出した
- **トップページの HTML は gzip 66.5KB → 72.2KB になった**（+8.7%）。増えたのは行あたりの情報量と業種チップで、母集団統計は1KB未満

**年収バーは「そのページの1位を100%」で正規化する**（デザイン案の「上限2,500万円」は採らない）。ページ・フィルタ・並び替え・**表示基準**が変わるたびに基準が変わるので、最大値は `rankedCompanies`（ページ切り出し済み）から導く（`pageMaxSalary`）。全体平均の縦線はページ最大を超える場合は描かない。**表示基準の切替で棒だけ元の縮尺で残るのが一番気づきにくい壊れ方**なので、単体・E2Eの両方で固定してある。

**平均年収の10年推移は `timeseries` 施策**（`docs/timeseries/`）。T0（Issue #74）で `web/public/data/history.json`（1,867社×10年・gzip 65.6KB）を出し、表示（T1）は C2（#83）に同梱して実装済み。

**企業詳細ページは C2（`docs/company/company-refresh/`、Issue #83）で刷新済み。**

- **このページで最も取り違えやすいのは「表示基準ごとに変わるもの」と「独立なもの」の境界。** 金額・順位・偏差値・中位・ヒストグラム・近傍5社・要点は基準ごとに変わり、**10年推移だけは常に実測値**。型で分けてある——推移は `byBasis` の中ではなく `CompanyView` の外の `SalaryHistory` として別の prop で渡す（`byBasis` に置くと「年齢そろえにしたら過去の有報の数字が変わる」を作れてしまう）
- **ヒストグラムの階級は表示基準ごとに決め直す。** 25歳そろえは249〜788万円、実測値は332〜2,178万円で、同じ区切りだと片方は9ビンのうち7つが空になる。幅は「2〜95パーセンタイルが9ビンに収まる最小の丸い数字」、**両端のビンは外側を吸収**する（等間隔で最大まで並べると9割が最初の2ビンに潰れる）
- **位置バーは順位から出す。金額の絶対値からではない**——線形に当てると上位1社の外れ値で帯の9割が空く
- **「水準が近い会社」だけはリクエスト時に算出する**（`findNeighbors`）。ビルド時に持つと 1,867×9×5 の表になる。1業種は最大173社で実測 0.05ms/基準。**9基準ぶんをサーバーでまとめて出して渡す**——クライアントで出すには `companies.json` 全件が要る
- **要点の箇条書きは数値から機械的に導ける事実だけ。** 「若い／長い／大きい」の判定は**ランキングのフィルタと同じ三分位**を使う（別の線で書くと読者が混乱する）。該当しない項目は出さない
- **推定範囲 ±20% は「統計的な信頼区間ではない」と3か所に書く**（表の caption・チャートの figcaption・`/about`）。**帯だけを見ると信頼区間に見える**ので図の側の断りを省けない
- `/company/[id]` の HTML は gzip 8,250 B → **12,873 B**。`/` は変わっていない（`history.json` を `app/page.tsx` から import しないため）

- **EDINET の流量制限は HTTP 200 で来る。** 本文が `{"StatusCode":"429",…}` の JSON になるだけなので `urlopen` は例外を投げない。**中身を検めずに書くと50バイトのエラーJSONが `.zip` としてキャッシュに残り、取得側は成功と数える**（初回は17,719件中5,195件がこれだった）。`edinet.fetch_csv` は先頭が `PK` であることを確かめる。並列は3まで。**書類一覧（`list_documents`）も同じで、こちらは応答がJSONなので `json.loads` が通ってしまう**——`_list_status` が `metadata.status` まで見る（429の本文には `metadata` が無い。`404` は未来日・保持期間外の正しい答えなのでそのまま置く）
- **2019年に開示のタグ付けが変わっている。** それ以前は平均年間給与のXBRL要素そのものが無く、2017・2018年は全社を「従業員の状況」本文から拾う（`textblock.py`）。抽出率は2017年で95.7%
- **同じ表の読み方が割れることがあり、1書類の中では決められない。** `4,17934.09.924,320,256` は「勤続9.9／2,432万」とも「勤続9.92／432万」とも読め、キーエンス2017とコメリ2017で正解が逆になる。`history.resolve_candidates` が2019年以降のタグ由来の値を基準に年をまたいで選び直す
- **取得の窓は暦年ぜんぶ。** 6/1〜7/10 に限ると、COVID期の提出期限延長で2020年の96社を取り逃がす
- **キャッシュ（`pipeline/salary35/cache/`・1.4GB）は gitignore 済み。** 再取得は `warm_lists.py` → `fetch_history.py` → `history.py` の順。年1回、その年ぶんだけ足せばよい

**未解決の課題:**

- **Issue #22: 掲載企業数を増やす際のペイロード。** 全件embedアーキテクチャは1,867社で**トップページのHTMLがgzip後64KB**（実測、raw 603KB）。`build:data` が見ている100KB予算は `companies.json` 単体（gzip 44KB）のことなので、**先に効くのはページ側の64KB**。4,000社規模では超過見込み。企業詳細ページは1社ぶんしか送らないので、この問題を悪化させない。
- **Issue #55: 株価・信用格付け。** J-Quants・edinetdb.jp からの調達可否を確認するところから。**再配布可否の判断は運営者が行う**（product.mdの制約に明記）。

`web/`にPlaywright E2E（`npm run test:e2e`）を導入済み。ブラウザ操作ツールが使えないセッションでの動作チェックはこれで代替できる（`docs/ranking/ranking-filters/design.md` 参照）。見た目・機能の変更にはUnitテストとE2Eの両方を書く運用（「開発上の約束」参照）。
