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

**全ページ共通の静的1枚**（spec 4.3）。白地に、ブランド色のシンボル＋ワードマーク、見出し2行、横罫、そして**母集団の数値の帯**（対象社数・全体平均・対象期間と出典）。地の色とシンボルの色は S4 のアイコンと同じ組み合わせで、増えた色は `--muted-foreground`（ラベルと出典）と `--border`（罫）の2つ（`web/lib/brand/colors.ts` の `BRAND_MUTED`・`BRAND_RULE`。`tokens.css` の値と一致することを `colors.test.ts` が固定している）。

**公開ホスト（`openreport.net`）は載せない。** 初版は説明文の下に小さく置いていたが、**貼られたカードにはURLが別枠で出る**ので、絵の中の1行は情報を足さないまま広告の体裁だけを持ち込んでいた（運営者の指摘で外した）。

### 数字を載せる（2026-08-26 に方針を変えた）

初版は**数字を1枚も載せていなかった**。社数も金額も、載せると年1回のデータ更新のたびに焼き直しが要るうえ、**更新を忘れた1枚が各SNSのキャッシュに残る**——というのがその理由で、絵が担うのはブランドの識別だけでよい、と決めていた。

**運営者の指示で版面を差し替え、`2,961社`・`693万円`・`2025年3月期〜2026年5月期` を載せることにした。** 口コミベースの数字と並んだときに「有価証券報告書の数値のまま」であることが読み取れる、というのが元の狙いだが、**規模と時点が絵の中にあるほうがそれは速い**。見出しと説明文をプラットフォームが `og:title`・`og:description` として別に出すことは変わらないので、絵はそこと同じことを言うのではなく、**数字で言う**。

**載せると決めた以上、焼き直しを忘れないことが版面の条件になる。** 対にしたのは次の2つで、どちらか片方では足りない。

- **数字は `web/public/data/` から引く**（`build-brand.ts` の `readOgFacts()`）。`og.ts` にも `outline.py` にも直書きしない。社数は `companies.meta.count`、全体平均は `stats.population[0].mean` を `toManYen()` で丸めた万円（**先頭が実測値の列であること**を確かめてから採る。年齢そろえの列を採ると絵の「有価証券報告書の数値のまま」と食い違う）、対象期間は `fiscalPeriodLabel(companies.meta)`。**どれも画面と同じ1か所を通す**
- **焼いた値を `web/lib/brand/ogFacts.ts` に残す**（`build-brand.ts` の出力）。`ogFacts.test.ts` がそれといまの `public/data/` を突き合わせるので、**`build:data` だけ回して `build:brand` を忘れるとテストが落ちる**

**SNS 側のキャッシュに古い1枚が残りうることは変わらない。** ただし残るのは「前回のデータの社数と平均」で、出典も体裁も同じである——年1回のデータ更新でこの3つが動く幅（社数が数百社、平均が数万円、期が1年）は、カードとして誤読を招くものではないと判断した。

**`alt` も焼いた値から組む**（`OG_IMAGE.alt` が `ogFacts.ts` の `alt` を読む）。書き写すと、焼き直したときに**代替テキストだけ古い数字で残る**——画像が出ない環境の読者にだけ嘘が届く。

### 文字はアウトラインで持つ

**`sharp`（librsvg）の `<text>` は実行環境の fontconfig を引く。** 日本語フォントの入っていない機械で `npm run build:brand` を回すと、豆腐（□）が並んだ画像が焼ける——そして**寸法もバイト数もカラータイプも正しいままなので、`assets.test.ts` が見ている性質は全部通る。** 気づけるのは、公開後に誰かが SNS に貼ったときになる。

そこで文字は座標で持つことにした。

- `pipeline/brand/lettering.ts` — ワードマークの輪郭と、**字の表**（和文・欧文）。ベースラインを原点に、フォントサイズ100の座標系。**生成物なので手で編集しない**
- `pipeline/brand/outline.py` — それを吐く道具。fontTools でグリフの輪郭を取り出す。**ふだんは回さない**（出力がコミットしてある）
- `pipeline/brand/text.ts` — 字の表から文字列を組む（`textSvg()`・`textWidth()`）

**文（`有価証券報告書ベースの`）ではなく字（`有`・`価`・…）で持つ。** 数字を載せると決めた時点で、文字列は**焼く直前にデータを読んで初めて決まる**ようになった。文ごと持つと社数が変わるたびに `outline.py` を回すことになり、それには fontTools と日本語フォントの入った機械が要る——**データを作り直すたびにその機械を要求するのは、焼き直しを忘れる理由になる。**

