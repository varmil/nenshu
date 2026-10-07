# 現在地: 共通ヘッダ・ロゴ・決算期・OGP・検索エンジン向けの出力

> CLAUDE.md の「現在地」節から移した（2026-10-07・トークン消費の削減。移しただけで、本文は1字も書き換えていない）。
> 文中の「上の」「下の」は、CLAUDE.md の「現在地」に並んでいた当時の位置を指す。対応する項は `docs/status/` のどれかにある（索引は CLAUDE.md）。
> **新しく分かったことはここに書く。CLAUDE.md には書かない**（CLAUDE.md は全セッション・全サブエージェントが毎回読むので、伸ばすとそのまま消費量になる）。

**サイト名は OpenReport**（`docs/site-chrome/spec.md` 1、Issue #68）。**ドメインは `openreport.net`**（2026-08-21 取得）。canonical・sitemap の基点は `web/lib/seo/site.ts` の `SITE_ORIGIN` 1か所だけで、他の場所にオリジンを書かない。ページタイトルは `/` が `OpenReport | 有価証券報告書ベースの平均年収ランキング {社数}社【{決算期}】`、`/about` が `計算方法 | OpenReport`。**ランキングの `h1` にブランドは入れない**——ブランドは共通ヘッダが持ち、`h1` はページの内容を表す。`/` は `平均年収ランキング`、ファセットは **title からブランドを除いた形**（`/?ind=X` は `Xの平均年収ランキング`。**`/?age=N` は専用の title を持たない**——2026-10-03 から canonical が `/` なので `/` の title になる。見出しは `N歳年収ランキング` のまま）で、見出しは `lib/seo/ranking.ts` の `rankingHeading` から出す。**見出しは画面の状態を、title は寄せ先を表す**——`?age=35&ind=銀行業` の見出しは `銀行業の35歳年収ランキング`、title は寄せ先の `銀行業の平均年収ランキング`。業種つきの見出しは 390px の1行に収まらないので、`break-keep` と `<wbr>` で「◯◯の」の後ろでだけ折り返す（何もしないと `…ランキン` / `グ` で切れる）。**直下のリード文の社数も見出しと同じ範囲**（`…で比べた銀行業の82社。`・`features/ranking/lib/lead.ts`）。**リード文はどちらの表示基準でも1文目に「有価証券報告書」を入れる**（年齢そろえは以前 PC だけの2文目に置いていて、モバイルに出ていなかった）。**E2E で行数を数えるときにブロック要素の `getClientRects()` を使わない**——折り返しても1つしか返らず、検査が空振りする（`e2e/ranking-refresh.spec.ts` の `renderedLines` で字ごとに数える）。

**サイト共通の外装は `site-chrome` 施策**（`docs/site-chrome/`）。全ページ共通ヘッダ（`features/navigation/components/SiteHeader.tsx`）と、ライト/ダークの切替（`features/theme/`）がここに属する。

**サイトのロゴとファビコンは S4（`docs/site-chrome/site-logo/`、Issue #163）で実装した。** それまで公開されていたのは `create-next-app` の既定（黒い円に白い三角。`web/app/favicon.ico` が雛形のまま 25,931 バイト）だった。意匠は Claude Design の `OpenReport Logo & Favicon.dc.html`。**「サイトロゴ」と「企業ロゴ」（`logo` 施策）は別物**なので、docs でも書き分ける。

