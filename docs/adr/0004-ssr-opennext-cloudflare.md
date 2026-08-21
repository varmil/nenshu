# ADR-0004 静的書き出しをやめ、Cloudflare Workers 上で Next.js を SSR する

状態: Accepted

日付: 2026-08-17

## 文脈

U5（URLクエリとの同期）で、絞り込み・検索語をURLクエリに同期する仕組みを実装した。`output: 'export'`（ADR-0002）はビルド時に1回だけHTMLを生成するため、初期HTMLは常にビルド時の初期値（35歳・絞り込みなし）になる。フィルタ付きURL（例: `/?age=45&ind=銀行業`）を直接開いた場合も、サーバーが返すHTMLの中身は常に「絞り込みなし」で、実際の絞り込み結果はJSがURLを読んでから初めて反映される。

これによる見た目のチラつき自体は、URL読み取りを`useLayoutEffect`に変えることでほぼ解消できる（別PR #36）。しかしこれは対症療法で、**検索エンジンのクローラーがJS実行前に取得するHTMLの中身は、フィルタ付きURLに対して常にビルド時の初期値のまま**という制約自体は残る。

spec.md 136行目のSEO要件（「トップページの初期表示（35歳・絞り込みなしの上位100社）はHTMLに含める」）は現状のstatic exportで既に満たしている。今回の論点はそれを超えて、**フィルタ・検索語付きのURLについても、クロール時点のHTMLが実際のクエリに対応した内容を返す**ことを新たに目指すかどうかである。自然検索がNorth Star KPI（`docs/ranking/intent.md`）であり、「業種名 年収」のようなロングテールの検索流入を狙うなら、フィルタ済みURLが検索結果に正しい内容で載る必要があると判断した。

事前調査:

