# U8 検索エンジン向け導線 — plan.md

参照: Issue [#53](https://github.com/varmil/nenshu/issues/53), `docs/ranking/spec.md` 5., ADR-0006（インデックス戦略）, ADR-0007（表示基準）
依存: #8（U7）, #52（C1）, #80（U12・業種チップ＝リンクハブ）

## Context

North Star KPI は自然検索からの月間セッション数（`docs/ranking/intent.md`）だが、いま検索エンジンに渡している手がかりが1つも無い。

- `/sitemap.xml` が 404。**トップページから辿れる企業ページは1ページぶん（30社）だけ**で、残り1,800社超にクロール経路が事実上ない
- `<link rel="canonical">` がどのページにも無い。`?age=` 8通り・`?ind=` 33通り・`emp`・`ten`・`aage`・`q`・`page`・`sort` の組み合わせが、中身の重なるURLとして無制限に生える
- `/robots.txt` は Cloudflare が自動で挿す Content Signals のコメントだけを返しており、`Sitemap:` 行が無い

ADR-0006 が「どのURLをインデックスさせ、どれを寄せるか」を既に決めている。**この Unit はそれを実装するだけで、新しい方針は作らない。** ただし ADR-0006 が「U8 の実装時に再考する」と明記している1点（`?age=N&ind=X` の寄せ先）だけは、ここで決め直す。

前提だったドメインは 2026-08-21 に取得済み（`openreport.net`）。`docs/ranking/spec.md` 5. の未決事項を1つ閉じる。

## `?age=N&ind=X` の寄せ先を年齢側から業種側へ変える

ADR-0006 は当初これを `/?age=N` に寄せていた。理由は「年齢補正がこのサイトの主軸だから」で、ADR 自身が **ADR-0007 で既定が実測値になった時点でその前提は弱まった**と書き残している。

決め直しの根拠は主軸の置き方ではなく、**どちらと重複しているか**にある。

| URL | 並ぶ会社 | 金額の基準 |
| --- | --- | --- |
| `/?ind=銀行業` | 銀行業のN社 | 実測値 |
| `/?age=35` | 全1,867社 | 35歳そろえ |
| `/?age=35&ind=銀行業` | 銀行業のN社 | 35歳そろえ |

`/?age=35&ind=銀行業` と `/?ind=銀行業` は**同じ会社が同じ順で並ぶ** near-duplicate であり、`/?age=35` とは1,867行と N 行でそもそも別のページになる。canonical は「重複している相手」を指すものなので、業種側へ寄せる。

「銀行業 年収 ランキング」という検索が現実にあり、その受け皿が `/?ind=銀行業` である点も同じ向きを指す。

## 変更するもの

### web（判断を1か所に閉じる）

- `lib/seo/site.ts` — 新規。`SITE_ORIGIN`・`SITE_NAME`・`METADATA_BASE`・`absoluteUrl()`。**オリジンの定義はここだけ**（spec.md 5.）
- `lib/seo/ranking.ts` — 新規。`rankingCanonical()`（ADR-0006 の表を関数にしたもの）と `rankingMetadata()`（canonical と、その canonical が表すページの title・description）。**`page` は寄せずに canonical に付ける**（下記）
- `app/layout.tsx` — `metadataBase` と、受け皿の title・description
- `app/page.tsx` — `generateMetadata`。業種ごとの社数はモジュール初期化で1度だけ数える（`generateMetadata` はリクエストごとに走る。Workers の CPU は10ms）
- `app/about/page.tsx` — 自己canonical と、description に有価証券報告書を入れる（唯一触れていなかった）
- `app/company/[id]/page.tsx` — 自己canonical。**`?age=N` は付けない**（1,867社×9基準＝16,803 URL をインデックスさせない）
- `app/sitemap.ts` — 新規。約1,910 URL
- `app/robots.ts` — 新規
- `features/ranking/components/RankingPagination.tsx` — `state.page` を総ページ数に丸め、範囲外のページへ `href` を出さない
- `next.config.ts` — `/sitemap.xml`・`/robots.txt` を既存ページと同じキャッシュに乗せる

**sitemap と canonical は同じ関数（`agePath` / `industryPath`）を通す。** 別々に組み立てると、載せるURLと canonical が1文字ずれても気づかない。

### インフラ（Cloudflare）

- `wrangler.jsonc` に `"workers_dev": false` → **これが無いと次のデプロイで wrangler が workers.dev を有効に戻す**。カスタムドメインを付けたあとも `nenshu.<subdomain>.workers.dev` が本番と同じHTMLを200で返しており、同じサイトが2つのホストにある状態になっていた（2026-08-21 に実測）

リンクハブは U12 の業種チップ（33件）と年齢スイッチ（8件）で足りているので作らない（`docs/ranking/overview.md`）。

### ページ送りを `/` へ寄せない（ADR-0006 の表からの2点目の変更）

`/?page=2` は `/` の複製ではない。実測すると `/` の会社リンクは30件、`/?page=2` も30件で、**1社も重ならない**。しかも**ページから `<a href>` で辿れる企業ページは30件だけ**で、残り1,837社への内部リンクはページ2〜63の中にしか存在しない。先頭へ寄せると、Google はページ2以降のクロール頻度を落とし、その経路を細める。Google のページネーション指針も先頭ページへ寄せるなと明記している。

canonical は「ベース + page」にする。sitemap は変わらない（載せるのは1ページ目だけ）。

合わせて、`?page=999` が200で最終ページを返しつつ `?page=1000` へリンクしている問題を直す。クローラが際限なく歩ける状態だった（実測）。

## 「有価証券報告書」の露出

差別化要因（`docs/ranking/intent.md`）が SERP に出ていない。**description は全ページに入れ、タイトルは `/` だけに入れる。** 競合6社を実測した結果と、`?age=N`・`?ind=X` に入れない理由は design.md に書いた。

### ドキュメント

- `docs/adr/0006-public-url-strategy.md` — `?age=N&ind=X` の寄せ先を決め直した追記
- `docs/site-chrome/spec.md` 1.4 — `/` のタイトルを更新（ブランド先頭は維持）
- `docs/ranking/spec.md` 5. — ドメインの未決を閉じる
- `docs/ranking/overview.md` — U8 を実装済みに
- CLAUDE.md の「現在地」

## テスト

- 単体: `lib/seo/ranking.test.ts`・`lib/seo/site.test.ts` — ADR-0006 の表を1行ずつ。不正値（`age=33`・`emp=xyz`・存在しない業種名）が寄せる判断に混ざらないこと、既定値と同じクエリ（`page=1`・`sort=salary`・`q=`）が「効いている」と見なされないこと
- E2E: `e2e/seo.spec.ts` — **単体では足りない**。判断が実際に `<link rel="canonical">` として初期HTMLに入り、`metadataBase` が効いて絶対URLになるかは、Next.js のメタデータ解決を通らないと分からない。sitemap の1,910件と重複ゼロもここで固定する

## 検証

1. `cd web && npm run lint && npm run typecheck && npm test && npm run build`
2. `npm run test:e2e`
3. `npx next start` に対して `/`・`/?age=35`・`/?ind=銀行業`・`/?age=35&ind=銀行業`・`/?emp=1000-`・`/about`・`/company/6861`・`/company/6861?age=35`・`/sitemap.xml`・`/robots.txt` を実際に取得して目で見る
4. PR（`Closes #53`）
5. マージ後、本番で `/sitemap.xml` が返ることを確認し、Search Console に登録する

## リスク

- **sitemap と canonical のズレ。** ルートだけ Next.js が `https://openreport.net`（末尾スラッシュ無し）に正規化するので、`absoluteUrl("/")` を同じ形にそろえてある。`site.test.ts` で固定する
- **業種名のエンコード漏れ。** sitemap.xml はエスケープ済みURLを要求する。`industryPath` を必ず通す
- **`generateMetadata` の重さ。** Workers Free の CPU は10ms。業種ごとの社数（1,867回のインクリメント）をリクエストごとに数え直さない
- **robots.txt を Cloudflare が上書きする可能性。** 現在 Cloudflare の管理robots.txt が Content Signals のコメントを挿している。アプリが200を返すようになったあと `Sitemap:` 行が残るかは、デプロイ後に本番で確認する
