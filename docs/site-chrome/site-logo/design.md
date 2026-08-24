# design.md — S4 サイトロゴとファビコン

参照: Issue #163, `docs/site-chrome/spec.md` 6.（AC-21〜AC-28）, `docs/site-chrome/overview.md` S4
意匠: Claude Design `OpenReport Logo & Favicon.dc.html`（プロジェクト `3edfdab4-552f-49d4-b9da-c4ab709decd7`）

出来上がりの内部構造。着手前の段取りは `plan.md`。

## 全体

**3層に分かれる。上の層ほど数が少なく、下の層は上を焼いた結果でしかない。**

```
色     web/lib/brand/colors.ts        hex 3つ（tokens.css から導いた値）
       web/lib/brand/assets.ts       出す先のパスと寸法
図形   pipeline/brand/symbol.ts      リングとチェックの座標・倍率の計算
       pipeline/brand/ico.ts         .ico の器
生成   pipeline/scripts/build-brand.ts → web/public/ に9件
参照   web/app/layout.tsx            metadata.icons / manifest / viewport.themeColor
       web/public/_headers           キャッシュ
```

**図形の定義は `symbol.ts` の1か所だけ。** ファビコン（SVG）・PNG のフォールバック・
アプリアイコン・`favicon.ico` は全部そこから焼く。SVG を手で複製すると「タブの
アイコンだけ古い形」という、誰も見ていない場所で起きる壊れ方をする。

## 色

**`web/lib/brand/colors.ts` が、このリポジトリで hex を書いてよい唯一の場所。**

| 定数 | 値 | 由来 |
| --- | --- | --- |
| `BRAND_COLOR` | `#007595` | `:root` の `--primary`（`oklch(0.52 0.105 223.128)`） |
| `BRAND_COLOR_DARK` | `#00b8db` | `.dark` の `--primary`（`oklch(0.715 0.143 215.221)`） |
| `BRAND_ICON_BACKGROUND` | `#ffffff` | `:root` の `--background`（`oklch(1 0 0)`） |

デザイン案が挙げていた2色は、変換すると**トークンと1ビットも違わなかった**。
新しい色は増やしていない。

**hex が要るのは、CSS 変数が届かない成果物があるため。** ファビコンは独立した
ファイルでページの CSS を読まないし、`theme_color` はブラウザの UI を塗る値で
CSS 変数を受け付けない。画面の中に出るもの（ヘッダのワードマーク）は
`text-primary` を通るので、ここは通らない。

**`eslint.config.mjs` の hex 禁止に `lib/brand/colors.ts` だけ例外を足した。**
例外の代わりに `lib/brand/colors.test.ts` が、3つの値が `tokens.css` の対応する
トークンを sRGB に変換したものと一致することを固定している。**トークンを
差し替えたらここが落ちる**——落ちなければ、配色を変えた次のデプロイでタブの
アイコンだけ前の色のまま残る。

### tokens.css を読む道具を切り出した

`tokens.test.ts` が持っていた oklch のパーサと `:root` / `.dark` ブロックの
読み出しを、`design-system/tokens/oklch.ts` と `readTokens.ts` に出した。
**トークンを検算する側の入口を1か所にする**ため——読み方が2つあると、片方だけが
古い書式に取り残されても気づけない。`oklchToHex()` はこの Unit で足した。

## 図形

デザイン案の座標をそのまま使う。48×48 の座標系で、

- **開いたリング**: `cx=24 cy=24 r=16`・線幅6・`stroke-linecap=round`・
  `stroke-dasharray="73 28"` を `-90°` 回転（左上が開く）
- **チェック**: `M15 25 L22 31 L35 16`・同じ線幅と丸い端

**外接矩形は 5〜43（`SYMBOL_EXTENT` = 38）で、リングが決めている。**
チェックは 12〜38 で内側に収まる。**リングの欠けている側も含めた正方形で測る**
——欠けは意匠上の開口で、図の光学的な中心はリングの中心のままである。
描かれている部分だけで外接矩形を取ると、開いている側にだけ寄った図になる。

`symbolSvg({ size, coverage, stroke, strokeDark?, background? })` が、その外接矩形が
出力の一辺に占める割合（`coverage`）を受けて `translate` + `scale` を組む。

| 成果物 | `coverage` | 理由 |
| --- | ---: | --- |
| `favicon.svg` / PNG / `.ico` | 38/48 ≒ 0.792 | デザイン案の座標系そのまま。余白を足さない |
| `apple-touch-icon` / `icon-192` / `icon-512` | 0.62 | クリアスペース25%（上限 2/3）の内側 |
| `icon-maskable-512` | 0.55 | セーフゾーン（中央80%の**円**）の内側 |

**maskable の上限は 0.8/√2 ≒ 0.566。** 一辺 s の正方形の**対角線**が直径 0.8 に
収まる条件で、辺で測ると角が落ちる端末で欠ける。`symbol.ts` が
`MAX_COVERAGE_MASKABLE` として持ち、`build-brand.ts` が生成前に確かめる。

