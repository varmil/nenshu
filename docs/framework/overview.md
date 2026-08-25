# overview.md — 配信フレームワーク移行の分解マップ

`docs/framework/spec.md` を Unit に割る。決定は ADR-0014。

**Unit の ID は `F`。** `E` は expansion、`P` は performance が使っている。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| F0 | `next/*` への依存を剥がす | なし | AC-5, AC-6 | **Next.js のまま行う。** `notFound`・`usePathname`・`Link`＋`useLinkStatus`・`Script` の5か所を自前の薄い層へ寄せる。※共有: `features/navigation/` |
| F1 | Astro へ移す（カットオーバー） | F0 | AC-1〜AC-3, AC-5〜AC-15 | **1つの PR で切り替える。** 足場・ルーティング・事前生成・メタデータ・キャッシュ・`run_worker_first`・sitemap・robots・E2E の付け替えを含む。※共有: 全体 |
| F2 | 遷移の待ち表示を作り直す | F1 | AC-5 | **まず「要るのか」を測ってから作る。** 素の HTML 取得が十分速ければ作らない。※共有: `features/navigation/` |

## 実施順序

```
F0 → F1 → F2
```

**一直線にしかできない。** Next.js と Astro は同じ Worker に同居できないので、F1 は分割不能なカットオーバーになる。

**ADR-0013（E0・#174）とは独立。** 先にやっても後でもよい。**後にすると Astro 側で実装することになる**ので、E0 に着手済みならそちらを先に終わらせるほうが手戻りが少ない。

## F0 `next/*` への依存を剥がす

spec.md の 2.（AC-5・AC-6）。

**Next.js のまま完結する Unit。** main は動き続け、デプロイも通る。**F1 の差分から「Next.js の API を置き換える」という関心を抜くために先に置く**——カットオーバーの PR は触る範囲が広いので、混ぜると何が壊れたか切り分けられない。

剥がす5か所は次のとおり（実測。`docs/framework/intent.md` H1）。

| import | 箇所 | 置き換え先 |
| --- | --- | --- |
| `next/navigation` の `notFound` | `app/company/[id]/page.tsx` | ルート側の分岐に寄せる |
| `next/navigation` の `usePathname` | `HeaderSearch.tsx`・`BrandLink.tsx` | `location.pathname` を読む薄いフック |
| `next/link` の `Link`・`useLinkStatus` | `NavLink.tsx` | `NavLink` の中だけで完結させる |
| `next/script` の `Script` | `app/layout.tsx` | 素の `<script>` |

**型（`Metadata`・`MetadataRoute`・`Viewport`・`NextConfig`）はこの Unit では触らない。** 実行時のコードが0バイトなので、F1 でルーティングごと移すときに一緒に消える。

- **`eslint.config.mjs` の `no-restricted-imports`（`next/link` の直接 import を止めている）は残す。** 対象を自前の層に付け替える
- **`usePathname` の置き換えは `lib/history/` の規則に乗せる**——あそこが「URL を読む・書く」の1か所になっている（U14・#108）

## F1 Astro へ移す（カットオーバー）

spec.md の 1.・3.・4. と 2. の全部。

**分けられない。** `app/` を消してルーティングを移した時点で、メタデータもキャッシュも `run_worker_first` も同時に移さないとデプロイが通らない。**そのぶん検証を厚くする。**

- **`/` だけ `export const prerender = false`。** 他は全部ビルド時に生成する（AC-1・AC-2）
- **`trailingSlash: "never"` ＋ `build: { format: "file" }`。** これが無いと `/about/` になり、ADR-0006 の canonical と食い違う（実測で確認済み）
- **`RankingApp`・`CompanyDetail` は `client:load` の島1つに収める。** 島を2つ重ねると props が2回直列化される（`LogoIdsProvider` を別の島にして実際にそうなった。`/` の HTML が 733,979 B まで膨らんだ）
- **E2E 4ファイルの付け替え**（AC-6）。`prefetch-loop.spec.ts` は守る対象（RSC のプリフェッチ暴走・#183）ごと消えるので落としてよい。`cache-headers`・`theme`・`network` は性質を引き継ぐ
- **AC-1 は E2E で固定する。** 「`/about` と `/company/[id]` が Worker を起こさない」ことを、CPU が床のままであることで確かめる。**ヘッダでは判らない**
- **`wrangler.jsonc` は main に入るまで効かない**（2026-08-21・#119）。ブランチのプレビューでの結果で「効かない」と判断しないこと

## F2 遷移の待ち表示を作り直す

spec.md の 2.（AC-5）。

**作ると決めていない Unit。** `NavProgressBar`（`useLinkStatus`）は `prefetch={false}` の代償として入れたもので、**RSC ペイロードの到着を待つ時間を埋めるためだった**（`docs/company/company-page/design.md`）。移行後は静的アセットの取得になるので、その待ち自体が変わる。

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