字は Liberation Sans Bold（ワードマーク。デザイン案のフォールバックである Arial と字幅が同じ）、IPAGothic（和文）、Liberation Sans Regular（数字と欧文）で組んだ。**混植の境目は「コードポイントが ASCII か」の1行だけ**（`text.ts`）——字種で分けると、字を足すたびに規則が増える。IPAGothic の欧文を使わないのは固定ピッチだからで、`2,961` や `EDINET` が間延びして見える。

**太字は縁取りで作る**（`textSvg` の `weight`）。IPAGothic にボールドが無い。別の和文フォントを持ち込む案は、`outline.py` を回す機械にそのフォントを要求することになり、字の表を持つ理由（どの機械でも同じ絵が焼ける）と噛み合わない。

**表に無い字を使うと `compose` が落ちる**（`outline.py` の `GOTHIC_CHARS` / `SANS_CHARS` に足して回し直せ、というメッセージ付き）。黙って空白になるより落ちるほうがよい——豆腐が並ぶのと同じ壊れ方だからである。

合計 24KB。`pipeline/` の中だけにあり、web のバンドルにも `public/` にも入らない。

### 図形は書き写さない

シンボルは `pipeline/brand/symbol.ts` から取る。S4 の `symbolSvg()` が中でやっていた「収める正方形に合わせて拡大・平行移動する」部分を `symbolMark()` として切り出し、ファビコンと OG画像の両方がそれを呼ぶ。**図形の定義は1か所のまま**で、`symbolSvg()` の出力は S4 のときと1バイトも変わっていない。

### 版面が壊れていないことを2つの角度から見る

- `pipeline/brand/og.test.ts` — SVG に `<text>` が1つも無いこと、シンボルとワードマークが入っていること、版面からはみ出していないこと（`ogOverflow()`。`build-brand.ts` は焼く前にこれを呼んで落ちる）、見出しと数値の帯の文字列、3桁区切りを自前で入れていること、公開ホストを載せていないこと
- `web/lib/brand/ogFacts.test.ts` — **焼いてある数字がいまの `public/data/` と一致すること**
- `web/lib/brand/assets.test.ts` — 焼いた実物が 1200×630 で不透明であること、`alt` が絵の中の文字と揃っていること

**はみ出しの検算は数字が入って重みが増した。** 社数が1桁増える・対象期間が年をまたいで伸びる、で行が伸びる。見出しは右の余白を、数値の帯は**隣の区画（縦罫）**を相手に測る——最後の区画だけは右の余白が相手になる。`ogOverflow()` は手で書いた見本と**いま焼いてある値**の両方で回している。

**`alt` を `assets.ts` に置いたのは、絵と一緒に直させるため。** 版面を組み替えたときに `alt` だけ古い文言で残ると、画像が出ない環境の読者にだけ嘘が届く。**数字が入ってからは書き写す余地も消した**——`ogFacts.ts` の1文をそのまま読む。

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
| `/` | 378,474 → **382,992 B**（+4,518） | 63,727 → **64,444 B** |
| `/company/6861` | 135,790 → **140,957 B**（+5,167） | 18,537 → 19,282 B |
| `/about` | 86,065 → **90,260 B**（+4,195） | 20,642 → 21,233 B |

**AC-16 の予算 75,000 バイト（gzip）に対して 64,444 B。**

「前」は E1（決算期を幅で出す・#172）を取り込んだあとの main で測り直した。**マージの前後で母数が動いたので、古い「前」と新しい「後」を並べない**——E1 は `companies.json` に会社ごとの決算期を足しているので、S2 と関係のないぶんまでこの表の増分に混ざる。

**増分が `<meta>` の見た目より大きいのは、Next.js が同じ文言を RSC ペイロードにも流すため。** `og:title` と `og:description` は `<meta>` として1回、`self.__next_f.push(...)` の中でもう1回出るので、**description の長い企業ページで効く**（日本語は UTF-8 で1文字3バイト）。JSON-LD も同じで、`BreadcrumbList` の 380 バイトは2回ぶん出る。

OG画像は **52,222 バイト**の PNG で、`public/` に置く静的アセット（数字の帯を足して 43,995 B から +8,227 B）。ページのHTMLには入らない。

## 決めなかったこと

- **会社ごとのOG画像。** 静的1枚のまま（spec 4.3・8.）。2,961社ぶんを動的生成すると Workers の CPU 予算（Issue #118）とエッジキャッシュの設計に踏み込む。効果を見てから
- **`Article` / `Dataset` / `FAQPage`。** どれも画面に無い主張を要求する（spec 4.4）