- **図形の定義は `pipeline/brand/symbol.ts` の1か所。** ファビコン（SVG）・PNGのフォールバック・アプリアイコン・`favicon.ico` は全部そこから焼く（`cd pipeline && npm run build:brand`）。**`web/` に `sharp` を足さない**——optionalDependencies の解決差で Cloudflare の `npm ci` だけが落ちる事故が2回起きている
- **hex を書いてよいのは `web/lib/brand/colors.ts` だけ**（`eslint.config.mjs` の例外もここ1つ）。デザイン案の `#007595` / `#00b8db` は `tokens.css` の `--primary`（`:root` / `.dark`）と一致する。`colors.test.ts` がその一致を固定しているので、**トークンを差し替えたらここが落ちる**。要るのは CSS 変数が届かない成果物のため——ファビコンはページのCSSを読まず、`theme_color` はCSS変数を受け付けない
- **パスと寸法の正は `web/lib/brand/assets.ts`。** 生成スクリプト・`src/layouts/Base.astro`・生成物のテスト・`e2e/network.ts` の4か所が同じ表を見る
- **成果物は `public/` の静的アセットにする。`app/icon.svg` のような規約ファイルにしない**——ルートハンドラになり、アイコン1枚ごとに Worker が起きる（Workers Free の CPU 10ms/リクエスト制約・Issue #118）
- **濃色サーフェスの切り替えは SVG の中のメディアクエリで行う。** `<link rel="icon" media="...">` はブラウザの対応が揃っていない。**`sharp`（librsvg）はメディアクエリを評価しない**ので、PNG に焼くのは分岐を持たないほうの SVG
- **ホーム画面のアイコンは `flatten` でアルファチャンネルごと落とす。** 透過で渡すと iOS が黒で埋める。落としてあれば PNG のカラータイプ1バイトで検証できる（透過は 6・不透明は 2）
- **`/favicon.ico` は置くが `<link>` には出さない。** 出すと SVG より先に選ぶブラウザがあり、切り替えを持たないほうが使われる。置くのはページを読まずに固定パスを叩く相手（RSSリーダー等）のため。**`sharp` は ICO を書けない**ので器は `pipeline/brand/ico.ts` で組む（中身は PNG）
- **ヘッダのワードマークは文字のまま**で、色だけ `--primary` にした。画像にすると選択・検索・拡大のどれでも劣り、`BrandLink` の「絞り込みを解く」振る舞いも変わらない
- **`e2e/network.ts` の除外を `/favicon.ico` 決め打ちから `assets.ts` の表に広げた。** ファビコンのリクエストは `resourceType()` が `image` にならないことがあり、既存の画像の除外に掛からない
- `/` の HTML は raw 373,821 B → **374,617 B**（gzip 63,665 → 63,855 B）。`/company/[id]` も同じ +796 B（共通ヘッダと `<head>` の変更なので全ページに同じだけ効く）

**データの時点は「決算期」で出す**（site-chrome の S3・Issue #134・親 #104）。**`2026年3月期` を直書きしない。** 値は `companies.meta.fiscalPeriod`（`build-data.ts` が CSV の `period_end` の最頻を採る）で、文字列にするのは `web/lib/data/period.ts` の1か所だけ。社数（`meta.count`）と同じ扱い。

- **「2026年度」とは書かない。** 2026年3月期は年度でいえば2025年度で、読者によって1年ずれる。親 Issue のタイトルの語をそのまま使わない判断（`docs/site-chrome/data-period/design.md`）
- **出すのは `/` の title の末尾（社数の隣）と、全ページの description、`/`・`/company/[id]`・`/about` の画面。** title の前に置かない——差別化要因の「有価証券報告書」がSERPで見える位置から押し出される。ファセット（`?age=N`・`?ind=X`）の title には入れない
- **`/` のリード文は1文目に置く。** 2文目は `hidden md:inline` で狭い画面では消えるので、そこへ回すとモバイルの読者にだけ時点が届かない（モバイルでは1行→2行になった）
- **1画面に1回**（Issue #128 の「推定」と同じ扱い）。企業詳細は「年収に関するQ&A」の説明の1行の先頭（`2026年3月期の有価証券報告書の値です。…`。C16 までは `有価証券報告書の実測値（2026年3月期）` の見出し）に置き、フッタの出典には重ねない。**例外は、自分の原文の時点を示す節の説明だけ**——有報の要約の節（2026-09-24・spec 5.1 を改めた）と給与の決定方針の節（2026-09-30）。**C16 で Q&A が要約の直後に来て隣り合う節の先頭になったが、節ごとに1回のまま**（どれも自分の節の中身の時点を言っている）。**説明文（C7）の出典の1行には入れない**（`e2e/data-period.spec.ts` が企業詳細で、給与の決定方針のある会社は3回・無い会社は2回であることを固定している）。**要約の節が名乗るのは要約の原文の決算期、給与の決定方針の節が名乗るのは原文を切り出した有報の期**（refresh の D3。数字の期とそろっていてもずれていても出す。下の「refresh」の項）
- 決算期は全社が同じではない（3月期1,865社・4月期2社）。**「3月期が中心」と断るのは `/about` の「対象範囲」だけ**
- 代表の決算期が過半に届かなければ `build-data.ts` が落ちる。1つで代表できないデータを黙って公開しない

