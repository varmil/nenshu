# U16 表示状態とメタデータの同期 — design.md

Issue: [#135](https://github.com/varmil/nenshu/issues/135)（親 [#130](https://github.com/varmil/nenshu/issues/130)）
仕様: `docs/ranking/spec.md` AC-16 ／ 分解: `docs/ranking/overview.md` U16
関連: ADR-0004（フルSSR）・ADR-0006（公開URL戦略）・ADR-0007（表示基準）

出来上がりの内部構造。着手前の段取りは plan.md にある。

## 何が壊れていたか（実測）

親 Issue は `https://openreport.net/?age=40` のタイトルが実測値のものになっていると報告している。**サーバーが返すHTMLは正しかった。**

| URL | `<title>` | `<link rel="canonical">` |
| --- | --- | --- |
| `/` | `OpenReport \| 有価証券報告書ベースの平均年収ランキング 1,867社` | `https://openreport.net` |
| `/?age=40` | `40歳年収ランキング \| OpenReport` | `https://openreport.net/?age=40` |
| `/?ind=銀行業` | `銀行業の平均年収ランキング \| OpenReport` | `https://openreport.net/?ind=…` |

（2026-08-22・本番へ `curl` で実測。U8 が入っている。）

**壊れていたのは画面の中で切り替えたときだった。** ブラウザで `/` を開いて「年齢そろえ」を押すと、URL は `/?age=35` になるが `<title>`・`meta[name="description"]`・`link[rel="canonical"]` は `/` のまま残る。親 Issue に貼られている文言は、この状態の DOM をそのまま写したものである。

原因は AC-7 の実装そのもの。**操作でネットワークを起こさないために URL は `history.pushState` で書き換えており**（`lib/history/useLocationSyncedState.ts`）、Next.js のメタデータはサーバーが描画したときの1回きりしか出ない。状態・URL・表示は同期しているのに、**メタデータだけが最初のURLに取り残される**。

読者から見える影響は3つ。タブの見出しが実際に見ている絞り込みと合わない。ブックマークと履歴に間違った名前で残る。**企業詳細ページではタイトルに金額が入っているので、`株式会社キーエンスの平均年収 | 有価証券報告書は2,178万円` のまま25歳そろえ（788万円）の画面を見ることになる。**

## 構造

### `lib/seo/pageMeta.ts` — 1ページぶんのメタデータ

```ts
interface PageMeta { title: string; description: string; canonical: string }
function toMetadata(meta: PageMeta): Metadata
```

**文言はここを通る形1つだけになる。** サーバーは `toMetadata` で Next.js の `Metadata` に包み、クライアントは同じ `PageMeta` を DOM に書く。書き写して2つ目を作らない——同じ文言が2か所にあると、片方だけ直した状態に必ずなる。

`canonical` は**サイト内の相対パス**で持つ。絶対URLにするのは、サーバーでは `metadataBase`（`app/layout.tsx`）、クライアントでは `absoluteUrl()`（`lib/seo/site.ts`）。オリジンを書く場所は `SITE_ORIGIN` の1か所のまま（ADR-0006）。

### 文言を組み立てる純粋関数（施策ごとに1つ）

| 関数 | 置き場所 | サーバー側の呼び出し | クライアント側の呼び出し |
| --- | --- | --- | --- |
| `rankingPageMeta(params, companies, industryCount)` | `lib/seo/ranking.ts` | `app/page.tsx` の `generateMetadata` | `RankingApp` |
| `companyPageMeta(view, targetAge)` | `lib/seo/company.ts` | `app/company/[id]/page.tsx` の `generateMetadata` | `CompanyDetail` |

`rankingMetadata` / `companyMetadata` は `toMetadata(…PageMeta(…))` を返すだけの薄い包みで、`generateMetadata` の側は形が変わっていない。**`companyPageMeta` はこの Unit で新しく切り出した**——C1 以来 `generateMetadata` の中に直書きされており、クライアントから引けなかった。

**ランキング側はURLを入口にする。** `RankingApp` は `RankingState` を持っているが、そこから直接文言を組まず `buildSearchParams(state)` でURLを作ってから `rankingPageMeta` に渡す。サーバーが見るのは `searchParams` なので、同じ入口を通しておかないと「操作して着いたURL」と「そのURLを直接開いたとき」で文言がずれうる。`buildSearchParams` は `useRankingState` が URL に書くのと同じ関数である。

### `lib/seo/usePageMeta.ts` — DOM への反映

```ts
function applyPageMeta(meta: PageMeta): void   // 値が違うときだけ書く
function usePageMeta(meta: PageMeta): void     // 状態が変わるたびに反映し続ける
```

決めごとが4つある。

**すでに head にある要素だけを書き換える。無ければ作らない。** `<title>`・`meta[name="description"]`・`link[rel="canonical"]` は React が描いたものなので、こちらで足すと React が知らない要素が head に残り、別のルートへ遷移しても消えずに二重になる。属性を書き換えるぶんには衝突しない。

**依存に置くのはオブジェクトではなく3つの文字列。** 呼び出し側は描画のたびに `PageMeta` を組み直してよい（毎回別のオブジェクトになる）ので、オブジェクトを依存にすると毎描画で effect が走る。

**書いたら終わりにできない。React が `<title>` を書き戻す。** Next.js はページのメタデータを本文の後ろに流し、React が届いた時点で head へ移す。**読み込み直後（実測でおよそ1秒以内）に表示基準を切り替えると、こちらが書いた直後に React のハイドレーションが `<title>` の中の文字だけを元に戻す。** `description` と `canonical` は属性なので戻らない——つまり**タイトルだけが実測値のまま残る**という、直そうとしている症状そのものが再現する。`MutationObserver` で head を見張り、食い違っていたら書き直す。実測した変化の順序は次のとおり。

```
childList TITLE        ← こちらの書き込み
attributes META        ← 〃
attributes LINK        ← 〃
characterData #text    ← React が <title> の中身を元に戻す
```

書き戻しは読み込み直後の1回きりなので、以降このコールバックは「食い違っていない」を確かめて何もしない。**この経路は待ち時間を入れれば消える種類の食い違いなので、E2E で `goto` の直後に押していないと再現しない**（1.5秒待ってから押すテストでは通ってしまう）。

**自分のパスを離れたら書かない。** `useLocationSyncedState` と同じ線（U14）。ページ間の遷移では、行き先のメタデータが React によって描かれてから、こちらの後片付け（`observer.disconnect()`）が走ることがある。パスを見ずに書き戻すと**行き先のタイトルを前のページのものへ塗り替える**。

`useEffect` で足りる。タイトルはページの中に描かれないので、`useLayoutEffect` にしても読者の目に映るものは変わらない。

## 寄せ先の文言がそのまま出る

`?age=45&ind=海運業` のように**寄せる側のURL**にいる間は、canonical と同じく**寄せ先（`/?ind=海運業`）の文言**が出る。画面は45歳そろえの海運業7社だが、タイトルは `海運業の平均年収ランキング | OpenReport` になる。

**これは意図した挙動で、この Unit で変えない。** 非正規URLに固有の文言を作らない、というのは U8 が決めた線である（`lib/seo/ranking.test.ts`「寄せ先の title を返す。非正規URLに固有の title を作らない」）。ここで「海運業の45歳年収ランキング」を新しく作ると、canonical が指す先と名乗りが食い違い、**同期させるために直しているものを別の形で作り直すことになる**。

## ページのサイズ

**HTML は1バイトも増えていない。** `next start` に対して同じ手法で測った実測値（2026-08-22）。

| ページ | 変更前 raw | 変更後 raw |
| --- | --- | --- |
| `/` | 355,640 B | 355,640 B |
| `/company/6861` | 87,771 B | 87,771 B |

DOM に出るものが増えていないので当然ではあるが、**メタデータの同期をサーバー側の埋め込みでやらなかったこと**の裏返しでもある（状態ごとの文言を全通りHTMLに入れる、という作りにはしていない）。増えるのはクライアントの関数1つぶんだけ。

## 変えていないもの

- **canonical の寄せ先（ADR-0006）。** インデックス対象は `/`・`/?age=N` 8件・`/?ind=X` 33件・`/company/[id]` 1,867件の計1,910 URL のまま。`e2e/seo.spec.ts` がそれを見ている。
- **メタデータの文言。** SSR が返していたものをそのまま純粋関数へ移しただけで、1文字も書き換えていない。**この Unit は「文言を良くする」ではなく「出どころを1つにして同期させる」。**
- **`/company/[id]` の canonical は表示基準に依らず素のURL。** `?age=N` を付けると1,867社×9基準の16,803 URL を申告することになる。それでも `PageMeta` には含める——含めないと「メタデータはこの関数が全部持つ」が崩れ、canonical だけ別の場所を見ることになる。
- **`h1` の文言。** `/` の `h1` は「平均年収ランキング」／「35歳年収ランキング」で既に表示基準に追従している（U11）。タイトルとは別物で、こちらは触っていない。

## 対象外

- **OGP・JSON-LD**（site-chrome の S2・Issue #116）。**S2 は `PageMeta` に `og:title`・`og:url` を足す形になる**——`rankingCanonical()` を通すことは U8 の時点で決まっており、`applyPageMeta` にも同じ要素を足せば切替に追従する。
- **履歴エントリの名前。** ブラウザが履歴に記録する名前は `pushState` の時点のタイトルなので、こちらが後から書いてもその項目には反映されない場合がある。戻ったときに正しいタイトルになることは E2E で見ている。

## テスト

**単体（`lib/seo/`）** — 文言と、文言が1か所から出ていること。

- `ranking.test.ts` — `RankingState` から `buildSearchParams` 経由で引いても、URLから引いたときと同じ文言になること。`rankingMetadata` が `toMetadata(rankingPageMeta(...))` と等しいこと。
- `company.test.ts` — 表示基準ごとにタイトルが変わること（5基準で5通り）。実測値では「推定」の語を出さないこと（AC-9）。canonical は基準に依らないこと。
- `pageMeta.test.ts` — `canonical` を相対パスのまま `alternates` に入れること。

**E2E（`e2e/metadata.spec.ts`、10件）** — 操作したあとの DOM。

**判定は「同じURLを直接開いたときの値と一致するか」にしてある。** 文言をテストに書き写すと、文言を直すたびにテストも直すことになり、そのとき何も守らない。`page.url()` をそのまま `request.get()` に渡して、JS を実行していないHTMLと DOM を比べる。

修正前のコードでは10件中9件が落ちる（残る1件は「戻ったあとのタイトル」で、Next.js のルーターがルートを描き直す経路なので元から通っていた）。
