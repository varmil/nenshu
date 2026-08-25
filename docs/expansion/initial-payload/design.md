# design.md — E0 初回ロードのペイロード方式（全件embedをやめる）

Issue: [#174](https://github.com/varmil/nenshu/issues/174)
spec: `docs/expansion/spec.md` 1.5・AC-5・AC-6 ／ `docs/ranking/spec.md` 3.・AC-7
ADR: [ADR-0013](../../adr/0013-initial-payload-separate-asset.md)・[ADR-0004](../../adr/0004-cloudflare-workers-ssr.md)・[ADR-0012](../../adr/0012-prerender-company-pages.md)

**`/` の HTML が gzip 91,724 B → 19,860 B（−78.4%）になった。** 予算100KBに対する占有は 91.8% → **19.4%**。

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

```ts
if (json?.meta?.version !== version || !Array.isArray(json.rows)) return;  // 捨てる
```

**取れなくても画面には何も出さない。** 読者にとっては「操作するとページが変わる」だけで、壊れてはいない。

## 届くまでの操作

**実ナビゲーションに倒す。** すべての状態は URL にあり、`/` はどの URL でも正しく SSR できる（ADR-0004）ので、遷移すればサーバーが同じ画面を返す。

**分岐は `commit()` の1か所に閉じてある。**

```ts
const commit = (next: RankingState) => {
  if (ready) { setState(next); return; }
  window.location.assign(search === "" ? "/" : `/?${search}`);
};
```

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

## E2E の測り方

**「リクエスト数0」から「届いてから測る」へ**（ADR-0013）。

```ts
await page.goto("/");
await waitForRankingReady(page);      // ← 足した
const requests = collectPageRequests(page);
```

**`/data/companies.json` を除外リストに足さない。** 足すと**操作のたびに取りに行っていても気づけない**——AC-6（操作でネットワークが発生しない）が空文になる。待ってから測れば、その後に飛ぶリクエストは全部操作由来になる。

**待つ相手は `data-ranking-ready` 属性。** `RankingApp` が全件を手にしたときだけ出す。E2E のためだけの印ではなく、**「クライアント側で操作が完結する状態か」という画面の状態**そのものになる。

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

### 生成物

**新しいビルド成果物は作っていない。** `/data/companies.json` は `web/public/data/` に既にあり、クエリを足しただけ。

## 触っていないもの

**サーバーが読むデータの量。** SSR には `companies.json` の全件が要る（1ページぶんを切り出すのに全件のソートと絞り込みが要る）。**cold の `JSON.parse` は Issue #118 の側に残る**（ADR-0013 の「結果」）。

**`stats.json`・`logos.json` の渡し方。** 既に抜いて渡してある（`pickPopulationStats`・`buildLogoMask`）。

**`docs/ranking/spec.md` AC-7。** 操作でネットワークが発生しないことは変わらない——**初回ロードの話であって操作の話ではない。**