**OGPと構造化データは S2（`docs/site-chrome/social-preview/`、Issue #116）で実装済み。** `og:` の入口は `src/components/PageHead.astro` の1か所だけ（F1 までは `toMetadata()`）。

- **`og:title`・`og:description`・`og:url` は `<title>`・description・canonical と**同じ値から出す**（AC-11・AC-12）。だから新しい文言は1つも増えていない。**`og:url` を別の場所で組み立てない**——`/?age=35&ind=銀行業` のような非正規URLで canonical だけが寄せ先を指し `og:url` が自分自身を指す食い違いが起きる
- **`/about` の文言は `lib/seo/about.ts` にある。** S2 の時点でそこだけページが素の `Metadata` を直書きしていて共通の出口を通っていなかったので移した（文言は1文字も変えていない）
- **404 の canonical は `/` を指す。** 404 に正規URLは無いので、`Astro.url` を書くと存在しないURLを自分で申告することになる（`src/pages/404.astro`）。Next.js の頃は「レイアウトの `openGraph` が出るのは `/_not-found` だけ」という形で同じ問題があった
- **出すのは `twitter:card` だけ。** Next.js は `twitter:title` 等も自動で埋めていたが、X は `og:` も読むので同じ文言を2組持つ理由が無い（F1 で並ばなくなった。`e2e/social.spec.ts` が見ているのも `twitter:card` だけ）
- **クライアント（`usePageMeta`）も `og:title`・`og:description`・`og:url` を書き換える。** SNS のクローラは JS を実行しないのでカードの見え方は変わらないが、DOM の上で canonical と `og:url` が食い違う状態を作らないため
- **OG画像は全ページ共通の静的1枚**（`web/public/og.png`・1200×630）。中身はシンボル＋ワードマーク、見出し2行、横罫、数値の帯（対象社数・全体平均・対象期間と出典）。**公開ホスト（`openreport.net`）は載せない**——貼られたカードにはURLが別枠で出るので、絵の中の1行は情報を足さないまま広告の体裁だけを持ち込む（初版には入れていて、運営者の指摘で外した）。**文字はアウトラインで持つ**（`pipeline/brand/lettering.ts`。吐く道具は `pipeline/brand/outline.py` で、ふだんは回さない）——`sharp`（librsvg）の `<text>` は実行環境の fontconfig を引くので、日本語フォントの無い機械で焼くと**豆腐が並ぶのに寸法もバイト数もカラータイプも正しいまま**テストを通る。シンボルは `pipeline/brand/symbol.ts` の `symbolMark()` から取る（図形の定義は1か所のまま）
  - **数字を載せる**（2026-08-26・運営者の指示で版面を差し替えた）。初版は「載せると年1回のデータ更新のたびに焼き直しが要り、更新を忘れた1枚が各SNSのキャッシュに残る」として1つも載せていなかった。**載せると決めた以上、焼き直しを忘れないことが版面の条件になる**ので、①数字は `web/public/data/` から引く（`build-brand.ts` の `readOgFacts()`。`og.ts` にも `outline.py` にも直書きしない）、②焼いた値を `web/lib/brand/ogFacts.ts` に残し `ogFacts.test.ts` がいまのデータと突き合わせる（**`build:data` だけ回して `build:brand` を忘れるとテストが落ちる**）、の2つを対にしてある。**`OG_IMAGE.alt` も `ogFacts.ts` から組む**——書き写すと焼き直したときに代替テキストだけ古い数字で残る
  - **アウトラインは文ではなく字の表で持つ**（`lettering.ts` の `GOTHIC` / `SANS`。組むのは `pipeline/brand/text.ts` の `textSvg()`）。数字が入った時点で文字列は焼く直前まで決まらないので、文ごと持つと**社数が変わるたびに fontTools と日本語フォントの入った機械が要る**。和文は IPAGothic、ASCII は Liberation Sans（あちらの欧文は固定ピッチで `2,961` や `EDINET` が間延びする）。**太字は縁取りで作る**（IPAGothic にボールドが無い）。**表に無い字を使うと落ちる**ので、字を足したら `outline.py` の `GOTHIC_CHARS` / `SANS_CHARS` に足して回し直す
