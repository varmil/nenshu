# U8 検索エンジン向け導線 — design.md

参照: Issue [#53](https://github.com/varmil/nenshu/issues/53), ADR-0006（インデックス戦略）, ADR-0007（表示基準）, `docs/ranking/spec.md` 5.

## 構成

```
web/
  lib/seo/
    site.ts           SITE_ORIGIN / SITE_NAME / METADATA_BASE / absoluteUrl()
    ranking.ts        agePath() / industryPath() / rankingCanonical() / rankingMetadata()
  app/
    layout.tsx        metadataBase
    page.tsx          generateMetadata → rankingMetadata()
    about/page.tsx    metadata.alternates.canonical
    company/[id]/page.tsx  generateMetadata に alternates
    sitemap.ts        約1,910 URL
    robots.ts         Allow: / と Sitemap:
```

`lib/seo/` に置くのは、SEO が ranking と company の両方にかかる横断の関心だからである。`lib/analytics/` と同じ位置づけで、`features/<施策>/` には属さない。

## オリジンの単一の置き場所

```ts
export const SITE_ORIGIN = "https://openreport.net";
export const METADATA_BASE = new URL(SITE_ORIGIN);
export function absoluteUrl(path: string): string;
```

canonical・sitemap・robots・将来のOGPがすべてこの値の上に乗る。ドメインを取り直したときに直す場所が散っていると、どれか1つだけ古いオリジンのまま残る（spec.md 5.）。

`absoluteUrl` は `URL` に解決を任せる。業種名のような非ASCIIはここでパーセントエンコードされ、sitemap.xml が要求するエスケープ済みURLになる。

**ルートだけ末尾のスラッシュを落とす。** Next.js は `trailingSlash: false`（既定）なので `alternates.canonical: "/"` を `https://openreport.net` と出力する。sitemap の `<loc>` がスラッシュ付きだと、同じページを2つのURLとして申告することになる。

## canonical の決定

```ts
interface RankingCanonical {
  path: string;                 // canonicalするパス（クエリまで。オリジンは付けない）
  targetAge: TargetAge | null;  // この canonical が表す表示基準
  industry: string | null;      // この canonical が表す業種
  page: number;                 // 1始まり。1 ならクエリに出さない
}

function rankingCanonical(
  params: URLSearchParams,
  companies: CompaniesData,
  industryCount: (industry: string) => number
): RankingCanonical;
```

判定は3段。

1. `parseSearchParams` で `RankingState` に落とす。**不正な値はここで既定値に倒れる**ので、以降の分岐に混ざらない（`?emp=xyz` は「emp が効いている」とは見なさない）
2. `emp`・`ten`・`aage`・`q`・`sort` のいずれかが既定値と違えば `/`
3. 業種（33件のリストにあるもの）があれば `/?ind=X`、無ければ年齢があれば `/?age=N`、どちらも無ければ `/`
4. ページ2以降なら、それに `&page=N` を足す（**`/` へ寄せない**。下記）

| 入力 | canonical |
| --- | --- |
| `/` | `/` |
| `/?age=35` | `/?age=35` |
| `/?ind=銀行業` | `/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD` |
| `/?age=35&ind=銀行業` | `/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD` |
| `/?page=3` | `/?page=3` |
| `/?ind=銀行業&page=2` | `/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&page=2` |
| `/?age=35&ind=銀行業&page=2` | `/?ind=%E9%8A%80%E8%A1%8C%E6%A5%AD&page=2` |
| `/?page=999`・`/?ind=銀行業&page=4` | ページを落として先頭へ |
| `/?age=35&ind=銀行業&emp=1000-` | `/` |
| `/?emp=1000-&page=2` | `/`（`page` ごと落ちる） |
| `/?page=1`・`/?sort=salary`・`/?q=` | `/` |
| `/?age=33`・`/?ind=存在しない業種` | `/` |
| `/about` | `/about` |
| `/company/6861`・`/company/6861?age=35` | `/company/6861` |

### ページ送りを寄せない理由

**`/?page=2` は `/` の複製ではない。** 実測すると `/` の会社リンクは30件、`/?page=2` も30件で、1社も重ならない。

**ページから `<a href>` で辿れる企業ページは30件しかない。** 残り1,837社への内部リンクは、ページ2〜63の中にしか存在しない（`RankingPagination` は `<a href="?page=N">` の実体を持つのでクローラは辿れる）。ここを `/` の複製だと宣言すると、Google はページ2以降のクロール頻度を落とし、1,837社への内部リンク経路を細める。sitemap には1,867件載せてあるが、**sitemap は発見の手段であって内部リンクのように評価を渡さない。**

Google のページネーション指針も「連番の各ページに自分自身の canonical を与え、先頭ページに寄せるな」と明記している。**sitemap に載せるのは1ページ目だけ**なので、インデックスを勧めているわけではない。

**総ページ数を超える `page` は落とす。** `?page=999` は200で最終ページと同じ7社を返すので、自己canonical にすると実在しないURLを正規URLとして申告することになる。総ページ数はフィルタを走らせなくても出せる——行数が変わるのは業種だけで（年齢は金額を書き換えるだけ）、`emp`・`ten`・`aage`・`q` が効いているURLは丸ごと `/` へ寄せるため、見るのは「全体」と「業種」の2通りだけである。

**`page` の位置は `buildSearchParams` と同じく最後。** ランキング側が作るURLと canonical の文字列が食い違わないようにしてある。

`?age=N&ind=X` を業種側に置いた理由は plan.md にある（同じ会社が同じ順で並ぶのは業種側で、`/?age=N` とは行数から違う）。ADR-0006 の表を1行だけ改める形になるので、ADR 側にも追記した。

`/company/[id]?age=N` を素のURLへ寄せるのは、1,867社×9基準＝16,803 URL をインデックスさせる意味がないため。sitemap に載せるのも素の1,867件だけで、ADR-0006 の表と一致している。

## title・description

`rankingMetadata()` は canonical と、**その canonical が表すページ**の title・description を返す。**非正規URLに固有の title を作らない**——`/?age=35&ind=銀行業` は `/?ind=銀行業` と同じ title になる。

| canonical | title | description |
| --- | --- | --- |
| `/` | `OpenReport \| 有価証券報告書ベースの平均年収ランキング {社数}社` | 実測値が既定であることと社数 |
| `/?age=N` | `{N}歳年収ランキング \| OpenReport` | **推定であることを書く**（AC-9） |
| `/?ind=X` | `{X}の平均年収ランキング \| OpenReport` | 実測値なので推定の語を出さない（AC-9）。社数を含む |
| 上記 + `page=N`（N≧2） | 末尾に `（Nページ目）` | 変えない |

ページ番号を title に足すのは Google の要求ではない（「連番のページは同じタイトルでよい」とされている）。それでも足すのは、**63枚が同一タイトルだと Search Console の重複タイトル警告に埋もれて、本当の重複を見落とすため。** `/` のページ2以降だけは社数を落とす——「1,867社（3ページ目）」は読みにくく、2ページ目以降が検索結果に出ることはほぼ無い。

### 「有価証券報告書」をどこに置くか

**description は全ページに入れる**（`/about`・`/company/[id]` を含む）。description は順位を動かさないが SERP のスニペットに出る。OpenWork の口コミベースの数字と並んだときに読者が見分けられるかどうかがそこで決まる（`docs/ranking/intent.md` の差別化要因）。

**タイトルに入れるのは `/` だけ。** 競合6社のタイトルを実測した結果がこれである。

```
平均年収ランキング 2026｜上場企業の給料一覧 - Zaimiru
【2026年7月最新】平均年収が高い企業ランキングTOP100        （OpenMoney）
【2026年8月最新】平均年収の高い企業ランキングTOP100 OpenWork
【2026年版】平均年収が高い企業21626社ランキング｜転職・就職で人気｜Yahoo!しごとカタログ
平均年収ランキング - 銀行業 - 平均年収順 1〜20位 | Ullet
銀行業の上場企業平均年収ランキング | J-LiC 上場企業サーチ
```

タイトルで競っているのは**鮮度**（「2026年8月最新」）と**規模**（TOP100・21626社）で、有価証券報告書を置いているものは1つも無い。うち Ullet・J-LiC・OpenMoney はデータ元が同じ有報である。**つまり「有報ベース」はデータ源として独自なのではなく、それを明示していることが差別化になる**（口コミベースの数字と並んだときに読者が見分けられる）。

`?age=N` 8件・`?ind=X` 33件のファセットページに入れないのは、「◯歳」「業種名」のほうが情報量が高く、限られた文字数をそちらに使うため。`/company/[id]` の実測値タイトルには既に入っている（`有価証券報告書は{金額}`）。

`/` のブランド先頭（`OpenReport | …`）は `docs/site-chrome/spec.md` 1.4 の決めどおり守っている。

**社数はタイトルにも description にも直書きしない。** `companies.meta.count` から引く——直書きすると年1回のデータ更新でそこだけ古い数字が残る。`/` のタイトルを `app/layout.tsx` ではなく `app/page.tsx` の `generateMetadata` が組み立てているのはこのためで、`layout.tsx` 側は `/_not-found` などの受け皿として社数の入らない文字列を持つ。

`h1` は `RankingApp` が出す `平均年収ランキング` / `{age}歳年収ランキング` のままで、title とは別に持つ。title はブランドを含み、`h1` はページの内容だけを表す（`docs/site-chrome/spec.md`）。

## sitemap

| 対象 | 件数 |
| --- | --- |
| `/` | 1 |
| `/about` | 1 |
| `/?age=N` | 8 |
| `/?ind=X` | 33 |
| `/company/[id]` | 1,867 |
| 計 | 1,910 |

`agePath()`・`industryPath()` を canonical と共有する。別々に組み立てると、sitemap が載せるURLと canonical が指すURLが1文字ずれても気づかず、Google から見て sitemap 全体の信頼が下がる。

`lastModified` はビルド時に確定する `companies.json` の `meta.generatedAt`。データの更新は年1回（`docs/product/product.md`）なので、リクエストごとの現在時刻を入れると「毎日更新されている」という誤った信号になる。

`changeFrequency` と `priority` は出さない（Google が使っていない）。

上限は 50,000 URL / 50MB で、実際は 1,910 URL・約195KB なので分割しない。

`app/sitemap.ts` と `app/robots.ts` はどちらもビルド時に静的化される（`next build` の出力で `○ (Static)`）。リクエストのたびに Worker が1,910行を組み立てることはない。

## robots

```
User-Agent: *
Allow: /

Sitemap: https://openreport.net/sitemap.xml
```

**クロールは止めない。寄せるのは canonical でやる。** `?emp=` などを `Disallow` にすると、Google はそのURLを読めなくなり、中に書いてある canonical も読めなくなる。結果は「インデックスから外れる」ではなく、正規URLへ評価が渡らないまま宙に浮く。Google のファセットナビゲーション指針が canonical を先に勧めているのはこのためで、非正規側へのクロール量は時間とともに自然に減る。

Cloudflare の管理robots.txt が Content Signals のコメントを挿しており、アプリ側の中身は残る想定だが、デプロイ後に本番で確かめる。

## ページ送りが範囲外へリンクしない

`RankingPagination` は `state.page` を総ページ数に丸めてから番号とリンクを組み立てる。丸める前は `?page=999` が200で最終ページの7社を返しつつ `?page=998` と `?page=1000` へのリンクを出しており、クローラが `?page=1001`・`?page=1002`… と際限なく歩けた（実測）。1ページ目の「前へ」も `?page=0` を出していた。

**`aria-disabled` と `pointer-events-none` はクローラに効かない。** `href` があれば辿るので、端では自分自身に向けることで防ぐ。

## 公開ホストは apex 1本

`openreport.net`（apex）に Worker Custom Domain を付けてあり、`www` は Redirect Rule で apex へ 301 する（パスとクエリを保持）。`wrangler.jsonc` の `"workers_dev": false` は、**wrangler がルート指定の無い Worker に対して既定で workers.dev を有効にする**ため必要になる。これが無いと、デプロイのたびに `nenshu.<subdomain>.workers.dev` が本番と同じHTMLを200で返す状態に戻る。

**`"preview_urls": true` を対で書く**（2026-08-21 に追加）。`preview_urls` の既定値は `preview_urls = workers_dev` なので（wrangler 4.44.0 以降。当リポジトリは 4.123.0）、`workers_dev: false` だけを書くと**ブランチのプレビューURLまで巻き添えで無効になる**。さらにこの既定は**デプロイのたびに適用される**ので、ダッシュボードで有効に戻しても次のデプロイでまた落ちる。

消したいのは**公開ホストとしての** `nenshu.<subdomain>.workers.dev` であって、`<ブランチ名>-nenshu.<subdomain>.workers.dev` は本番に入れる前に実機で見るための経路である。プレビューも workers.dev の上にある以上、原理的には検索エンジンから見える。ただし全ページが `SITE_ORIGIN` の canonical を出すので、拾われても評価は正規URLへ寄る——`?emp=` などを robots.txt で止めず canonical だけで寄せているのと同じ考え方である。

**この2つに限らず、Cloudflare の設定をダッシュボード側だけで直さないこと。** `wrangler.jsonc` に書いていない設定は、次のデプロイで wrangler の既定値に戻される。

### 未解決: ブランチのプレビューURLが出ない

Issue #119 の作業中、ブランチのプレビューURLが**1回出たあと消える**症状を2度観測した（有効化 → 次のビルドで Preview URL の列が出る → その次のビルドで消える）。`preview_urls: true` を入れても戻らず、**`preview_urls` だけが原因ではない**ことが分かっている（`true` の状態で2回デプロイしても列が出ない）。

**残りは Workers Builds 側（ダッシュボード）の設定で、リポジトリからは表現できない。** 確かめる先は次の2つ。

- **非本番ブランチのビルド／デプロイの扱い。** Preview URL が出た1回だけ、Workers Builds のコメントに Commit Preview URL（`<バージョン>-nenshu…`）と Branch Preview URL（`<ブランチ名>-nenshu…`）の両方が並んだ。これはプレビュー版のアップロードに対応する形で、通常のデプロイでは出ない
- **非本番ブランチのデプロイコマンド。** `package.json` の `deploy` は `opennextjs-cloudflare deploy`（＝`wrangler deploy`）で、**本番へのデプロイ**である。非本番ブランチもこれを走らせているなら、PRブランチへの push が `openreport.net` に出ていることになる。プレビューに留めたいなら、非本番ブランチ側は `wrangler versions upload` に当たるコマンドに分ける

Cloudflare 側の設定（Always Use HTTPS・HSTS・www の Redirect Rule・SPF/DMARC）はダッシュボード／API に置いてあり、リポジトリには入らない。`workers_dev` だけがコード側で表現できる部分である。