## 成果物

**パスと寸法の正は `web/lib/brand/assets.ts`。** 使い手が4つあり、どれか1つが
ずれると気づきにくい形で壊れる——生成スクリプト・`layout.tsx`・生成物のテスト・
E2E のリクエスト計測。

| ファイル | 寸法 | 地 | 役割 |
| --- | --- | --- | --- |
| `favicon.svg` | 48 | 透過 | タブ。**濃色サーフェスの分岐を持つ唯一の成果物** |
| `favicon-32.png` / `favicon-16.png` | 32 / 16 | 透過 | SVG を読まない相手へのフォールバック |
| `favicon.ico` | 16・32・48 | 透過 | 固定パスで取りに来る相手 |
| `apple-touch-icon.png` | 180 | 不透明 | iOS のホーム画面 |
| `icon-192.png` / `icon-512.png` | 192 / 512 | 不透明 | manifest の `any` |
| `icon-maskable-512.png` | 512 | 不透明 | manifest の `maskable` |
| `site.webmanifest` | — | — | 名前・`theme_color`・アイコン |

**どれも `public/` に置く静的アセット。** `app/icon.svg` のような Next.js の規約
ファイルにするとルートハンドラになり、**アイコン1枚ごとに Worker が起きる**。
Workers 無料枠の CPU は 10ms/リクエストで、実際に超えたことがある（Issue #118）。
アイコンのために起動数を増やす理由が無い。`public/` のものは `.open-next/assets` に
入り、Cloudflare が Worker を経由せずに配る。

### 濃色サーフェスの切り替えは SVG の中に書く

`<link rel="icon" media="(prefers-color-scheme: dark)">` には**頼らない**。
ブラウザの対応が揃っていないため。SVG の中に

```
<style>.mark{stroke:#007595}@media(prefers-color-scheme:dark){.mark{stroke:#00b8db}}</style>
```

を書くと、いま現行のブラウザは揃って評価する。`stroke` 属性も残してあるのは
`<style>` を読まない相手（ラスタライザ）への保険で、CSS のほうが詳細度で勝つので
切り替えは効く。

**`sharp`（librsvg）はメディアクエリを評価しない。** PNG に焼くのは分岐を持たない
ほうの SVG で、`symbol.test.ts` が「`strokeDark` を渡さなければメディアクエリを
出さない」ことを固定している——入っていても効かないのに、入っていること自体が
「効いているつもり」の誤解を生む。

### 不透明にするものはアルファチャンネルごと落とす

ホーム画面のアイコンは**透過で渡さない**（iOS が透過部分を黒で埋める）。
地の色を敷くだけだと全画素が不透明な RGBA のままなので、`sharp` の `flatten` で
チャンネルごと落としてある。**PNG のカラータイプ1バイトで判る**ようになり、
`assets.test.ts` は画素を全部見ずに済む（透過のものは 6、不透明のものは 2）。

### `/favicon.ico` は置くが `<link>` には出さない

**出すと SVG より先に選ぶブラウザがある。** そちらは濃色サーフェスの切り替えを
持たない。それでもファイルを置くのは、**ページを読まずに `/favicon.ico` を叩く
相手**（RSS リーダー・ブックマークサービス・クローラ）がいるため。

**`sharp` は ICO を書けない**ので器は `pipeline/brand/ico.ts` で組む。中身は BMP
ではなく **PNG をそのまま入れる**——ICO は Windows Vista 以降この形を認め、現行の
ブラウザは全部読める。BMP の DIB を組むと、読む側（`scripts/lib/logo/image.ts` の
`icoToImage`）が相手にしている「高さが2倍・行は下から上・AND マスク付き」を
書く側でも相手にすることになる。

## 生成

`cd pipeline && npm run build:brand`（既定で `../web/public` へ出す）。

**`web/` ではなく `pipeline/` に置いた。** `sharp` を `web/` の依存に足すと、
プラットフォーム別の optionalDependencies が絡んで **Cloudflare の `npm ci` だけが
「lock file とずれている」で落ちる**（CLAUDE.md「開発上の約束」。実際に2回起きた）。
焼くのは年に何度も無い作業なので、`build:data`・`build:logos` と同じ扱いでよい。

**出力はコミットする。** 配るのは静的アセットで、リクエスト時には作らない。
その代わり「スクリプトを回さずに手で差し替えられる」ので、`assets.test.ts` が
`web/public/` の実物を毎コミット走査する（`build-logos.test.ts` と同じ扱い）。

`density: 384` を渡しているのは、既定の 72dpi だと `width` の小さい SVG が
そのままのピクセル数で描かれてから拡大され、輪郭が甘くなるため。

## 参照