- **JSON-LD は `WebSite`（`/`・`/about`）と `BreadcrumbList`（`/company/[id]`）だけ。** `Organization` は出さない（企業ページが表すのは当該企業だが、その主体を名乗るのは我々ではない）。**`potentialAction`（サイトリンク検索ボックス）も足さない**——Google が 2023年に終了した機能で、いま書いても何も起きない。**`FAQPage` も同じ理由で出さない**（C16・#838。企業詳細に Q&A の節はあるが、Google は 2026-05-07 に FAQ のリッチリザルトを終了した。運営者の判断）
- **パンくずの段は `features/company/lib/breadcrumb.ts` の1か所。** 画面（`CompanyDetail`）と JSON-LD が同じ配列を読む（AC-14）。**`e2e/social.spec.ts` は JSON-LD の鍵の集合そのものを固定している**ので、画面に無い値を足そうとすると落ちる（AC-15）
- **`agePath()`・`industryPath()` は `lib/seo/paths.ts` に分けた**（`ranking.ts` から再輸出）。`ranking.ts` は `parseSearchParams` まで抱えていて、パスを1本作りたいだけのクライアントコンポーネントには大きいため
- **HTML は `/` が raw 378,474 → 382,992 B（gzip 63,727 → 64,444 B。AC-16 の予算 75,000 B）、`/company/6861` が 135,790 → 140,957 B、`/about` が 86,065 → 90,260 B。** **`<meta>` の見た目より増分が大きいのは、Next.js が同じ文言を RSC ペイロードにも流すため**（同じ description が2回出る）

- **表示モードは `<html>` のクラスが正で、サーバーには一切送らない。** `/` の出力はエッジで24時間キャッシュされる（`lib/cache/headers.ts` の `s-maxage=86400`）ため、HTMLに焼くとある読者の選択が他の読者に配られる
- **FOUC は `<body>` 先頭の素の `<script>` で殺している**（`src/layouts/Base.astro` の `is:inline`）。**バンドルさせない**——Astro の既定は `type="module"`（＝defer）で、ここで欲しい「ブロックしてでも先に走る」と逆になる（Next.js の `next/script` の strategy も同じ理由で使えなかった）。E2E は `waitUntil: "domcontentloaded"` の時点で class を見ることで、ハイドレーション後に付いた場合を弾いている
- **モードによる描き分けは JS でやらない。** アイコンも読み上げ名も両方をHTMLに出し、`dark:` バリアントで見せ分ける。以前はモードをJSで読んでサーバー側ではアイコンを出さない実装にしており、**ボタンが約86ms 空のまま残ってからアイコンが現れる**ちらつきになっていた（実測）。`e2e/theme.spec.ts` が生のHTTPレスポンスに両アイコンが入っていることで固定している
- **`--primary` はライトとダークで別の値。** ライトをそのままダーク背景に置くと 2.72:1 で AA を割る（実際に割っていた）。`tokens.test.ts` のコントラストテストは**両モードで回す**（`:root` だけ見ていたのがこの見逃しの原因）

**`/age/[age]`・`/industry/[industry]` は作らない（ADR-0006・Issue #49）。** ADR-0004でフルSSRになった時点で「パスにしなければクロールできない」前提が消え、Googleのファセットナビゲーション指針もパスとクエリを区別しない。業種33件は `?ind=` のまま自己canonical＋sitemap登録にし、他の組み合わせ・`q`・`page` は正規URLへ寄せる。**年齢8件（`?age=`）は 2026-10-03 に sitemap から外し、canonical も `/` へ寄せた**（Search Console で全くインデックスされておらず重要とみなされていないため。ADR-0006 の追記）。実装はU8（Issue #53）。

