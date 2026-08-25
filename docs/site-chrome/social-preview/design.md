# design.md — S2 OGPと構造化データ

参照: Issue #116, `docs/site-chrome/spec.md` 4.（AC-10〜AC-16）, `docs/adr/0006-public-url-strategy.md`, `docs/site-chrome/overview.md` S2

出来上がりの内部構造。着手前の段取りは `plan.md`。

## 全体像

**新しい文言を1つも作っていない。** SNS のカードに出る見出しと説明は、`<title>` と `<meta name="description">` と同じ文字列である（AC-12）。だからこの Unit がやったのは、U16 が作った `PageMeta`（title・description・canonical の3つ組）の**出口を1つ増やすこと**で、そのぶんの実装はほぼ `lib/seo/pageMeta.ts` の `toMetadata()` の中にある。

```
PageMeta { title, description, canonical }
   │
   ├─ toMetadata()  ── Metadata { title, description, alternates, openGraph, twitter }
   │                          ↑ og:title / og:description / og:url はここで同じ値から出る
   │
   └─ usePageMeta() ── DOM（<title> / description / canonical / og:title / og:description / og:url）
```

新しく増えたファイルは4つ。

| ファイル | 役割 |
| --- | --- |
| `web/lib/seo/openGraph.ts` | `og:` の組み立て。ページによらない部分と `PageMeta` から出る部分 |
| `web/lib/seo/jsonLd.ts` | `WebSite`・`BreadcrumbList` の中身と、`<script>` に入れる文字列化 |
| `web/lib/seo/JsonLd.tsx` | それを置くだけのサーバーコンポーネント |
| `web/lib/seo/paths.ts` | `agePath()`・`industryPath()`・`companyPath()`（`ranking.ts` から分けた） |

## `og:` は `toMetadata()` の中でしか組み立てない

**AC-11 が要求しているのは「`og:url` と canonical が同じ文字列であること」**で、これは非正規URLでこそ効く。`/?age=35&ind=銀行業` の canonical は `/?ind=銀行業` に寄る（ADR-0006）ので、`og:url` を別の場所で `location.href` から作ると**canonical は寄せ先を指し `og:url` は自分自身を指す**という状態になる。貼られた先の評価が正規URLへ渡らない。

だから `og:` の入口は `toMetadata()` 1つに閉じた。`PageMeta` を返す関数（`rankingPageMeta`・`companyPageMeta`・`aboutPageMeta`）はどれも `og:` を知らない。

**`/about` の文言を `lib/seo/about.ts` へ出したのはこのため。** `app/about/page.tsx` が素の `Metadata` を直書きしていて、そこだけ `toMetadata()` を通っていなかった。文言は1文字も変えていない。

### レイアウト側は `/_not-found` のためだけにある

Next.js のメタデータは**浅くマージされる**。`openGraph` は入れ子ごと差し替わるので、ページが `openGraph` を返した時点でレイアウトのものは1つも残らない。つまり `app/layout.tsx` の `openGraph` が実際に出るのは**ページが `generateMetadata`／`metadata` で `openGraph` を返さないルートだけ**で、いまはそれが `/_not-found` にあたる。

`OPEN_GRAPH_DEFAULTS` を `openGraph.ts` に置いて両方から読むのはそのため。**レイアウトには `og:url` を入れていない**——404 に正規URLは無い。

### `twitter:` はカードの種類だけ宣言する

`twitter: { card: "summary_large_image" }` しか書いていないが、実際に返るHTMLには `twitter:title`・`twitter:description`・`twitter:image` も並ぶ。これは Next.js が `title`・`description`・`openGraph.images` から自動で埋めたものである。**同じ文言を2か所に書いてはいない。**

## クライアント側も `og:` を書き換える

`usePageMeta` の `applyPageMeta` に3行足した（`og:title`・`og:description`・`og:url`）。

