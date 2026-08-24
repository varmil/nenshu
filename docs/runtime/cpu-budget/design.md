# design.md — R0 画面が読むデータと、1リクエストの計算を減らす

Issue: [#165](https://github.com/varmil/nenshu/issues/165)（親: [#118](https://github.com/varmil/nenshu/issues/118)）
仕様: `docs/runtime/spec.md` 2.・3.（AC-1〜AC-10）
参照: `docs/adr/0004-ssr-opennext-cloudflare.md`, `docs/adr/0011-per-page-data-loading.md`

出来上がりの内部構造。**画面は1つも変わっていない。**

## 予算がどこへ消えていたか

1リクエストの CPU は3つに割れる。**この Unit が動かせるのは後ろの2つだけで、いちばん大きい1つ目には触っていない。**

| | 中身 | この Unit | 
| --- | --- | --- |
| フレームワーク | Next.js・React・OpenNext の処理と描画 | 触らない（spec 5.） |
| モジュールの初期化 | データJSONの `JSON.parse` とコンポーネントの評価。**isolate ごとに1度だけ走り、その回のリクエストに課金される** | 読むファイルを減らした |
| リクエストごとの計算 | `buildCompanyView` と `findNeighbors` | 重複と全表走査を消した |

**Turbopack は大きい JSON を `JSON.parse("…")` として出力する**（`.open-next/server-functions/default/handler.mjs` を検めた。`companies` 190,441文字・`logos` 210,333文字・`history` 164,162文字・`stats` 133,703文字ぶんの文字列リテラルが並んでいる）。オブジェクトリテラルに展開されているわけではないので、初期化の費用は素直に `JSON.parse` の費用そのものになる。

## データファイルの分割

**大きいファイルから「全ページが使う小さな部分」を切り出し、元のファイルは残す。**

| ファイル | raw | `JSON.parse` | 読む画面 |
| --- | ---: | ---: | --- |
| `companies.json` | 130KB | 0.820ms | `/`・`/company/[id]`・`/about`・`sitemap.ts` |
| `curves.json` | 1.5KB | 0.013ms | `/`・`/company/[id]`・`/about` |
| **`population.json`（新）** | **337B** | **0.002ms** | `/` |
| **`logo-ids.json`（新）** | **11.3KB** | **0.099ms** | `/`・`/company/[id]` |
| `stats.json` | 131KB | 0.908ms | `/company/[id]` |
| `history.json` | 160KB | 0.607ms | `/company/[id]` |
| `logos.json` | 202KB | 1.236ms | `/about` |
| `worklife.json` | 491KB | 1.568ms | （まだどこも読んでいない） |

（Node 22・中央値61回。`web/public/data/` の実ファイルを `JSON.parse` した値）

**ページごとの合計は次のように動いた。**

| ページ | 前 | 後 | |
| --- | ---: | ---: | ---: |
| `/` | 2.977ms | **0.934ms** | −69% |
| `/company/[id]` | 3.584ms | **2.449ms** | −32% |

`/about` は変えていない（`logos.json` の `w`/`h`/`from`/`lic` を帰属表示で使う唯一の画面で、しかも静的に前生成される）。

### `population.json`

`stats.json` の `bases`・`count`・`population` だけ。`pipeline/scripts/build-data.ts` の `pickPopulation` が `stats` と**同じオブジェクトを参照して**作るので、値がずれる余地が無い。

`/` はここしか使っていなかった。`rankAll`・`rankIndustry`（1,867×9 の配列が2本）と `distribution` を読んでいたのは、**同じ `import` に入っていたからでしかない。**

### `logo-ids.json`

`logos.json` の `byId` のキーだけを並べた配列。**`companies.rows` と同じ並びのマスクにしていない**——マスクにすると `build-logos.ts` が `companies.json` の行の並びに依存し、`build-logos.ts` は既に `companies.json` を読んでいるので生成の循環ができる。

読み手はどちらも集合に開いてから使う。

- `/` は `buildLogoMask(companies.rows, new Set(ids))` でこれまでどおり 1,867文字のマスクを作り、クライアントへはマスクを送る（送る量は1バイトも変わっていない）
- `/company/[id]` は `new Set(ids)` を持ち、その画面に出る46社ぶんだけを絞る

**`buildLogoMask` の第2引数は `Record<string, unknown>` から `ReadonlySet<string>` になった。** 「ロゴがあるか」しか見ていないことが型に出る。

## リクエストごとの計算

### `buildCompanyView` は1リクエストに1回

`generateMetadata` と本体が別々に呼んでいた。React の `cache()` で包み、`app/company/[id]/page.tsx` の `companyView(id)` 1本にした。**リクエストをまたいでは残らない**ので、ある読者の会社の数字が別の読者に出ることはない。

実際に1回になっていることは、`buildCompanyView` に一時的な `console.log` を仕込んで `wrangler dev --local` に投げ、ログの行数で確かめた（`/company/8282` と `/company/6861` でそれぞれ1行）。確認後に probe は外してある。

### `findNeighbors` は isolate ごとの索引を引く

`findNeighbors` は1リクエストで9回（表示基準のぶん）呼ばれる。前は毎回

- `companies.rows.find(...)` で自分の行を探し（1,867行）
- `companies.rows.filter(...)` で同業種を集め（1,867行）
- 業種カーブを円に直す `Map` を作り直していた

——**1リクエストで延べ 33,606行を数え直していた。**

`industryIndex(companies)` が `byId`（id → 行）と `byIndustry`（業種の添字 → 行の配列）を WeakMap で isolate ごとに1度だけ作る。`view.ts` の `indexCache` と同じ持ち方で、`companies` は `import` した固定のオブジェクトなのでキーとして安定する。

**業種カーブは「カーブ名」で引く。** `curves.curves` のキーの並びで添字にしない——`companies.curveKeys` とは別の並びでありうる。

### 実測

同じプロセス・同じ JIT 条件で新旧を並べた（中央値101回。**最初の1本は JIT を含むので捨てている**）。

| | 前 | 後 |
| --- | ---: | ---: |
| `findNeighbors(8282, 35)` | 0.069ms | **0.023ms** |
| `findNeighbors(6861, 35)` | 0.065ms | **0.037ms** |
| `findNeighbors(4686, 35)`（情報・通信業173社） | 0.071ms | **0.042ms** |
| `buildCompanyView(8282)` 9基準ぶん | 0.689ms | **0.274ms** |
| `buildCompanyView(6861)` 9基準ぶん | 0.455ms | **0.366ms** |
| `buildCompanyView(4686)` 9基準ぶん | 0.534ms | **0.448ms** |

**1リクエストあたりでは、これが2回から1回になる。** 0.91〜1.38ms → 0.27〜0.45ms。

## 合計

`/company/[id]` の cold なリクエストで **1.7〜2.0ms**、予算 10ms の 16〜19%。`/` は cold で 2.04ms（同 20%）。

**warm のリクエストではデータの分割は効かない**（`JSON.parse` は isolate ごとに1度きり）。効くのは計算の重複を消したぶんだけになる。

## 測り方（次に測る人へ）

**`JSON.parse` はファイル単位で測る。** `web/public/data/*.json` を `readFileSync` して `JSON.parse` を61回、中央値を採る。ページごとの cold の内訳は、そのページが `import` しているファイルを足し上げれば出る。

**自分のコードの計算は同じプロセスで新旧を並べる。** 別々に走らせると JIT の状態が揃わない。**最初に測った1本は必ず高く出る**ので捨てる（捨てずに測って、同じ関数が 0.885ms と 0.263ms の両方を出した）。

**`wrangler dev --local` の CPU は `/proc/<workerd>/schedstat` の第1フィールド（ナノ秒）で測れる。** `/proc/<pid>/stat` の `utime` はクロックティック（10ms）刻みなので、この用途には粗すぎる。N リクエストの差分を N で割る。

- **warm の実測（この Unit の前後、40リクエストの平均）**: `/company/8282` 26.8〜32.5ms → 29.3〜29.5ms、`/` 42.3〜44.2ms → 41.9〜43.1ms、静的アセット（`/favicon.ico`）5.2〜6.1ms。**差は測定の揺れに埋もれている。** この環境は本番より数倍遅く、しかも warm では分割が効かないので、そもそも見えるはずのものではない
- **cold の実測は使いものにならなかった。** 起動直後の1本目は 508〜1,776ms で、揺れが 1,000ms を超える。`wrangler dev` は毎回 4.7MB の `handler.mjs` を一から評価するためで、**本番の Cloudflare はコンパイル済みのスクリプトを持っている**からこの費用は乗らない。数ms の差をここで見ようとしないこと

**だからこの Unit の効果は、機構の単位（`JSON.parse` と関数の実測）で示してある。** エンドツーエンドの数字は本番のログ（`exceededCpu` の発生数）で見る。

## 戻れなくする仕掛け

**`eslint.config.mjs` にページ単位の `no-restricted-imports` を置いた**（AC-3）。`app/page.tsx` は `stats.json`・`logos.json`・`history.json`・`worklife.json` を、`app/company/[id]/page.tsx` は `logos.json` を import できない。**型もテストも通ってしまう間違い**で、レビューで「その import は要るのか」を毎回問うことはできない。

**`no-restricted-imports` は後から書いた設定が丸ごと上書きする。** ページ用のブロックを足したとき、既にあった `next/link` の禁止がその2ファイルだけ素通りしていた。規則を `NEXT_LINK_RULE` という1つの値にして両方に持たせてある。**わざと違反を書いて、両方が同時に落ちることを確かめた。**

**生成し忘れは pipeline のテストが止める。** `build-data.test.ts` と `build-logos.test.ts` が、**リポジトリに入っている** `population.json`・`logo-ids.json` を元のファイルと突き合わせる（AC-4・AC-5）。生成の中で作っているぶんだけでなく、公開しているファイルそのものを見る。

**索引に置き換えて結果が変わっていないことは `neighbors.test.ts` が固定する。** 全表を素直に走査する実装を同じテストの中に書き、6社 × 4基準で5社・金額・業界内順位を突き合わせる。**ここがずれると、別の会社を「水準が近い会社」として出す。**

## 効かなかったら次に何をするか

**`/company/[id]` の静的生成。** 1,867枚を前生成すれば cold の描画そのものが消える。`searchParams`（共有リンクの `?age=N`）をSSRに反映する現在の構成を崩すので、ADR-0004 の追記が要る。

**RSCペイロードの削減。** 9基準ぶんを先に送っているのは「切り替えでネットワークを起こさない」（company AC-8）ためで、描画と直列化の両方に効いている。**読者の体験を削る変更なので、上の静的生成より後に検討する。**

**`stats.json` の入れ子をやめる。** `rankAll`・`rankIndustry` を平らな配列にすると `JSON.parse` が 1.221ms → 0.854ms になる（実測）。**この Unit では入れていない**——0.37ms のために「行がずれると別の会社の順位を出す」表現へ移す取引が見合わないため。