**検索エンジン向けの出力は `web/lib/seo/` に閉じている**（U8・Issue #53・ADR-0006）。ranking と company の両方にかかる横断の関心なので `features/<施策>/` ではなく `lib/` に置く（`lib/analytics/` と同じ位置づけ）。

- **オリジンの定義は `lib/seo/site.ts` の `SITE_ORIGIN` だけ。** canonical・sitemap・robots・OGP（S2）が全部その上に乗るので、他所に `https://openreport.net` を書かない。`absoluteUrl()` は**ルートだけ末尾スラッシュを落とす**——`/` の canonical を `https://openreport.net` と出しているので、sitemap の `<loc>` を `/` 付きにすると同じページを2つのURLとして申告することになる（Next.js の `metadataBase` がやっていた正規化を引き継いだ形）
- **canonical の判断は `lib/seo/ranking.ts` の `rankingCanonical()` 1か所。** インデックスさせるのは `/`・`/about`・`/?ind=X` 33件・`/company/[id]` 全社だけで、sitemap もこの4種類（2026-10-03 に `/?age=N` 8件を外した。当初は計1,910 URL に `?age=N` 8件を含んでいた）。**`?age=N` は年齢を取り除いて寄せる**——`?age=N` は `/`、`?age=N&ind=X` は `/?ind=X`、`?age=N&page=M` は `/?page=M`。**`RankingCanonical` は年齢を持たない**ので、title・description も `/` か業種の文言になる（`?age=N` 専用の文言は無い）。**画面の見出し（`N歳年収ランキング`）・URL 同期・SSR はそのまま**で、変わるのは検索エンジンへの申告だけ。年齢別ページとして検索流入を取りに行く方針（`docs/ranking/intent.md` の H2）は取り下げた。**`?age=N&ind=X` が業種側に寄るのは以前から**（同じ会社が同じ順で並ぶ near-duplicate は業種側だから。ADR-0006 の追記で年齢側から変更）。`/company/[id]?age=N` は素の `/company/[id]` へ
- **`?page=N` は `/` へ寄せない。自己canonical にする。** `/?page=2` は `/` の複製ではなく別の30社が並ぶ。**どのページからも `<a href>` で辿れる企業ページは30件だけで、残り1,837社への内部リンクはページ2〜63の中にしか無い**——先頭へ寄せるとその経路を細める。Google のページネーション指針も先頭ページへ寄せるなと明記している。sitemap には1ページ目しか載せないので、インデックスを勧めているわけではない
- **ページ送りは範囲外のページへ `href` を出さない。** `RankingPagination` は `state.page` を総ページ数に丸める。丸める前は `?page=999` が200で最終ページを返しつつ `?page=1000` へリンクしており、クローラが際限なく歩けた（実測）。**`aria-disabled` と `pointer-events-none` はクローラに効かない**
- **sitemap と canonical は `agePath()`・`industryPath()` を共有する。** 別々に組み立てると載せるURLと canonical が1文字ずれても気づかない
- **robots.txt でクロールを止めない。** `?emp=` などを `Disallow` にすると Google が canonical を読めなくなり、正規URLへ評価が渡らないまま宙に浮く。寄せるのは canonical だけでやる
- **「有価証券報告書」は全ページの description に入れ、タイトルは `/` だけに入れる。** 競合6社（Zaimiru・OpenMoney・OpenWork・Yahoo!しごとカタログ・Ullet・J-LiC）のタイトルを実測すると、競っているのは鮮度と規模で、有報を置いているものは1つも無かった。うち3社はデータ元が同じ有報である——**「有報ベース」はデータ源として独自なのではなく、それを明示していることが差別化になる**（口コミベースの数字と並んだときに読者が見分けられる）。`?age=N`・`?ind=X` に入れないのは「◯歳」「業種名」のほうが情報量が高いため
- **社数はタイトルにも description にも直書きしない。** `companies.meta.count` から引く。`/` のタイトルを共通の外装ではなく `src/pages/index.astro` が組み立てているのはそのため
- **メタデータの文言は `PageMeta`（`lib/seo/pageMeta.ts`）を返す純粋関数1つから出す**（U16・Issue #135・親 #130）。サーバーは `src/components/PageHead.astro` が head に描き、**クライアントは `usePageMeta()` で DOM に書く**。ランキングは `rankingPageMeta`、企業詳細は `companyPageMeta`（C1 以来 `generateMetadata` に直書きしていたものを切り出した）。**操作はすべて `pushState` なので、これが無いとメタデータだけが最初のURLに取り残される**——`/` で年齢そろえに切り替えると URL は `?age=35` なのにタイトルは実測値のまま（親 Issue #130 が報告したのはこの状態の DOM で、**サーバーが返すHTMLは最初から正しかった**）。**企業詳細では `?age=` を無くしたのでこの食い違いは起きない**（R1・ADR-0012）が、`usePageMeta` は呼び続ける——**ランキングから遷移すると前のページの canonical と description が `<head>` に残る**ため
- **`<title>` の書き戻しは F1 で無くなった。** Next.js はメタデータを本文の後ろに流し、React が届いた時点で head へ移していたので、読み込み直後（実測で1秒以内）に切り替えると**こちらの書き込みの直後に React が `<title>` の中の文字だけを元に戻していた**（`description`・`canonical` は属性なので戻らない＝タイトルだけ古いまま）。`usePageMeta` は `MutationObserver` で head を見張って書き直していた。**Astro では head を React が触らない**（`<title>` を描くのは `PageHead.astro` で、島は body の中の div にしか取り付かない）ので見張りを落とした
- **メタデータの E2E は文言を書き写さない。** `e2e/metadata.spec.ts` は「操作後の DOM」と「同じURLを直接開いたときのHTML」を比べる。文言を書き写すと、文言を直すたびにテストも直すことになり、そのとき何も守らない
- **`wrangler.jsonc` の `"workers_dev": false` を消さない。** wrangler はルート指定の無い Worker に対して既定で workers.dev を有効にするので、消すとデプロイのたびに `nenshu.<subdomain>.workers.dev` が本番と同じHTMLを200で返す状態に戻る（2026-08-21 に実際にそうなっていた）。公開ホストは `openreport.net` の1本で、`www` は Cloudflare の Redirect Rule で apex へ 301 する
- **`workers_dev` と `preview_urls` は対で書く。** `preview_urls` の既定値は `preview_urls = workers_dev`（wrangler 4.44.0 以降）なので、`workers_dev: false` だけを書くと**ブランチのプレビューURLまで無効になる**。しかもこの既定は**デプロイのたびに適用される**ため、ダッシュボードで有効にしても次のデプロイで落ちる。**Cloudflare の設定をダッシュボードだけで直さない。`wrangler.jsonc` に書かない設定は次のデプロイで wrangler の既定値に戻される**
- **ダッシュボードのビルド構成も main に入るまで効かない**（2026-08-26・F1・#209）。ビルドコマンドを変えて保存しても、**ブランチのビルドは旧いコマンドで走る**（4回とも同じ。ビルドの詳細画面の「ビルドの設定」欄で確かめられる）。**「ビルドを再試行」はさらに効かない**——元のビルド構成をそのまま再生する。**ブランチのビルドが使うのはバージョンコマンド（`npx wrangler versions upload`）**で、デプロイコマンドではない。**本番が新しいコマンドで通った後も、ブランチのビルドは旧いまま落ち続ける**（#225 で実測。main との差が markdown 3ファイルだけの PR が14秒で落ちた）——**ブランチのビルドが赤いことをコードの問題と読まない**
- **Worker の設定は main に入れるまで効かない。** `preview_urls: true` をブランチに入れて3回デプロイしてもプレビューURLは出ず、**main にマージした直後のビルドで出た**（2026-08-21・Issue #119）。`wrangler.jsonc` を触ったときは、ブランチでの結果で「効かない」と判断しないこと（実際に判断して、原因を設定ファイルの外に探しに行った）
