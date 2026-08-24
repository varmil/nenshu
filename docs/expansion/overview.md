# overview.md — 掲載企業数の拡大の分解マップ

`docs/expansion/spec.md` を Unit に割る。親 Issue: [#22](https://github.com/varmil/nenshu/issues/22)

**Unit の ID は `E`**（expansion）。Issue は E0 #174・E1 #172・E2 #173・E3 #175・E4 #176・E5 #177・E6 #182。施策ごとの連番という規則は他の施策と同じ（ranking は `U`、company は `C`、site-chrome は `S`、timeseries は `T`、worklife は `W`、logo は `L`、performance は `P`）。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| E1 | [決算期を幅で出す](https://github.com/varmil/nenshu/issues/172) | なし | AC-7 | `dominantFiscalPeriod` の「代表を1つ」をやめる。site-chrome の S3 を改訂する。※共有: `web/lib/data/period.ts` |
| E2 | [母集団の拡大](https://github.com/varmil/nenshu/issues/173) | E1（#172） | AC-1〜AC-4, AC-5b, AC-8 | 取得の窓を12か月に広げる（ADR-0012）。CSV・`build-data.ts`・`ranking` の AC-1・`/about`・product.md まで同じ PR |
| E3 | [ロゴの追随](https://github.com/varmil/nenshu/issues/175) | E2（#173） | AC-8 | 新規社ぶんを `npm run build:logos` で調達する。※共有: `logo` 施策 |
| E4 | [10年推移の追随](https://github.com/varmil/nenshu/issues/176) | E2（#173） | AC-8 | 新規社ぶん10年を取得する。※共有: `timeseries` 施策 |
| E5 | [働きやすさ指標の再突合](https://github.com/varmil/nenshu/issues/177) | E2（#173） | AC-8 | 新しい母集団で `extract.ts` を回し直す。※共有: `worklife` 施策 |
| E6 | [稼ぐ力・レーダーの追随](https://github.com/varmil/nenshu/issues/182) | E2（#173） | AC-8 | 新規社ぶんを `pipeline/performance/extract.py` で抜き直す。※共有: `performance` 施策 |
| E0 | [初回ロードのペイロード方式](https://github.com/varmil/nenshu/issues/174) | なし | AC-5, AC-6 | 全件embedをやめる（ADR-0013）。**拡大の前提条件ではない**（実測で予算内）。余白と Worker の CPU のために入れる。※共有: ranking の絞り込み状態 |

## 実施順序

```
E1 ─→ E2 ─→ (E3, E4, E5, E6 は並列)

E0（独立。E2 の前でも後でもよい）
```

**E1 は E2 より先に入れる。** `dominantFiscalPeriod()` は最頻が過半に届かなければ落ちるが、**拡大後の3月期は 63.5% で過半を超えるので落ちない。** 1,081社の決算期が違うまま「2026年3月期」と名乗ることになる。**落ちないほうが危ない。**

**E0 は前提条件ではない。** 着手前は「全件embed のままでは予算を割る」と見込んでいたが、**実測すると割らなかった**（gzip 90,724 B / 予算100KB）。親 Issue のコメントの137KBは、社数を4,000で見積もったことと gzip を行数に比例させたことの2つで外れていた。

**それでも E0 は要る。** 予算の余白が 9.3KB しか残らず、**1行あたりの情報を増やす変更（E1 の会社ごとの決算期など）がそのまま予算にぶつかる**。加えて全社ぶんの直列化はリクエストごとに走るので、本番で出ている CPU 超過（Issue #118・`outcome: exceededCpu`）に対しても重い側になる。**拡大を待たせる理由が無いだけで、やらない理由にはならない。**

**E0 は現行の1,867社でも単独で価値がある。** トップページの HTML が軽くなり、リクエストごとの直列化も減る。母集団の拡大を待たずにマージしてよい。

**E3・E4・E5・E6 は E2 の後で並列に進められる。** どれも「新しく入った会社だけ中身が薄い」状態を埋める作業で、互いに依存しない。**E2 と同じ PR にはしない**——ロゴの調達も10年推移の取得も外部への大量アクセスを伴い、失敗したときに母集団の拡大まで巻き戻すことになるため。

## 他施策から触られる箇所

**Worker の CPU 予算（Issue #118）と同じ数字を共有する。** 母集団を1.59倍にすると、モジュールの初期化（`import` したデータファイルの `JSON.parse`）も同じ比で増える（`companies.json` gzip 44,631 B → 70,610 B、`stats.json` 39,922 B → 68,515 B・実測）。

**#118 への処置は `/company/[id]` の事前生成に向かっている**（読むデータを画面ごとに分ける筋は 2026-08-24 に #179 でリバートされた。「仕掛けの重さに対して効果が見合っていない」）。**事前生成するページ数は母集団そのもの**なので、1,867 → 2,962 でビルド時間と成果物の数がそのぶん増える。

- **E2 の後で測り直す。** この施策が壊すものは無いが、余裕は母集団に比例して減る
- **`/` は事前生成できない。** `searchParams` を読むので動的なまま残る（#179 のリバートの理由に明記されている）。**そこで毎リクエストに乗る全社ぶんの直列化を外すのが E0**（ADR-0013）

**ADR の番号は 0011 を飛ばして 0012・0013 を使っている。** 0011 は #179 でリバートされた ADR（ページが読むデータの割り方）が使っていた番号で、あの筋を入れ直すときに戻ってくる余地を残してある。

## E0 初回ロードのペイロード方式

`RankingApp` が `"use client"` で `companies` を props に受け取っているため、**Next.js が全1,867社をハイドレーション用データとしてHTMLに丸ごと直列化している**（`docs/ranking/ranking-pagination/design.md`）。この方式をやめる。

決定は ADR-0013。**`docs/ranking/spec.md` の AC-7（操作でネットワークが発生しない）を割らないことが制約**で、「操作のたびに取りに行く」方式には倒さない。

**触るもの。** `app/page.tsx`・`features/ranking/`・`e2e/network.ts` の「リクエスト数0」の測り方。※共有: 絞り込み状態（ranking の U3〜U6・U14・U15 が乗っている）。

## E1 決算期を幅で出す

site-chrome の S3（Issue #134）が置いた「決算期を1つ選んで全ページに出す」を、幅で出す形に改訂する。`docs/site-chrome/spec.md` 5. に追記する。

**文字列を作る場所は `web/lib/data/period.ts` の1か所のままにする。** S3 の決定（直書きしない・「年度」と書かない・1画面に1回）はそのまま生きる。

## E2 母集団の拡大

取得の窓を12か月に広げ、CSV を作り直す（ADR-0012）。実測で **1,867社 → 2,962社**（+1,095社）になり、**いま載っている1,867社は1社も落ちない**。

**同じ PR で直すもの。**

- `pipeline/salary/unified.py` の窓、`edinet.annual_reports()` の寄せ方（証券コード → EDINETコード・期末の新しいほうを採る）、内国法人への絞り込み
- `pipeline/scripts/build-data.ts` の `EXPECTED_ROW_COUNT`
- **`docs/ranking/spec.md` の AC-1** — 1位がキーエンスからヒューリック（2,295万円）に変わる。E2E も同じ値を固定している
- `/about`「対象範囲」の窓の説明（`web/lib/data/period.ts` の `filingWindowLabel`）
- `docs/product/product.md`「データの前提」
- `docs/ranking/spec.md` の「1,867社」

**寄せ方を書類一覧の段で直す。** `unlisted_docs()` は EDINETコードごとに「後に見つかったものが勝つ」で1件に潰しており、**同じ年に有報を複数出す会社**（りそな銀行・三井住友信託銀行で実測。それぞれ窓の中に4件ある）で従業員の状況を持たない書類が残る。実際に、期末で選び直す前は**この2社が母集団から消えていた**。

**上位30社を目視で確かめる。** textblock 由来の読み違いが1件、3位に来る（spec 1.5b）。

**`sitemap.xml` は自動で増える**（U8・`lib/seo/`）。URLを新設するわけではないので ADR-0006 の改訂は要らない。

## E3・E4・E5・E6 派生データの追随

**どれも「取り直す」だけの Unit で、設計の判断は無い。** 既存の手順書がそのまま使える。

- E3 — `npm run build:logos`（`docs/logo/logo-pipeline/design.md`）。到達率は現状87.0%で、新規社ぶんも同程度を見込む
- E4 — `warm_lists.py` → `fetch_history.py` → `history.py`（`pipeline/salary/README.md`）。**新規社ぶん（1,095社×10年）で約1万件の追加取得**になる
- E5 — 女性活躍DBの全件版ZIPを手元に置いて `npm run extract:worklife`（`docs/worklife/data-ingest/`）。**ZIPはリポジトリに入っていない**ので、運営者が取得したものを使う
- E6 — `pipeline/performance/extract.py`（`docs/performance/`）。**最新年の書類1件に5期ぶんの経常利益が入っている**ので、E2 が落とした ZIP がそのまま使える。追加のダウンロードは要らない

**ロゴと10年推移は外部への大量アクセスを伴う。** どちらも既存のパイプラインが流量制限を織り込んである（EDINET は並列3・ロゴは失敗をキャッシュしない）。手順を変えない。