`app/layout.tsx` の `metadata.icons` に `assets.ts` の表から並べる。**SVG を先頭に
置く**（ブラウザは並びも手がかりにする）。`viewport.themeColor` は Next.js 16 では
`metadata` ではなく `viewport` の側にある。

**`themeColor` は表示モードで出し分けない。** ライト/ダークの選択は `<html>` の
クラスが正でサーバーには送らない（`site-header-theme/design.md`）ため、ここで
モードを見ることはできない。1色に決め打つ。

`web/public/_headers` には `/logos/*` と同じ
`public, max-age=604800, stale-while-revalidate=2592000` を9件ぶん書いた。
固定パスなので `immutable` にはできないが、中身が変わるのはロゴを描き直したときだけ。

## ヘッダのワードマーク

`BrandLink` に `text-primary` を足しただけ。**文字のまま**で、`/` の上では
`pushRankingReset()` を呼ぶ振る舞いも変えていない。デザイン案も「ヘッダーは
ワードマークのみ」で、画像にすると選択・検索・拡大のどれでも文字に劣る。

## テストの分担

| 何を | どこで |
| --- | --- |
| hex がトークンと一致する（AC-26） | `web/lib/brand/colors.test.ts` |
| 倍率と中央寄せ・セーフゾーンの上限 | `pipeline/brand/symbol.test.ts` |
| `.ico` の器（ヘッダ・オフセット・256の表し方） | `pipeline/brand/ico.test.ts` |
| 焼いた実物の寸法・透過の有無・manifest・`_headers`・旧ファビコンが無いこと（AC-21〜AC-24） | `web/lib/brand/assets.test.ts` |
| HTML に参照が出る・全部 200 で返る・ヘッダの色（ライト/ダーク）・390px（AC-21〜AC-27） | `web/e2e/branding.spec.ts` |

**見るのは性質であって画素ではない。** 画素を固定すると、線を1本引き直すたびに
テストを直すことになり、そのとき何も守らない。

**E2E の色は hex と突き合わせない。** `getComputedStyle` が返す形式は
ブラウザで違う（`rgb()` / `oklch()` / `lab()`）ので、**同じページの中で
`var(--primary)` を当てた要素と文字列比較する**。形式が何であれ、同じ色なら
同じ文字列になる。

### `e2e/network.ts` を広げた

「操作中にネットワークリクエストが発生しない」テストは `/favicon.ico` だけを
除いていた（Chromium 141 が `pushState` のたびに取り直すため）。SVG のファビコンを
出すようにしたので、**取り直される先は `/favicon.svg` にもなる**。しかもファビコンの
リクエストは `resourceType()` が `image` にならないことがあり、既存の画像の除外にも
掛からない。除外の対象を `assets.ts` の表から引くようにした。

## HTML サイズ（AC-28）

同一手順（`npm run build` → `npx next start` → `curl`）で main と前後を測った。
値は main が `cfe61df`（W1・P0・P1 と R0 のリバートまで入った時点）のもの。

| ページ | main | S4 | 差 |
| --- | ---: | ---: | ---: |
| `/` raw | 373,821 B | 374,617 B | +796 |
| `/` gzip | 63,655 B | 63,843 B | +188 |
| `/company/[id]` raw | 111,973 B | 112,769 B | +796 |

**main が3回進んでも差は +796 B のまま**だった（R0 の投入・R0 のリバート・W1 の
追加をまたいで測り直している）。`/company/[id]` の絶対値だけが W1 の働きやすさの節で
増えている。

予算は gzip 75,000 B（AC-28・AC-16）なので余裕がある。**共通ヘッダと `<head>` に
足したものなので、全ページに同じだけ効く。**

内訳は `<head>` が +286 B（`<link>` 4本と `<meta name="theme-color">`。旧の
`<link rel="icon" href="/favicon.ico?…" sizes="256x256">` 99 B と入れ替わっている）、
本文が +510 B。**本文が増えるのは、Next.js がメタデータを本文の後ろにも流すため**
（`docs/ranking/metadata-sync/design.md` で U16 が踏んだのと同じ仕組み）。

**gzip の値は同じビルドでも `next start` の起動ごとに揺れるので、前後は raw で見る。**

## 公開後に直したもの

（まだ無い）

## モックに合わせなかったもの

| モック | 実装 | 理由 |
| --- | --- | --- |
| `logo-wordmark.svg` / `logo-wordmark-dark.svg` | 置かない | ヘッダは文字のまま。SVG の `<text>` は環境のフォント次第で字形が変わるうえ、選択も検索もできない |
| ヘッダ例の「クチコミを書く」「無料登録」 | 作らない | このサイトに存在しない要素 |
| manifest の `description`「企業の公式情報を、オープンに。」 | 「有価証券報告書ベースの平均年収ランキング」 | 前者はモックの仮のコピーで、このサイトが出しているものと違う |
| `favicon-48.png` / `favicon-192.png` の単体配布 | 出さない | 48 は `.ico` の中に、192 は `icon-192.png` として既にある |