**SNS のクローラは JS を実行しないので、共有カードの見え方はこれで変わらない。** それでも書くのは、**DOM の上でも「`og:url` は canonical と同じ」を保つ**ため。片方だけ動く状態を作ると、次にここを読む人がどちらが正か判断できなくなる。`e2e/metadata.spec.ts` の突き合わせに3つとも足してある。

`og:site_name`・`og:type`・`og:locale`・`og:image` は状態で変わらないので触らない。

## OG画像

**v1は全ページ共通の静的1枚**（spec 4.3）。白地に、ブランド色のシンボル＋ワードマーク、短い罫、説明文2行だけ。地の色とシンボルの色は S4 のアイコンと同じ組み合わせで、**新しい色は1つしか増やしていない**（`web/lib/brand/colors.ts` の `BRAND_TEXT`。`tokens.css` の `--foreground` と一致することを `colors.test.ts` が固定している）。

**数字を1枚も載せない。** 社数も金額も、載せると年1回のデータ更新のたびに焼き直しが要るうえ、**更新を忘れた1枚が各SNSのキャッシュに残る**。見出しと説明文はプラットフォームが `og:title`・`og:description` として別に出すので、絵が担うのはブランドの識別だけでよい。

**公開ホスト（`openreport.net`）も載せない。** 初版は説明文の下に小さく置いていたが、**貼られたカードにはURLが別枠で出る**ので、絵の中の1行は情報を足さないまま広告の体裁だけを持ち込んでいた（運営者の指摘で外した）。外したぶんの余白は詰めず、残った3要素が天地でほぼ中央に来る位置に落ち着いている。

### 文字はアウトラインで持つ

**`sharp`（librsvg）の `<text>` は実行環境の fontconfig を引く。** 日本語フォントの入っていない機械で `npm run build:brand` を回すと、豆腐（□）が並んだ画像が焼ける——そして**寸法もバイト数もカラータイプも正しいままなので、`assets.test.ts` が見ている性質は全部通る。** 気づけるのは、公開後に誰かが SNS に貼ったときになる。

そこで文字は座標で持つことにした。

- `pipeline/brand/lettering.ts` — ワードマークと説明文2行の輪郭。ベースラインを原点に、フォントサイズ100の座標系で1文字列ずつ。**生成物なので手で編集しない**
- `pipeline/brand/outline.py` — それを吐く道具。fontTools でグリフの輪郭を取り出す。**ふだんは回さない**（出力がコミットしてある）

字は Liberation Sans Bold（ワードマーク。デザイン案のフォールバックである Arial と字幅が同じ）と IPAGothic（説明文）で組んだ。**フォントそのものは配っていない**——出るのはこの文字列の輪郭を写した座標である。

合計 11KB。`pipeline/` の中だけにあり、web のバンドルにも `public/` にも入らない。

### 図形は書き写さない

シンボルは `pipeline/brand/symbol.ts` から取る。S4 の `symbolSvg()` が中でやっていた「収める正方形に合わせて拡大・平行移動する」部分を `symbolMark()` として切り出し、ファビコンと OG画像の両方がそれを呼ぶ。**図形の定義は1か所のまま**で、`symbolSvg()` の出力は S4 のときと1バイトも変わっていない。

### 版面が壊れていないことを2つの角度から見る

- `pipeline/brand/og.test.ts` — SVG に `<text>` が1つも無いこと、3つのアウトラインが全部入っていること、右と下の余白を割っていないこと（`ogOverflow()`。`build-brand.ts` は焼く前にこれを呼んで落ちる）、書いてある文字に数字が無いこと、公開ホストを載せていないこと
- `web/lib/brand/assets.test.ts` — 焼いた実物が 1200×630 で不透明であること、`alt` が絵の中の文字と揃っていること

**`alt` を `assets.ts` に置いたのは、絵と一緒に直させるため。** 版面を組み替えたときに `alt` だけ古い文言で残ると、画像が出ない環境の読者にだけ嘘が届く。

## 構造化データ

出すのは2種類だけ。

| ページ | 型 | 中身 |
| --- | --- | --- |
| `/`・`/about` | `WebSite` | サイト名と `/` のURL |
| `/company/[id]` | `BreadcrumbList` | 画面のパンくずと同じ3段 |

