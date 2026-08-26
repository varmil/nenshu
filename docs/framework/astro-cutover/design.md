# design.md — F1 Astro へ移す（カットオーバー）

Issue [#209](https://github.com/varmil/nenshu/issues/209)。spec は `docs/framework/spec.md`、決定は ADR-0014、実測は `docs/framework/intent.md`、段取りは同じディレクトリの `plan.md`。

**画面は1ピクセルも変えていない。** 変わったのは「誰が HTML を作り、どこから配るか」だけ。

## ディレクトリ構成

```
web/
  src/                        ← Astro が見る場所。ここだけが新しい
    pages/
      index.astro             / （唯一の SSR ルート）
      about.astro             /about
      company/[id].astro      /company/<ID> ×2,961
      404.astro               存在しないパス
      sitemap.xml.ts          /sitemap.xml
      robots.txt.ts           /robots.txt
    layouts/Base.astro        html・head・body・共通ヘッダ
    components/PageHead.astro title・description・canonical・og:
  features/                   ← 1行も動かしていない（React のまま）
  design-system/              ← 〃
  lib/                        ← 〃
  styles/globals.css          （`app/globals.css` から移しただけ）
  public/
    _headers                  事前生成したページ・アセットのキャッシュ
```

**`features/`・`design-system/`・`lib/` は移動していない。** `@/` の別名を `web/` の直下に向けてあるので（`astro.config.mjs` の `vite.resolve.alias`）、import の綴りが1つも変わらない。**Astro が増えたのであって、アプリが書き換わったのではない。**

消えたもの: `app/`（7ファイル）・`next.config.ts`・`open-next.config.ts`・`postcss.config.mjs`・`scripts/{assert-prerendered-assets,write-404-asset,measure-prefetch}.mjs`・`AGENTS.md`（`next dev` が書いていたもの）・`web/CLAUDE.md`（`@AGENTS.md` の1行だけだった）。

## ルーティングと描画のモード

| URL | 描く時点 | 返す主体 | 数 |
| --- | --- | --- | --- |
| `/`・`/?age=N`・`/?ind=X`・`/?q=`・`/?page=N`・`/?sort=` | リクエスト時（`prerender = false`） | Worker | 1ルート |
| `/about` | ビルド時 | 静的アセット | 1 |
| `/company/<ID>` | ビルド時（`getStaticPaths`） | 静的アセット | 2,961 |
| `/sitemap.xml`・`/robots.txt` | ビルド時 | 静的アセット | 2 |
| `/404.html` | ビルド時 | 静的アセット | 1 |

**`output: "static"` が既定で、`/` だけが `export const prerender = false` で降りてくる。** ADR-0012（R1）が決めた「全社をビルド時に生成する」はそのままで、**変わったのは配り方**——OpenNext は事前生成した HTML を `incrementalCache` から Worker が読んで返していたが、いまは Cloudflare の静的アセットが直接返す。

**`/` だけがサーバーで描くのは ADR-0006 のまま。** `?age=N` 8件・`?ind=X` 33件を別内容・別 canonical でインデックスさせているため。

**`wrangler.jsonc` の `run_worker_first` は `["/"]` の1件。** ここが広いと、アセットで返せるページが Worker を通り続けてこの Unit の目的が消える。**ページ（ルート）を足したらここにも足す**規則は変わらない。

## Worker を起こしたことの印

`lib/runtime/renderedBy.ts` の `x-openreport-rendered: worker` を `/` の応答にだけ付ける。

**AC-1（Worker を起こさずに返る）は応答からは判らなかった。** OpenNext の頃は `x-nextjs-*` が偶然その役をしていて `e2e/asset-routing.spec.ts` がそれを読んでいたが、移ると手がかりごと消える。**フレームワークの副産物に頼るのをやめ、自分で1つ置いた。** 代償は `/` の応答が約35バイト増えること。

## 島（islands）

| 島 | 置き場所 | 何を渡すか |
| --- | --- | --- |
| `NavProgressBar` | `Base.astro`（全ページ） | 無し |
| `SiteHeader` | `Base.astro`（全ページ） | 無し |
| `RankingIsland` | `/` | 1ページ30社ぶん＋絞り込みのメタデータ |
| `CompanyDetailIsland` | `/company/[id]` | その会社ぶん |

**島は画面ごとに1つに収める。** Astro は**島ごとに props を HTML の属性へ直列化する**ので、分けると同じデータが2回入る——調査のプローブでランキングを2つの島にしたとき `/` の HTML が 481,312 B → 733,979 B になった（`docs/framework/intent.md`）。`CompanyDetailIsland` が `LogoIdsProvider` を内側に抱えているのはそのため。

**`RankingIsland`・`CompanyDetailIsland` は薄い。** `RankingApp`・`CompanyDetail` をそのまま呼ぶだけで、**「ここが島の境界だ」と分かる場所**を作るために置いてある（`app/page.tsx` の頃、境界は `"use client"` の有無で暗黙だった）。

**`/` のデータの組み立ては `features/ranking/lib/pageData.ts`、企業詳細は `features/company/lib/pageData.ts`。** `.astro` の中に置かない——Unit テストから呼べなくなるのと、`app/page.tsx` にあった規則をそのまま持ち越すため。

## head とメタデータ

**文言の出どころは1か所のまま**（U16・#135）。`PageMeta` を返す純粋関数（`rankingPageMeta`・`companyPageMeta`・`aboutPageMeta`）は1行も変えていない。変わったのは出口だけ。

- サーバー: `PageHead.astro` が `PageMeta` から `<title>`・description・canonical・`og:` 一式を描く。**Next.js の `toMetadata()` と `metadataBase` がやっていたことをここが引き取った**（絶対URLは `absoluteUrl()`。オリジンの定義は `lib/seo/site.ts` の1か所のまま）
- クライアント: `usePageMeta()` が DOM を直接書き換える（`/` の操作は `pushState` なので、これが無いとメタデータだけが最初のURLに取り残される）

**`usePageMeta` から `MutationObserver` を落とした。** Next.js はメタデータを本文の後ろに流し、React が届いた時点で head へ移すので、読み込み直後に表示基準を切り替えると**こちらの書き込みの直後に React が `<title>` の中の文字だけを元に戻していた**（U16）。**Astro では head を React が触らない**——`<title>` を描くのは `PageHead.astro` で、島は body の中の div にしか取り付かない。切り替えの直後から2秒間、100ms ごとに `document.title` を読んで書き戻しが起きないことを確かめた。

**「自分のパスを離れたら書かない」というガードも落とした。** ページを移ると文書ごと入れ替わるので、行き先のメタデータを前のページのもので塗り替える経路が無い。

**`twitter:` は `card` だけ。** Next.js は `title` などを自動で埋めていたが、X は `og:` も読むので同じ文言を2組持つ理由が無い。

**JSON-LD はページが名前つきスロット（`slot="head"`）で差し込む。** `WebSite`（`/`・`/about`）と `BreadcrumbList`（`/company/[id]`）の2種類だけという S2 の決定は変わらない。

## キャッシュの受け持ち

**規則は `lib/cache/headers.ts` の1か所のまま**（AC-15・ADR-0004）。ただし**適用する主体が2つに割れた。**

| 対象 | 付ける場所 |
| --- | --- |
| `/` | `src/pages/index.astro` が `Astro.response.headers` に付ける |
| `/about`・`/company/*`・`/sitemap.xml`・`/robots.txt`・`/404.html` | `public/_headers` |
| `/logos/*`・`/data/*`・アイコン・`og.png` | `public/_headers`（E0・S4 のまま） |
| `/_astro/*`（指紋つき） | `@astrojs/cloudflare` が `_headers` に自分で足す。**こちらでは書かない** |

**`lib/cache/headers.test.ts` が `public/_headers` の中身と定数を突き合わせている**ので、片方だけ動かすと落ちる。

**`RSC_BYPASS_RULE` は消えた。** 守っていた相手——`RSC: 1` 付きで `_rsc` の無いリクエストに Next.js が返す `307 → /?_rsc` が素の `/` のキャッシュを上書きする事故（2026-08-21 に本番で再現）——が、RSC ごと無くなったため。

## ページ間の遷移

**`NavLink` は素の `a` 要素になった。** 遷移は素の HTML 取得で、着いた先ではページごと作り直される——**それが「静的アセットで返せる」ことの前提**でもある（アセットは `RSC: 1` 付きのリクエストにも `text/html` を返すので、RSC のクライアント遷移とは両立しなかった。`docs/framework/intent.md`）。

**`NavLink` を残したのは呼び出し側の綴りを変えないため**で、`prefetch` プロップも受け取って捨てる。`eslint.config.mjs` は引き続き素の `a` を直接書かせない。

**遷移中のバーは `document` で1本のリスナーとして拾う**（`NavProgressBar`）。`next/link` の `useLinkStatus()` は素の `a` には無い。リンク側に `onClick` を置く手もあるが、**島の外で描かれたリンク**——`/about` の本文にあるものなど、JS を1バイトも持たない部分——では拾えない。委譲なら描かれ方に依らない。

- **どれを遷移と見なすかの規則は `features/navigation/lib/navIntent.ts` の純粋関数**（別オリジン・`target`・`download`・修飾キー・`preventDefault()` 済み・同じ場所、を偽で返す）。ブラウザが要るのは委譲リスナーだけにしてある
- **バブリングで聞く。** `BrandLink` は `/` の上で `preventDefault()` して遷移を横取りするので、その判断が済んだ後に見る
- **終わりは拾わない。** 次のページが来た時点でバーはページごと消える。`navProgress.reset()` は bfcache から戻ったときのためだけに残っている
- **要るかどうかは F2（#210）が測って決める。** ここでは壊れていない状態にした

## パスの判定

**`lib/history/pathname.ts` から `history.pushState`/`replaceState` の包みを外した。** F0（#208）は `next/navigation` の `usePathname` を置き換えるために購読を持っていたが、**文書が生きている間にパスが変わる経路がもう無い。**

- ランキングの操作は `pushState` するが、変えるのはクエリだけでパスは `/` のまま
- `/` の上でサイト名を押すと絞り込みが解けるが、行き先も `/`
- ページを跨ぐ戻る/進むは文書ごと入れ替わる（`popstate` ではない）

残ったのは `readPathname()` と `isRankingPath()` の2つだけ。`useIsRankingPath()` は `useSyncExternalStore` を通しているが、**それはサーバーとクライアントで値を揃えるためだけ**で `subscribe` は何もしない。

## 404

**`src/pages/404.astro` を置いた。** `wrangler.jsonc` の `not_found_handling: "404-page"` が返すのがこれで、ボットのスキャン（`/wp-admin/install.php` 等）も `companies.json` に無いIDの `/company/…` も、**Worker を起こさずに同じ1枚**へ落ちる。

**置かないと Astro の既定（`lang="en"` の `404: Not Found`、共通ヘッダ無し）が出る。** Next.js の頃は `scripts/write-404-asset.mjs` が `/_not-found` の HTML をアセットへ写しており、**レイアウトは出ていた**——本文が Next.js の既定の英文だった点だけが違う。`e2e/asset-routing.spec.ts` が「日本語で、共通ヘッダを持ち、1種類しかない」ことを固定している——**ステータスは既定の 404 でも同じ 404 なので、それだけ見ていると気づけない。**

## 設定の要点

**`astro.config.mjs`**

- `trailingSlash: "never"` ＋ `build: { format: "file" }`。**既定は `/about/`** で、ADR-0006 の canonical と食い違う（一度公開したURLは変えない）
- **`astro dev` ではアダプタを付けない**（`process.argv.includes("dev")` で分岐）。`@astrojs/cloudflare` は dev でも workerd を立てて Vite のモジュールランナーでその中を走らせるが、**この構成では起動しない**——依存の事前バンドルが遅れて走るたびにランナーが再読込され、古いチャンクを掴んで `require is not defined` / `deps_ssr/*.js does not exist` で落ちる（最小のページ・最小の `wrangler.jsonc` でも同じだった）。**Worker に固有のもの**——`_headers`・`run_worker_first`・`not_found_handling`——は**もともと dev サーバーでは効かない**ので、確かめる場所は前から `wrangler dev` だった
- `session: false`。アダプタは既定でセッションを有効にし、**id の無い `SESSION` KV バインディングを生成後の `wrangler.json` に足す**。このサイトはリクエスト時に何も憶えないので、使わないバインディングを宣言だけ残さない
- `devToolbar: { enabled: false }`。dev のオーバーレイが `h1` を3つ持ち込むので、**E2E の `locator("h1")` が strict mode で落ちる**
- `imageService: "passthrough"`。`next.config.ts` の `images.unoptimized` と同じ立場

**`web/.node-version`（`22.16.0`）**

**Astro 7 の要求は Node `>=22.12.0` で、Next.js 16 の `>=20.9.0` より上がっている。** このカットオーバーで初めて 20 系では動かなくなったので、**ビルド環境が既定で選ぶ版に任せない。** `package.json` の `engines.node` にも同じ下限を書いてある（`npm ci` の時点で警告が出る）。置き場所は Cloudflare のルートディレクトリ（`/web`）で、リポジトリの直下ではない。

**`wrangler.jsonc`**

- **`main` も `assets.directory` も書かない。** アダプタが `@astrojs/cloudflare/entrypoints/server` を差し込み、出力先は `@cloudflare/vite-plugin` が知っている。**書くとビルド前に「そのファイルが無い」で落ちる**（成果物を指すので鶏と卵になる）
- **`global_fetch_strictly_public` を外した。** OpenNext が `WORKER_SELF_REFERENCE` で自分自身を `fetch` していたときに要ったもの。付けたままだと `astro dev` の workerd がモジュールを取りに行けない
- `build.command`・`WORKER_SELF_REFERENCE`・Worker のキャッシュ層も消えた（OpenNext の `incrementalCache` のためのもの）
- `workers_dev: false` ＋ `preview_urls: true` は対のまま（消すと次のデプロイで wrangler の既定に戻る）

## E2E の足場

**`e2e/appTest.ts`**（`rankingTest.ts` を改名して役目を1つ足した）。`goto`／`reload` の直後に2つ待つ。

1. **ハイドレーションの完了。** Astro は島ごとに React を後から取り付ける。**取り付く前に来たクリックはどこにも届かない**——SSR したボタンは最初から DOM にあるので Playwright の自動待機は素通りし、`click()` は成功したように見えて何も起きない。**1巡目はこれで27件落ちた**（うち17件が企業詳細の「年齢そろえに切り替える」系）。印は Astro が付ける `<astro-island ssr>` 属性で、取り付いた島からは消える
2. **全件データの到着**（E0・ADR-0013。従来どおり `/` のときだけ）

**`waitUntil` を明示した `goto`／`reload` では待たない**——ハイドレーション前の HTML を見るテスト（`theme.spec.ts` のちらつき防止）は、待った時点でその瞬間を過ぎる。そこから続けて操作したいときは `waitForHydration(page)` を明示的に呼ぶ。

**`navigation-progress.spec.ts` は文書の中から標本を取る形にした。** 遷移が素の HTML 取得になったので、`click()` は新しい文書が届くまで返らず、`expect(locator)` も進行中の遷移が終わるまで待つ——**戻ってきた時点では次のページに入れ替わっていて、バーはもう無い。** クリックの前にページ内で 50ms ごとの記録を始めておき、`exposeFunction` でテスト側へ渡す。

**落としたのは `prefetch-loop.spec.ts` だけ**（守っていた RSC のプリフェッチ暴走・#183 ごと消えた）。`cache-headers.spec.ts` は「`/` は実行時・他はアセットの `_headers`」に、`network.ts` は `_next/static` → `_astro` に、`asset-routing.spec.ts` は `x-nextjs-*` → `x-openreport-rendered` に引き継いだ。

**`robots.txt` の綴りを `User-Agent:` に合わせた。** Astro のエンドポイントは自分で文字列を書くので、Next.js の `MetadataRoute.Robots` が出していた大文字と揃えた（規格上は大小どちらでもよいが、**公開している中身を変える理由が無い**）。

## 実測

`wrangler dev --port 3801 --local` に対して、`/proc/<workerd>/schedstat` の第1フィールド（ns）を30リクエストで割る。**workerd は2プロセス起きるので合計する。** 床として静的アセット（`/favicon.ico`）を一緒に測る。「前」は同じ手順で F0 時点の main を測った値。

| URL | 前（Next.js＋OpenNext） | 後（Astro） |
| --- | --- | --- |
| `/favicon.ico`（床） | 3.7 ms | 3.6〜3.9 ms |
| `/about` | 14.3 ms | **3.9〜4.2 ms（床）** |
| `/company/6861` | 20.6 ms | **4.0〜4.5 ms（床）** |
| `/` | 39.5〜44.6 ms | **21.1〜22.4 ms** |

**`/about` と `/company/[id]` は床と区別が付かない＝ Worker が起きていない**（AC-1）。応答にも `x-openreport-rendered` が付かない。

**`/` が半分になったのは事前生成とは無関係**で、Worker のバンドルが小さくなったぶん（評価するコードが減った）。**残る 21ms のうち大半は全社ぶんの props 直列化**で、これは ADR-0013（E0）の領分（`docs/framework/intent.md`）。

| 測ったもの | 前 | 後 |
| --- | --- | --- |
| Worker バンドル（`wrangler deploy --dry-run`） | gzip 2,089 KiB | **gzip 627.9 KiB**（raw 2,887.8 KiB） |
| デプロイのアセット | 634 MB / 4,629 ファイル | **419 MB / 5,506 ファイル** |
| `/` の HTML | gzip 19,860 B | **gzip 19,420 B**（raw 246,408 B） |
| `/about` の HTML | — | gzip 12,903 B |
| `/company/6861` の HTML | — | gzip 19,484 B |
| ビルド | — | 1分11秒（2,961ページ＋2エンドポイント） |

**バンドルは 3MiB の無料枠に対して 20.4%**（前は 66.4% だった）。**ファイル数が増えたのは、事前生成した HTML が `.html` として並ぶため**（OpenNext は `incrementalCache` の `.cache` に持っていた）。上限はファイル数 20,000・1ファイル 25MiB で、どちらも余裕がある。

**`/` の HTML が微減した**のは、RSC ペイロード（`self.__next_f`）に同じ内容が二重に流れていたぶんが消え、代わりに島の props が属性として1回だけ入るため。**E0 が先に入っていなければ逆になっていた**——1,867社ぶんを直列化していた頃の実測で、島の props は `__next_f` より gzip +4,024 B 重かった（`docs/framework/overview.md`「実施順序」）。

## この Unit で決めなかったこと

**遷移中のバーを残すか**（→ F2・#210。「まず要るのかを測ってから」）。**`/` の CPU**（→ ADR-0013・E0）。**ファセットのパス化**（→ ADR-0006 の再検討）。**画面の追加・変更**（spec 2.）。
