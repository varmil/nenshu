# design.md — E0 初回ロードのペイロード方式（全件embedをやめる）

Issue: [#174](https://github.com/varmil/nenshu/issues/174)
spec: `docs/expansion/spec.md` 1.5・AC-5・AC-6 ／ `docs/ranking/spec.md` 3.・AC-7
ADR: [ADR-0013](../../adr/0013-initial-payload-separate-asset.md)・[ADR-0004](../../adr/0004-cloudflare-workers-ssr.md)・[ADR-0012](../../adr/0012-prerender-company-pages.md)

**`/` の HTML が gzip 91,724 B → 19,860 B（−78.4%）になった。** 予算100KBに対する占有は 91.8% → **19.4%**。

**CPU はほとんど動かない**（床の上で 0.86ms → 0.70ms。下の「実測」）。**この Unit が買ったのは転送量で、Worker の重さではない。**

---

## 何が 78KB だったのか

**動かす前に分けて測った。** `/` の HTML は3つに割れる。

| | raw | gzip | 割合 |
| --- | ---: | ---: | ---: |
| 全体 | 403,082 B | 91,724 B | |
| **RSC ペイロード**（`self.__next_f.push`） | 187,082 B | **78,722 B** | **85.8%** |
| markup（`<script>` を除く） | 214,572 B | 12,715 B | 13.9% |

**RSC ペイロードがほぼ全部だった。** `RankingApp` は `"use client"` なので、props はハイドレーション用データとして HTML に直列化される——そこに `companies`（全2,961社）が丸ごと入っていた。`companies.json` 単体の gzip が 71.6KB なので、**78.7KB のうち大半がそれ**になる。

**#179 との違いはここで数字になる。** あちらは生成物を2つ増やして cold 1.7〜2.0ms を稼ごうとして戻された。こちらが動かすのは**全リクエストに乗る 71KB** で、桁も種類も違う。

## サーバーが渡すもの

`RankingBootstrap`（`features/ranking/types.ts`）。**全社ぶんの配列は入っていない。**

```ts
{
  meta,             // 社数・決算期・取得の窓（画面と title に出る）
  industries,       // 業種名 33件（フィルタの選択肢と業種チップ）
  industryCounts,   // 業種ごとの社数 33件
  page,             // そのURLで表示する1ページぶん（30行）
  logoMask,         // ロゴの有無・2,961文字（gzip 約540B）
  pageLogoIds,      // いま出ている30社のうちロゴを持つID
  dataUrl,          // /data/companies.json?v=<generatedAt のミリ秒>
}
```

**`industryCounts` はサーバーが数えて渡し、全件が届いても数え直さない。** 母集団の内訳なので絞り込みでは変わらない。

**`logoMask` は残す。`ids` に開いて渡さない**——2,509件のIDは gzip でもマスク（約540B）より大きい。開くには `rows` が要るので、**届くまでは `pageLogoIds`（30社ぶん）で代用**する。

**`curves` は渡したまま。** 17系列×10点しかなく、推定年収の計算に要る。

## クライアントが取りに行く

`useCompaniesDataset(dataUrl, version)`（`features/ranking/hooks/`）。初回に1度だけ。

**版が食い違ったら引き継がない。** `/` はブラウザ1時間・エッジ24時間キャッシュされる（ADR-0004）ので、**古いHTMLが新しいJSONを引く**組み合わせが起きうる。**行の並びは `stats.json` の順位表やロゴのマスクと添字で結びついている**——ずれると別の会社の順位やロゴを出す。

**判断は `lib/dataset.ts` の `acceptCompaniesDataset` に出してある。** フックの中に置くと単体テストが書けない（この repo に jsdom は入っていない）。

```ts
if (data?.meta?.version !== version) return null;
if (!Array.isArray(data.rows)) return null;   // 版が合っていても形が違えば捨てる
```

**取れなくても画面には何も出さない。** 読者にとっては「操作するとページが変わる」だけで、壊れてはいない。

## 届くまでの操作

**実ナビゲーションに倒す。** すべての状態は URL にあり、`/` はどの URL でも正しく SSR できる（ADR-0004）ので、遷移すればサーバーが同じ画面を返す。

**分岐は `commit()` の1か所に閉じてある。**

```ts
const commit = (next: RankingState) => {
  if (ready) { setState(next); return; }
  window.location.assign(rankingHref(next));
};
```

**行き先を作るのは `lib/urlState.ts` の `rankingHref`。** `buildSearchParams` の隣に置いてある——URL へ書く綴りと**同じ関数から出す**ためで、ここで組み直すと「絞り込みが1つだけ URL に載らない」といった食い違いが実ナビゲーションのときだけ出る。**既定の状態は `/` にする（`/?` にしない）**——クエリ記号だけが残った綴りは canonical にも sitemap にも無い。

**ボタンごとに書かない。** 表示基準・年齢・並び替え・フィルタ・ページ送り・業種チップ・解除チップは全部 `applyFilter` か `handlePageChange` を通り、その両方が `commit` を通る——**増やしたフィルタで倒し忘れる**（`page` を1に戻すのを1か所にしているのと同じ理由）。

**`useLocationSyncedState`（U14）の3規則は触っていない。** `ready` が `false` の間は `setState` を呼ばないので、フックから見ると「アプリ側の操作が起きていない」状態になる。

## アセットのURLとキャッシュ

**`/data/companies.json?v=<generatedAt のミリ秒>`。**

**クエリで版を切る。** `generatedAt` はビルドのたびに変わるので、新しいビルドは必ず新しいURLを引く。**パスを変えない**ので、ビルド成果物を増やさずに済む（`web/public/data/` に既にある）。

**キャッシュ規則は `public/_headers` に置いた**（`/data/*`）。

```
/data/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=2592000
```

**`lib/cache/headers.ts` ではない。** あちらは `next.config.ts` の `headers()`＝**Worker が返すページ応答**の規則で（ADR-0004）、`/data/*` は `run_worker_first`（`wrangler.jsonc`）に無いため**静的アセットとして直接配られ、Worker を起こさない**。`/logos/*` や `_next/static/*` と同じ経路になる。

**`immutable` にはしない。** 固定パスなので、クエリを付けずに叩かれたときに1年古いデータを掴ませることになる。版はHTML側がクエリで切っている。

## テストが固定するもの

### Unit

**この repo に jsdom は無い**（`vitest.config.ts` は `features/**/*.test.ts` を素の Node で回す）ので、フックそのものは回せない。**判断を純粋な関数に出して、そちらを固定する。**

- `lib/dataset.test.ts` — 版が一致すれば受け入れる／食い違えば捨てる／版が合っていても `rows` が配列でなければ捨てる／`null`・`{}`・`""` でも落ちない
- `lib/urlState.test.ts` の `rankingHref` — 既定は `/`（`/?` にしない）・往復して同じ state に戻る。**倒れた先が同じ state に戻らないと、押した絞り込みが効いていない画面が返る**
- `lib/dataset.test.ts` の「届く前と届いた後でロゴの有無が変わらない」 — **ロゴの経路は2つある**（届く前はサーバーが挙げた `pageLogoIds`、届いた後はマスクを `rows` で開いた集合）。食い違うと**データが届いた瞬間にロゴが消える／現れる**。実物の `companies.json`・`logos.json` に対して5つのURLで数える

### E2E の測り方

**「リクエスト数0」から「届いてから測る」へ**（ADR-0013）。

```ts
await page.goto("/");
await waitForRankingReady(page);      // ← 足した
const requests = collectPageRequests(page);
```

**`/data/companies.json` を除外リストに足さない。** 足すと**操作のたびに取りに行っていても気づけない**——AC-6（操作でネットワークが発生しない）が空文になる。待ってから測れば、その後に飛ぶリクエストは全部操作由来になる。

**待つ相手は `data-ranking-ready` 属性。** `RankingApp` が全件を手にしたときだけ出す。E2E のためだけの印ではなく、**「クライアント側で操作が完結する状態か」という画面の状態**そのものになる。

### 待ちはテストごとに書かせない

**`goto` の直後にクリックするテストは、その時の速さ次第で `pushState` にも実ナビゲーションにもなる。** 落ちるのは履歴を見るテストと、遷移中に取った要素を使うテスト——**全件を並列で回したときだけ2件が落ち、その2件を単体で回すと通った**（「戻ると一つ前の絞り込みに戻る」「従業員数で絞ると全社が1,000人以上」）。

**待ちを `e2e/rankingTest.ts` の1か所に閉じた。** `page.goto` を包んだ `test` を export し、ランキングを触る spec はそこから `test` を取る。**テストごとに `waitForRankingReady` を書く形にしない**——新しく足したテストで忘れたときに**落ちずに不安定になるだけ**なので気づけない。

**待つのは `/` を素で開いたときだけ。** `/about`・`/company/[id]` にこの印は無いので、待つと必ずタイムアウトする。**`waitUntil` を明示した `goto` でも待たない**——ハイドレーション前のHTMLを見るテスト（`e2e/theme.spec.ts` のちらつき防止）は、待った時点でその瞬間を過ぎている。

**届く前の振る舞いそのものは `e2e/initial-payload.spec.ts` が見る**（素の `@playwright/test` を使う）。`/data/companies.json` を `abort` したとき・別の版を返したときに操作が実ナビゲーションに倒れること、上位30社が JS 実行なしのHTMLに入っていること、31社目以降は入っていないこと、操作で取り直さないこと。

## 実測

### ペイロード

`next start` に対して `curl -H 'Accept-Encoding: gzip'`。

| | 前 | 後 | |
| --- | ---: | ---: | --- |
| `/`（gzip） | 91,724 B | **19,860 B** | **−78.4%** |
| `/`（raw） | 403,082 B | 239,345 B | |
| うち RSC ペイロード（gzip） | 78,722 B | **6,778 B** | |
| `/?age=35` | — | 20,473 B | |
| `/?ind=銀行業` | — | 20,114 B | |
| `/?page=2` | — | 20,436 B | |

**どのURLでも 20KB 前後になった。** 前は全社ぶんが**どのURLのHTMLにも入っていた**ので、業種チップを踏んで別のURLへ移るたびにエッジは 90KB のエントリを別々に持っていた。**いまは全部が同じ1つのファイルを共有する。**

**初期表示の30行は HTML に残っている**（`docs/ranking/spec.md` 3.「SEO」）。表の `<tr>` は30行、社数の表示も出る。

### CPU

`wrangler dev --local`（ポート3801）に対して、`/proc/<workerd>/schedstat` の第1フィールドを **60リクエストで割る**（ADR-0012 と同じ手法）。**静的アセット（`/favicon.ico`）を床として一緒に測る。** 前後とも同じコンテナで3回ずつ。

| | 前（3回） | 後（3回） |
| --- | ---: | ---: |
| `/favicon.ico`（床） | 1.78 / 1.81 / 1.86 | 1.82 / 1.73 / 1.82 |
| `/` | 2.79 / 2.60 / 2.66 | 2.46 / 2.47 / 2.53 |
| `/?age=35` | 2.89 / 2.39 / 2.86 | 2.57 / 2.45 / 2.62 |
| `/?ind=銀行業` | 2.63 / 2.69 / 2.73 | 2.54 / 2.73 / 2.57 |

**床の上の実質は 0.86ms → 0.70ms。動いたのは 0.2ms 弱で、ペイロードの −78.4% とは桁が違う。**

**これは想定どおりで、E0 が動かしたのは転送量であって CPU ではない。** リクエストごとに残る仕事——`companies.json` 全件のソート・絞り込み（`buildRankedCompanies`）と、cold の `JSON.parse`——は**そのまま**で、消えたのは「1ページぶんに切り出した後の30行ではなく全2,961社を RSC ペイロードへ直列化する」ぶんだけ。**`/` が Worker を起こし warm 20〜24ms 使うことは変わらない**（Issue #118・#200 の領分）。

**測り方で1つ踏んだ。** `pgrep -f "workerd serve" | head -1` は**コンテナに残っている別のセッションの workerd** を掴む（このコンテナには5本あった）。掴むと4項目とも `0 ms` になり、**エラーにならないので気づけない**。ポート（`entry=localhost:<port>`）で特定する。

### 生成物

**新しいビルド成果物は作っていない。** `/data/companies.json` は `web/public/data/` に既にあり、クエリを足しただけ。

## 触っていないもの

**サーバーが読むデータの量。** SSR には `companies.json` の全件が要る（1ページぶんを切り出すのに全件のソートと絞り込みが要る）。**cold の `JSON.parse` は Issue #118 の側に残る**（ADR-0013 の「結果」）。

**`stats.json`・`logos.json` の渡し方。** 既に抜いて渡してある（`pickPopulationStats`・`buildLogoMask`）。

**`docs/ranking/spec.md` AC-7。** 操作でネットワークが発生しないことは変わらない——**初回ロードの話であって操作の話ではない。**