**`Organization` は出さない**（spec 4.4）。企業ページが表すのは当該企業だが、その主体を名乗るのは我々ではない。

**`WebSite` に `potentialAction`（サイトリンク検索ボックス）を足さない。** ヘッダに検索欄はあるが、Google はこの機能を 2023年に終了している。いま書いても何も起きず、**なぜあるのかを辿れないマークアップだけが残る。**

### パンくずは画面と同じ配列から出す

`features/company/lib/breadcrumb.ts` の `companyBreadcrumb()` が3段（ランキング / 業種 / 会社名）を返し、**画面（`CompanyDetail`）と JSON-LD（`app/company/[id]/page.tsx`）が同じものを読む**（AC-14）。

書き写していたら、業種チップの行き先を直したときに構造化データだけが古い階層を指し、**画面を見ている限り気づけない**。`e2e/social.spec.ts` は文言もURLも書き写さず、**画面のパンくずから読み取ったものと突き合わせる**。

業種のパスは `industryPath()` を通る。sitemap・canonical・パンくずが同じ1本を共有していることが U8 以来の要点なので、そこを増やさない。**`lib/seo/paths.ts` に分けたのはそのため**——`lib/seo/ranking.ts` は `parseSearchParams` や母集団の社数まで抱えていて、パスを1本作りたいだけのクライアントコンポーネントが引くには大きい。`ranking.ts` からは再輸出してあるので、既存の呼び出し側は変わらない。

**末尾（現在地）にも `item` を出す。** 画面ではリンクにしていないが、`ListItem` が指すのは「その段が表すページ」であって、そこにリンクが張ってあるかどうかではない。

### 画面に無い値を書く入口を塞ぐ

企業ページには金額・偏差値・順位・従業員数が揃っているので、`Organization` や `Dataset` に足したくなる。**spec 4.4 が禁じているのはそれ**で、Google の方針に反するだけでなく「根拠を隠した推定値を表示しない」という開発上の約束とも合わない——**読者に見せない数字を検索エンジンにだけ渡すことになる。**

`e2e/social.spec.ts` は JSON-LD の**鍵の集合そのもの**を固定している（`@context` / `@type` / `itemListElement` の3つ）。鍵を1つ足すと落ちるので、足すときは「その値が画面に出ているか」を必ず考えることになる。

## 測ったもの

同じビルド・同じ手順（`next build` → `next start` → `curl`）で前後を測った。**gzip 後の値は同じビルドでも起動ごとに揺れるので、前後は raw で見る**（CLAUDE.md）。

| ページ | raw（前 → 後） | gzip |
| --- | --- | --- |
| `/` | 374,617 → **379,055 B**（+4,438） | 63,383 → **64,092 B** |
| `/company/6861` | 135,800 → **140,967 B**（+5,167） | 18,541 → 19,283 B |
| `/about` | 85,933 → **90,088 B**（+4,155） | 20,585 → 21,162 B |

**AC-16 の予算 75,000 バイト（gzip）に対して 64,092 B。**

**増分が `<meta>` の見た目より大きいのは、Next.js が同じ文言を RSC ペイロードにも流すため。** `og:title` と `og:description` は `<meta>` として1回、`self.__next_f.push(...)` の中でもう1回出るので、**description の長い企業ページで効く**（日本語は UTF-8 で1文字3バイト）。JSON-LD も同じで、`BreadcrumbList` の 380 バイトは2回ぶん出る。

OG画像は 43,995 バイトの PNG で、`public/` に置く静的アセット。ページのHTMLには入らない。

## 決めなかったこと

- **会社ごとのOG画像。** v1は静的1枚（spec 4.3・8.）。1,867社ぶんを動的生成すると Workers の CPU 予算（Issue #118）とエッジキャッシュの設計に踏み込む。効果を見てから
- **`Article` / `Dataset` / `FAQPage`。** どれも画面に無い主張を要求する（spec 4.4）
