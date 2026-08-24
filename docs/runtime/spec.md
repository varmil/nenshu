# spec.md — Worker の実行予算

対象面: user-web（ユーザー画面）

用語は `docs/product/glossary.md` に従う。**この施策は画面を変えない。** 受け入れ基準はすべて「変わらないこと」と「予算に収まること」で書く。

---

## 1. 1リクエストの CPU

### 1.1 何を（WHAT）

`/`・`/company/[id]`・`/about` のいずれも、Cloudflare Workers 無料枠の **CPU 10ms/リクエスト**を超えない。cold（isolate の初回）を含む。

### 1.2 なぜ（WHY）

超えたリクエストは HTML を返さず `exceededCpu` で落ちる（Issue #118）。落ちているのはインデックスさせたい企業詳細ページで、踏んでいるのはクローラである。

### 1.3 予算の割り振り

CPU は測るたびに環境で変わるので、**絶対値ではなく「何を読むか」で縛る**（1.4）。読む量を縛れば、予算の使い方が実装から目で追える。

---

## 2. ページが読むデータ

### 2.1 何を（WHAT）

**各ページは、その画面が使うデータファイルだけを import する。** 使わないものを「ついでに」読まない。

| ページ | 読んでよいもの |
| --- | --- |
| `/` | `companies.json`・`curves.json`・`population.json`・`logo-ids.json` |
| `/company/[id]` | 上記 ＋ `stats.json`・`history.json`（W1 以降は `worklife.json`） |
| `/about` | `companies.json`・`curves.json`・`logos.json` |
| `sitemap.ts` | `companies.json` |

### 2.2 なぜ（WHY）

`import` したファイルは、その画面が中身を1バイトしか使わなくても丸ごと `JSON.parse` される。しかも isolate の初回リクエストに課金される。`/` は `stats.json` 130KB を読んで 337B ぶんだけ使い、`logos.json` 204KB を読んで「ロゴがあるか」だけを使っていた。

### 2.3 分割の規則

**大きいファイルから「全ページが使う小さな部分」を切り出して別ファイルにする。元のファイルは消さない。**

- `population.json` — `stats.json` から `bases`・`count`・`population` だけ（337B）
- `logo-ids.json` — `logos.json` の `byId` のキーだけ（11.6KB）

**切り出した側と元のファイルの整合は、生成する1か所で担保する。** 手で同期しない。

### 2.4 受け入れ基準

- **AC-1**: `/` は `stats.json`・`logos.json`・`history.json`・`worklife.json` を import しない。
- **AC-2**: `/company/[id]` は `logos.json` を import しない。
- **AC-3**: AC-1・AC-2 は lint で落ちる（レビューで見つける形にしない）。
- **AC-4**: `logo-ids.json` に載る企業IDの集合は `logos.json` の `byId` のキーと完全に一致する。
- **AC-5**: `population.json` の `bases`・`count`・`population` は `stats.json` の同名フィールドと完全に一致する。

---

## 3. リクエストごとの計算

### 3.1 何を（WHAT）

**同じ入力に対する同じ計算を、1リクエストの中で2回以上しない。**

`generateMetadata` と本体が同じ `buildCompanyView(id)` を必要とする場合、実際に走るのは1回にする。

### 3.2 なぜ（WHY）

`buildCompanyView` は 0.885ms（実測・中央値）で、これが1リクエストに2回走っていた。**タイトルと本文が同じ会社の同じ数字を出すのだから、2回計算する理由が無い。**

### 3.3 何度も走るものは isolate ごとに1度だけ作る

母集団の索引のように「入力が固定で、リクエストごとに変わらないもの」は、モジュールの初期化かキャッシュで1度だけ作る。**リクエストのたびに 1,867行を走査し直さない。**

### 3.4 受け入れ基準

- **AC-6**: `/company/[id]` の1リクエストで `buildCompanyView` は1回だけ走る。
- **AC-7**: `findNeighbors` は、呼ばれるたびに `companies.rows`（1,867行）を走査しない。

---

## 4. 変わらないこと

### 4.1 受け入れ基準

- **AC-8**: `/`・`/company/[id]`・`/about` の画面に出る文字・数値・ロゴは、この施策の前後で1つも変わらない。
- **AC-9**: 表示基準・年齢・フィルタ・検索・並び替え・ページ送りの切り替えでネットワークが発生しない（ranking AC-7・company AC-8）ことは変わらない。
- **AC-10**: `/` のHTMLサイズが増えない（Issue #22 の予算 75,000B）。

---

## 5. 対象外

**フレームワークの CPU。** Next.js・React・OpenNext の処理そのものには触らない。

**有料プランへの移行。** `docs/product/product.md` の制約に反する。

**掲載データの削減。** 社数・年数・項目を減らして予算を作らない。

**`/company/[id]` の静的生成（`generateStaticParams`）。** 1,867枚を事前生成すれば cold の描画そのものが消えるが、`searchParams` を読む現在の構成（共有リンクの `?age=N` をSSRに反映する）を崩す。**効果が足りなければ次に検討する**——その時は ADR-0004 の追記になる。