- Next.js 16（本プロジェクトが既に使用中。ビルドログで`16.3.1`確認済み）でPartial Prerendering（PPR）は実験フラグではなく`cacheComponents`として正式安定化している。
- Cloudflare WorkersでNext.jsをフルSSR実行するには`@opennextjs/cloudflare`（OpenNext Cloudflare adapter）を使う。Next.jsをNode.jsランタイムモードでworkerd（V8 isolate）上に載せる。
- Cloudflare Workers Free planの制約: 圧縮後Worker本体3MB、メモリ128MB、リクエストあたりCPU時間10ms、1日10万リクエストまで無料（[Cloudflare Workers Pricing](https://www.srvrlss.io/provider/cloudflare/)、[Easton: Cloudflare Free Tier Limits](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/)）。
- 本サイトのデータは`companies.json`が133KB、`curves.json`が1.5KB（ADR-0003）。DBもAPIコールも無く、フィルタ計算は1,867行の配列操作1回のみ。3MB上限・10ms CPU時間の両方に対して十分小さい想定だが、実測での確認は移行実装時に行う。

## 決定

**デプロイ先はCloudflare Workersのまま、配信方式を静的アセット配信からNext.jsのフルSSR（`@opennextjs/cloudflare`）に切り替える。**

**PPR（Partial Prerendering）は使わない。** 素の（全体が動的な）SSRで、トップページはリクエストごとにクエリパラメータをサーバーコンポーネントで同期的に読み、絞り込み済みの結果をそのままHTMLとして返す。

**SSR成果物はエッジにだけ持たせ、ブラウザには持たせない。** 詳細と理由は「キャッシュの設計」にある（2026-08-21 改訂）。SSRに切り替えたことで「同じURLに何を、どこに、どれだけ持たせるか」という判断が発生し、それがこのADRの守備範囲に入ったため、同じ文書に置いている。

## 理由

- このサイトには「遅い動的部分」が存在しない。全データはビルド時に確定済みで、フィルタ計算はミリ秒未満。PPRの価値は「静的シェルを即座に返しつつ、遅い動的部分だけをSuspenseでストリーミングする」ことにあるが、ストリーミングする理由がある遅延が無い。PPRを導入するとSuspense境界・postponed stateの分だけ実装と検証の複雑さが増えるのに、得られるTTFBの改善はほぼゼロ。素のSSRで同じ「常に正しい初期HTML」という結果を、より単純な実装で得られる。
- U5で`useSearchParams()`がstatic exportでは静的HTMLから丸ごと除外されることが判明し（`docs/ranking/url-sync/design.md`）、回避策として`window.history`の直接操作＋クライアント側読み取りに倒した経緯がある。この構成は「初回レンダーのHTMLが常にビルド時の初期値」という制約自体を生み出しており、対症療法を重ねるより、SSRに切り替えて制約の発生源を無くすほうが筋がよい。
- OpenNext Cloudflare adapterはCloudflare公式が関与するアダプタで、Next.jsの主要機能をWorkers上でサポートしている。データサイズ・計算量ともにFree planの制約に対して十分小さく、追加コストなしで移行できる見込み。

## 結果

- **ADR-0001の「サーバーサイドの実行環境は要らない」という前提、およびADR-0002の`output: 'export'`は本ADRにより一部supersedeされる。** Cloudflareを使うという判断そのもの（商用利用可・無料枠・帯域無制限）はADR-0001のまま有効。Next.js + shadcn/ui + TypeScriptというADR-0002の技術選定も有効。変わるのは配信方式（静的ファイル配信→SSR）だけ。
- ログイン・会員機能・動的APIを持たないという方針（intent.mdの「作らないもの」）は変えない。SSRはあくまで「ビルド時に確定済みの静的データを、リクエスト時にクエリでフィルタして返す」だけで、DBも外部APIも持ち込まない。
- Bolt 2で計画している企業詳細1,867ページ・業種33ページ・年齢別8ページは、クエリに依存せず内容が決まるため`generateStaticParams`によるビルド時事前生成のままで問題ない。ランキングのトップページ（`/`）だけが真にリクエスト依存でSSRを要する。
- デプロイ設定（ビルドコマンド・`wrangler` 設定等）が変わる。`docs/ranking/project-foundation/design.md`の記載を更新する必要がある。
- **移行実装前に、Free planのCPU時間10ms上限に実際のフィルタ+レンダリングが収まるかを実測で確認する。** 収まらない場合はWorkers Paid（月5ドル、CPU時間の上限が大幅に緩和される）への移行を検討する。収益化前に固定費が発生する判断になるため、実測結果を見てから決める。

- 実装は本ADR承認後、専用のUnitとして`plan.md`/`design.md`を書いてから進める。既存のU0〜U5の成果物（`useRankingState`のロジック、`buildRankedCompanies`、フィルタ・検索の純粋関数群）はサーバーコンポーネント側でそのまま再利用できる想定。

### 本番デプロイ後のCPU時間（2026-08-17 実測）

ダッシュボードのCPU時間中央値は235ms前後だったが、エラー（`Error 1102`等）は一件も発生していない。ローカルの同一ビルドでの実測（`next start`・`wrangler dev`ともにウォームアップ後18〜35ms）との乖離から、235msの大半はコールドスタート（isolate起動）由来と推定している（Cloudflareはisolate起動用CPU予算をリクエスト単体の10ms上限とは別枠で確保しており、200ms→400msに引き上げられている）。Free planのままで様子を見る判断とした。詳細は`docs/ranking/ssr-migration/design.md`の「本番デプロイ後のCPU時間の実測」参照。

## キャッシュの設計

SSRに切り替えた結果、**「同じURLに対して何を、どこに、どれだけ持たせるか」がこのADRの守備範囲に入った。** 静的書き出しの頃はファイルを配るだけで、この判断は存在しなかった。

### 3つの層があり、それぞれ別の理由で決まっている

| 層 | 設定場所 | 値 | 理由 |
| --- | --- | --- | --- |
| ブラウザ | `Cache-Control` | `public, max-age=0, must-revalidate` | **持たせない。** 下の「ブラウザにHTMLを持たせない」 |
| エッジ（Cloudflare） | `Cloudflare-CDN-Cache-Control` | `s-maxage=86400, stale-while-revalidate=604800` | データは年1回しか変わらない。Worker の起動を減らす |
| 静的アセット | `public/_headers` | `max-age=31536000, immutable` | ファイル名にコンテンツハッシュが入るので中身は変わらない |

**エッジのキャッシュは `wrangler.jsonc` の `cache.enabled: true` が無いと動かない。** ヘッダを返すだけでは `CF-Cache-Status` が付きもしない（2026-08-17 に判明。`docs/ranking/ssr-migration/design.md` 参照）。

**静的アセットには `next.config.ts` の `headers()` が効かない。** `_next/static/*` はWorkerを経由せずAssetsバインディングから直接配信されるため。だから3層目だけ設定場所が違う。

規則の本体は `web/lib/cache/headers.ts` の1か所にある。`next.config.ts` に直接書かない——順序に意味があり（後述）、それがコードから読めないため。

### 全画面エラーの再現条件（2026-08-21）

デプロイ直後にごく稀に出る Next.js 既定の全画面エラー（「**This page couldn't load / Reload to try again, or go back.**」）を再現した。**成立条件は1つだけ**だった。

> **古いHTMLがネットワークから届き、かつそのブラウザに旧ビルドのチャンクが無い。**

1. **デプロイでチャンク名が入れ替わる。** 連続する2デプロイ（`92cf04d` → `7ac2a16`）を実際にビルドして突き合わせると、CSSを含む4件が別名になり旧名は消えていた
2. **消えたチャンクは `404` を `content-type: text/html` で返す**（本番で確認）
3. `<script>` がHTMLを食って `ChunkLoadError` になり、**ルートのエラー境界がページ全体を差し替える**。SSR済みの中身は一度描かれてから消えるので、表示されてから真っ白になる

**逆に、次の経路はいずれも壊れない。** 旧ビルドを表示中のブラウザに対し、実際にサーバーを新ビルドへ差し替えて確かめた（CSSのファイル名で差し替えの成立を確認済み）。

| 経路 | 結果 | 理由 |
| --- | --- | --- |
| アドレスバー・ブックマークから再訪 | 正常（旧ビルドを表示） | HTMLもチャンクもブラウザのキャッシュにあり、辻褄が合っている |
| 戻る／進む | 正常（旧ビルドを表示） | 同上 |
| F5 リロード | 正常（新ビルドを表示） | HTMLを取り直す |
| タブを開いたまま操作（並び替え・年齢そろえ・業種チップ・ページ送り） | 正常 | 必要なチャンクはハイドレーション時に読み終わっている |
| タブを開いたままページ遷移 | 正常（フルリロードに落ちる） | 下記のビルドIDガード |

**`_next/static/*` が `immutable` で1年持つことが効いている。** 古いHTMLを持っているブラウザは、たいてい古いチャンクも持っている。**両方が揃っていれば古いまま正しく動く。** 壊れるのは片方だけ古いときで、それは「HTMLがネットワークから来て、チャンクは手元に無い」＝**エッジがデプロイ前のHTMLを配ったとき**にあたる。

**Next.js のビルドID不一致ガードは遷移だけを守る。** `fetch-server-response.js` に検出があり、クライアント遷移では自動でフルリロードに落ちる（旧ビルドのタブから会社ページへ飛ぶ実験で `doMpaNavigation` が働き、正常に表示された）。**初回ロードのHTMLが古い場合は守られない。** だから `deploymentId` を足しても解決しない。

### ブラウザにHTMLを持たせない（2026-08-21）

`Cache-Control` を `public, max-age=3600` から **`public, max-age=0, must-revalidate`** に変えた。

**これは上のエラーの対処ではない。** 上の表のとおり、ブラウザキャッシュ経路は辻褄が合っているので壊れない。変える理由は別で2つある。

- **再訪した読者が最大1時間ぶん古い数字を見る。** 推定式を変えたデプロイの直後に、ランキングの金額と `/about` の説明が食い違って見えうる（`docs/ranking/ssr-migration/design.md` に実例）
- 「HTMLだけ残ってチャンクが追い出された」ブラウザでは上のエラーが成立する。**まれだが、塞げるなら塞いでおく**

**代償は小さい。** 毎回問い合わせは出るが、応答するのはエッジであってWorkerではない（`Cloudflare-CDN-Cache-Control` は据え置き）。失うのは1時間以内の再訪で往復1回を省くぶんだけ。

### RSC応答を素のページURLのキャッシュに入れない（2026-08-21）

**Cloudflareのキャッシュは `Vary` を見ない**（既定。[公式が明記](https://developers.cloudflare.com/cache/concepts/vary/)）。Next.js はこれを見越して `_rsc` クエリパラメータでキャッシュキーを分けているが、**穴が1つある**。

`RSC: 1` ヘッダ付きで `_rsc` の無いURLを叩くと、Next.js は `307 → /?_rsc` を返す（`experimental.validateRSCRequestHeaders` の既定動作。公式ドキュメントは「CDNはこのリダイレクトを追え」と書いているが、Cloudflareは追わずに素のURLのキーへ保存する）。この307にキャッシュ可能なヘッダが付いていると、**素の `/` のキャッシュエントリがその307で上書きされ、以後ふつうの読者が `/?_rsc` へ飛ばされる。** 本番で1リクエストにより再現し、コロ単位で24時間残った。

対処は、**その条件のときだけキャッシュ不可のヘッダを返す**こと。

```ts
{
  source: "/:path*",
  has: [{ type: "header", key: "RSC" }],
  missing: [{ type: "query", key: "_rsc" }],
  headers: [
    { key: "Cache-Control", value: "private, no-store" },
    { key: "Cloudflare-CDN-Cache-Control", value: "private, no-store" },
  ],
}
```

**この規則は必ず配列の末尾に置く。`headers()` は後勝ちで、先頭に置くと後続の `{ source: "/" }` に上書きされる**（実際に先頭で組んで効かなかった。`routes-manifest.json` 上は正しくコンパイルされているので、マニフェストを見ても気づけない）。

**`missing` の `_rsc` には `value: ".+"` を必ず付ける。** OpenNext のマッチャ（`@opennextjs/aws/dist/core/routing/matcher.js` の `routeHasMatcher`）は、`type: "query"` のときだけキーの存在を確かめない。

```js
case "header":
    return (!!headers?.[redirect.key.toLowerCase()] &&      // ← 存在チェックあり
            new RegExp(redirect.value ?? "").test(...));
case "query":
    return ... : new RegExp(redirect.value ?? "").test(query[redirect.key] ?? "");
    //           ↑ 無い。value 未指定だと new RegExp("").test("") で常に true
```

`missing` は反転なので、**規則が永久に不成立になる**。`value: ".+"` を与えると値の有無で判定されるようになり、意図どおり動く。

**この不具合は `next start` では見えない。** 評価するのが Next.js 本体のマッチャに変わり、そちらには穴が無いため。プレビューへデプロイして初めて発覚した（2026-08-21）。

### E2E は Worker に向けて回せる

上のとおり、**`headers()` の `has`/`missing` は dev サーバーと本番で評価する実装が違う。** dev サーバーに対する E2E では、Worker 上でだけ落ちる不具合を捕まえられない。

`playwright.config.ts` は `E2E_BASE_URL` を見る。渡すと dev サーバーを起動せず、その宛先に対してそのまま流す。

```bash
npx opennextjs-cloudflare build
npx wrangler dev --port 3801 --local
E2E_BASE_URL=http://127.0.0.1:3801 npx playwright test e2e/cache-headers.spec.ts
```

デプロイ済みのプレビューURLを渡してもよい。**`headers()` を触ったときはこれを回す。** `value` を落とした状態でこの手順を踏むと、実際に該当のテストだけが落ちることを確認済み。

**性能への影響は無い。** 正規のルーターは必ず `_rsc` を付けるので（遷移の実測で確認）、この規則に当たるのは手動リクエストとスキャナだけ。ページ遷移のRSC応答は今までどおりエッジに乗る。

「RSC応答を一律キャッシュ対象外にする」案は採らない。`_rsc` のハッシュはルーター状態ツリーから決まり、`/` から会社ページへ飛ぶときの値は全読者で共通なので、今エッジで共有できているものを捨てることになる。

### 残っている問題: エッジがデプロイ前のHTMLを配りうるか（未決着）

**上の再現条件から、全画面エラーの原因はここに絞られる。** この節が本ADRで唯一開いている論点である。

[Cloudflare公式](https://developers.cloudflare.com/workers/cache/configuration/)は、Workers Cache のキャッシュキーにWorkerのバージョンが入ると明記している（"Each deployed version has its own isolated cache, so a new deployment starts from an empty cache and never serves responses written by a previous version"）。跨がせるには `cache.cross_version_cache: true` が要る（既定 `false`、未設定）。**これが本当なら、エッジは原理的にデプロイ前のHTMLを配れず、エラーは起きないはずである。**

**しかし、それと矛盾する実測が2026-08-18に記録されている。** ADR-0005（推定式の変更）のデプロイ直後、`/?age=25` が `cf-cache-status: HIT` / `age: 519` で旧ビルドの値を返した（`docs/ranking/ssr-migration/design.md`）。運営者が実際に全画面エラーを見ているという報告とも整合する。

2026-08-21 時点の観測では矛盾は再現していない。最終デプロイは 13:06:15Z で、その時点でキャッシュされていた4URL（`/`・`/sitemap.xml`・`/robots.txt` ほか）の `age` はいずれもデプロイ以降に作られた値だった。**ただしトラフィックが少ないので「古いエントリが無い」ことの証明にはならない。**

**次のデプロイ直後に、この手順で決着させる。**

```bash
# デプロイ時刻を取る（Zone ではなく Account スコープ）
curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/workers/scripts/nenshu/deployments"
# age がデプロイからの経過秒数を超えるエントリがあれば、キャッシュはデプロイを跨いでいる
curl -sSI https://openreport.net/ | grep -iE "cf-cache-status|age"
```

**跨いでいると分かった場合の手当ては2つ。** どちらも運営者の判断が要る。

- **デプロイ時に `purge_cache` を叩く。** Zone の Cache Purge 権限を持つ専用トークンをビルド環境に置き、デプロイコマンドの後段で実行する
- **`s-maxage` を下げる。** 数分まで下げればデプロイが行き渡る時間もそれだけになる。ただし**これは2026-08-18に「下げない」と判断した事項**（Worker の呼び出し回数を消費する側に振ることになるため）なので、事実が確定してから改めて決める

### やらないと決めたもの

- **デプロイ時のキャッシュパージ。** 公式どおり Workers Cache がバージョンで分かれるなら不要（"each deployment already starts from a cold cache"）。**上の未決着が「跨ぐ」側に確定したら、これが第一候補になる。** 現時点で入れないのは、効果があるかどうかが確かめられていない対策をビルド環境の秘密情報と引き換えに足すことになるため
- **`deploymentId` / OpenNext の `skewProtection`。** ビルドIDによる不一致検出が既に動いており（同一コミットの2回のビルドでBUILD_IDが別物になることも確認済み＝毎回ランダム）、守られる範囲は同じ。`skewProtection` は `run_worker_first: true` を要求するため**静的アセットのリクエストが全部Workerの呼び出し数に乗る**うえ、[opennextjs-cloudflare #1183](https://github.com/opennextjs/opennextjs-cloudflare/issues/1183) が Next.js 16.2 以降で壊れると報告している（本プロジェクトは 16.3.1）
- **ゾーンの Cache Rules（"Cache Everything"）。** 2026-08-21 に一度入れて外した。ゾーンのCDNキャッシュは Workers Cache とは別物で**バージョン分割されない**ため、Workers Cache が防いでいるものをわざわざ持ち込むことになる。またキャッシュキーもTTLも変えないので、上の2つの問題には効かない

## 却下案

**PPRを使う** — 前述のとおり、遅い動的部分が存在しないためストリーミングの効果がない。Suspense境界・postponed stateの複雑さだけが増える。

**静的exportのまま、フィルタ済みURLごとに事前生成する（全組み合わせSSG）** — 年齢8×業種34×従業員規模4×在籍年数4×平均年齢4 ≒ 17,408通りにもなり、Cloudflareの1デプロイあたりファイル数上限（2万）に対し、Bolt 2で計画済みの企業詳細1,867ページ・業種33ページ・年齢別8ページと合算すると現実的に厳しい。加えて自由入力の検索語（`q`）は原理的に列挙不可能で、この方式ではそもそもカバーできない。

**クライアント側のチラつき対策だけで済ませる（`useLayoutEffect`修正のみ、PR #36）** — 見た目のチラつきは緩和できるが、検索エンジンのクローラーがJS実行前に見るHTMLの中身は常にビルド時の初期値のままで、フィルタ済みURLのSEOという目的そのものを達成できない。

**RSC応答を一律でキャッシュ対象外にする** — 汚染は塞げるが、ページ遷移のRSC応答までエッジから外れる。`_rsc` のハッシュは遷移元のルーター状態から決まるため `/` → 会社ページの値は全読者で共通で、いま共有できているキャッシュを捨てることになる。狙い撃ちで足りる。

**ブラウザ向け `Cache-Control` を残したまま、エッジの `s-maxage` だけ下げる** — 全画面エラーの原因はブラウザが持つ1時間ぶんの古いHTMLなので、エッジを短くしても直らない。Worker の呼び出し回数だけが増える。
