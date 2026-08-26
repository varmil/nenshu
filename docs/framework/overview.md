# overview.md — 配信フレームワーク移行の分解マップ

`docs/framework/spec.md` を Unit に割る。決定は ADR-0014。

**Unit の ID は `F`。** `E` は expansion、`P` は performance が使っている。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| F0 | [`next/*` への依存を剥がす](https://github.com/varmil/nenshu/issues/208) | なし | AC-5, AC-6 | **Next.js のまま行う。** `notFound`・`usePathname`・`Script` の4か所を自前の薄い層へ寄せる。**`next/link` は F1 へ回した**（下記）。※共有: `features/navigation/` |
| F1 | [Astro へ移す（カットオーバー）](https://github.com/varmil/nenshu/issues/209) | F0（#208）・**E0（#174）** | AC-1〜AC-3, AC-5〜AC-15 | **1つの PR で切り替える。** 足場・ルーティング・事前生成・メタデータ・キャッシュ・`run_worker_first`・sitemap・robots・E2E の付け替え、**`next/link` と型（`Metadata` など）の始末**を含む。※共有: 全体 |
| F2 | [遷移の待ち表示を作り直す](https://github.com/varmil/nenshu/issues/210) | F1（#209） | AC-5 | **まず「要るのか」を測ってから作る。** 素の HTML 取得が十分速ければ作らない。※共有: `features/navigation/` |

## 実施順序

```
E0（#174・expansion）─┐
F0 ──────────────────┴→ F1 → F2
```

**一直線にしかできない。** Next.js と Astro は同じ Worker に同居できないので、F1 は分割不能なカットオーバーになる。

**ADR-0013（E0・#174）を F1 より先に入れる。** 施策としては独立だが、**順序は独立ではない。**

**Astro は島の props を HTML の属性に直列化するので、`__next_f` より大きい。** 同じ 1,867社ぶんで実測すると `/` の HTML は raw 378,474 → 481,312 B、**gzip 63,865 → 67,889 B（+4,024 B）**。raw で +27% なのに gzip で +6.3% にとどまるのは、HTML エスケープ（`"` → `&quot;`）がよく圧縮されるため。

**この +4,024 B は props の量に比例する。** 2,961社へ伸ばすと +6.4KB 見当になり、**いまの `/` の余白 7.2KB（gzip 92,797 B / 予算100KB）をほぼ食い潰す。** つまり **F1 単体で予算に触りかねない。**

**E0 を先に入れれば、この心配は消える。** サーバーが渡すのが30行ぶんになるので、直列化の形式の差はもう予算に効かない。**逆順にすると、F1 の検証中ずっと予算の縁を歩くことになる。**

**E0 の中身はどちらのフレームワークでも同じ形になる**（サーバーは30行だけ渡す／クライアントが初回に1回だけ取る／届くまでは実ナビゲーションに倒す／`companies.meta.version` を突き合わせる）。Next.js 上で先に作っても、F1 で書き換わるのは「props を渡す口」だけで、そこは F1 がどのみち触る。

**この +4,024 B は簡略版のプローブで測った値。** フッタ・`<head>`・テーマスクリプトを持たないページなので、**測ったのは props の直列化形式の差であって実ページの差そのものではない。** 2,961社への外挿も測っていない。

**2026-08-25: E0 は実装済み**（`docs/expansion/initial-payload/design.md`）。**`/` の HTML は gzip 92,797 → 19,860 B になり、予算の余白は 7.2KB → 80KB になった。** 上の心配は解けている——F1 はもう予算の縁を歩かない。**F1 の検証で `/` の gzip を前後比較する項目（下の「検証」）は残す**：直列化の形式が変わることに変わりはなく、比べる相手が 92,797 B ではなく 19,860 B になっただけ。

## F0 `next/*` への依存を剥がす（[#208](https://github.com/varmil/nenshu/issues/208)）

spec.md の 2.（AC-5・AC-6）。

**Next.js のまま完結する Unit。** main は動き続け、デプロイも通る。**F1 の差分から「Next.js の API を置き換える」という関心を抜くために先に置く**——カットオーバーの PR は触る範囲が広いので、混ぜると何が壊れたか切り分けられない。

剥がすのは4か所（実測。`docs/framework/intent.md` H1）。

| import | 箇所 | 置き換え先 |
| --- | --- | --- |
| `next/navigation` の `notFound` | `app/company/[id]/page.tsx` | ルート側の分岐に寄せる |
| `next/navigation` の `usePathname` | `HeaderSearch.tsx`・`BrandLink.tsx` | `lib/history/` のフックと即時読み |
| `next/script` の `Script` | `app/layout.tsx` | 素の `<script>` |

**`next/link`（`Link`・`useLinkStatus`）は F0 では外さない。着手して分かったので分解を改めた。**

**`next/link` はクライアント遷移そのもの**で、素の `<a>` に替えると全ページが再読み込みになる。**それは「遷移の方式を変える」ことで、F1 の中身そのもの**になる。F0 に残せば「Next.js のまま完結する・main は動き続ける」という前提を失うので、**F1 へ回した**（`docs/framework/next-detach/plan.md` に経緯）。

**型（`Metadata`・`MetadataRoute`・`Viewport`・`NextConfig`）も F1 の担当。** 実行時のコードが0バイトなので、ルーティングごと移すときに一緒に消える。**つまり F1 が引き取るのは「型 ＋ `next/link`」になる。**

- **`eslint.config.mjs` の `no-restricted-imports` に `next/navigation` と `next/script` を足す。** 剥がした先から戻ってこられないようにする。**`next/link` の既存の規則はそのまま残す**（F1 まで使い続けるので、`NavLink` 経由に寄せる必要がある）
- **`usePathname` の置き換えは `lib/history/` の規則に乗せる**——あそこが「URL を読む・書く」の1か所になっている（U14・#108）

## F1 Astro へ移す（カットオーバー・[#209](https://github.com/varmil/nenshu/issues/209)）

spec.md の 1.・3.・4. と 2. の全部。**2026-08-26 実装済み**（`docs/framework/astro-cutover/`）。

**分けられない。** `app/` を消してルーティングを移した時点で、メタデータもキャッシュも `run_worker_first` も同時に移さないとデプロイが通らない。**そのぶん検証を厚くする。**

- **`/` だけ `export const prerender = false`。** 他は全部ビルド時に生成する（AC-1・AC-2）
- **`trailingSlash: "never"` ＋ `build: { format: "file" }`。** これが無いと `/about/` になり、ADR-0006 の canonical と食い違う（実測で確認済み）
- **`RankingApp`・`CompanyDetail` は `client:load` の島1つに収める。** 島を2つ重ねると props が2回直列化される（`LogoIdsProvider` を別の島にして実際にそうなった。`/` の HTML が 733,979 B まで膨らんだ）
- **E2E 4ファイルの付け替え**（AC-6）。`prefetch-loop.spec.ts` は守る対象（RSC のプリフェッチ暴走・#183）ごと消えるので落としてよい。`cache-headers`・`theme`・`network` は性質を引き継ぐ
- **AC-1 は E2E で固定する。** 「`/about` と `/company/[id]` が Worker を起こさない」ことを、CPU が床のままであることで確かめる。**ヘッダでは判らない**
- **`wrangler.jsonc` は main に入るまで効かない**（2026-08-21・#119）。ブランチのプレビューでの結果で「効かない」と判断しないこと
- **`/` の HTML を gzip で前後比較する**（予算100KB・ranking spec 3.）。**E0 が入ったので比べる相手は 19,860 B**（上の「実施順序」参照）

**結果**（`docs/framework/astro-cutover/design.md` に手順と全部の数字）。**`/about` 14.3 ms・`/company/6861` 20.6 ms が、どちらも床（3.6〜3.9 ms）と区別が付かなくなった**＝ Worker が起きていない（AC-1）。`/` は 39.5〜44.6 → 21.1〜22.4 ms。**Worker バンドルは gzip 2,089 → 627.9 KiB**（AC-4）。**`/` の HTML は gzip 19,860 → 19,420 B** で、心配していた直列化の差は現れなかった（E0 が先に入っているため）。

**着手して分かったことが3つある。**

- **`astro dev` にアダプタを付けると起動しない。** workerd の中で Vite のモジュールランナーが走る構成で、依存の事前バンドルのたびに古いチャンクを掴んで落ちる。**dev は Astro 自身のサーバーで足りる**——`_headers`・`run_worker_first`・`not_found_handling` はもともと dev では効かない
- **E2E が27件落ちた。原因は1つで、ハイドレーション前のクリックが消えること。** SSR したボタンは最初から DOM にあるので Playwright の自動待機が素通りする。**待ち方を `e2e/appTest.ts` の1か所に閉じた**
- **404 は自分で置かないと Astro の既定（英語・ヘッダ無し）が出る。** ステータスは同じ 404 なので、それだけ見ていると気づけない

## F2 遷移の待ち表示を作り直す（[#210](https://github.com/varmil/nenshu/issues/210)）

spec.md の 2.（AC-5）。

**作ると決めていない Unit。** `NavProgressBar`（`useLinkStatus`）は `prefetch={false}` の代償として入れたもので、**RSC ペイロードの到着を待つ時間を埋めるためだった**（`docs/company/company-page/design.md`）。移行後は静的アセットの取得になるので、その待ち自体が変わる。

**F1 の時点では「壊れていない状態」にしてある。** `next/link` の `useLinkStatus()` が無くなったので、遷移の始まりは `document` で1本の委譲リスナーが拾う（規則は `features/navigation/lib/navIntent.ts` の純粋関数）。**終わりは拾わない**——次のページが来た時点でページごと消える。

**まず測る。** 実測して体感に出ないなら作らない。**作るなら Astro の遷移イベント（`astro:before-preparation` など）で組む**——`nextjs-toploader` 系のライブラリを使わない判断（CLAUDE.md）はそのまま生きている。

## 他施策から触られる箇所

**`lib/seo/`（U8・U16・S2）。** `toMetadata()` は `Metadata` 型を返す Next.js 依存だが、**文言を作る本体（`pageMeta.ts`）は純粋関数**なのでそのまま持ち越す。F1 で包み方だけ差し替える。

**`lib/cache/headers.ts`（ADR-0004）。** 規則の置き場所を1か所に保つ決定は残る（AC-15）。**エッジキャッシュが要るのは `/` だけになる**ので、中身は縮む。

**`lib/history/useLocationSyncedState.ts`（U14）。** フレームワークに依存していない（`pushState` を直接呼んでいる）。**そのまま動く。**

**`features/navigation/`（S1・U13）。** F0 と F2 の両方が触る。

## 共有コンポーネント

**新しい UI を作らない。** `design-system/` に足すものは無い。

## 対象外

spec.md 6. のとおり。とくに **`/` の CPU（→ ADR-0013・E0・#174）** と **ファセットのパス化（→ ADR-0006 の再検討）** はこの施策に含めない。
