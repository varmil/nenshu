# plan.md — F1 Astro へ移す（カットオーバー）

Issue [#209](https://github.com/varmil/nenshu/issues/209)。spec は `docs/framework/spec.md`、決定は ADR-0014、実測は `docs/framework/intent.md`、分解は `docs/framework/overview.md`。

**1つの PR で切り替える。分けられない。** `app/` を消してルーティングを移した時点で、メタデータもキャッシュも `run_worker_first` も同時に移さないとデプロイが通らない。**そのぶん検証を厚くする。**

## 進め方

**足場 → 静的な面 → `/` → 周辺（メタ・キャッシュ・ルーティング）→ 検証**の順で当てる。**Next.js は最後まで消さない**——`/` が Astro で描けることを確かめる前に消すと、戻る先が無くなる。

**1. 足場を作る。** Astro ＋ `@astrojs/cloudflare` ＋ `@astrojs/react` ＋ Tailwind を入れ、**`app/` と併存させる。** この時点では画面を1枚も移さない。

- **`trailingSlash: "never"` ＋ `build: { format: "file" }` を最初に入れる。** 既定は `/about/` で、ADR-0006 の canonical と食い違う（プローブで実測済み）
- **`wrangler.jsonc` を先に置く。** `@astrojs/cloudflare` は設定ファイルが無いと Pages モードに落ちる（SvelteKit で踏んだのと同じ形の罠が Astro にもあるか確かめる）
- **`@` の別名を `web/` に向ける。** `features/`・`design-system/`・`lib/` を1行も動かさない

**2. `/about` から移す。** 静的で、島を持たず、メタデータが素の `Metadata` 1つ。**カットオーバーで最も小さい単位**なので、ここで「Astro のページが React コンポーネントを描き、`_headers` でキャッシュが付き、Worker を起こさずに返る」まで通す。

**3. `/company/[id]` を移す。** `getStaticPaths` で2,961社。**ここで初めて島（`client:load`）が要る。**

- **島は1つに収める。** `LogoIdsProvider` を別の島にすると props が2回直列化される（プローブで `/` が 733,979 B まで膨らんだ）
- **ビルド時間を測る。** 2,961ページの生成が現実的な時間で終わるか

**4. `/` を移す。** 唯一の SSR ルート（`export const prerender = false`）。

- `searchParams` は `Astro.url.searchParams`
- **キャッシュヘッダはここで `Astro.response.headers` に付ける**（`/` だけが Worker を通るため）
- **HTML の大きさを gzip で前後比較する**（E0 後の 19,860 B が相手）

**5. `sitemap.xml` と `robots.txt` を移す。** `MetadataRoute` の型をやめ、文字列を返す静的エンドポイントにする。**`lib/seo/` の `agePath`・`industryPath`・`absoluteUrl` は1行も変えない**——canonical と sitemap が同じ関数を共有している性質（U8）を壊さない。

**6. メタデータの出口を差し替える。** `toMetadata()` が返す `Metadata` は Next.js の形なので、**`PageMeta` から head のタグを描くコンポーネントに置き換える。**

- **`PageMeta` を作る純粋関数（`rankingPageMeta`・`companyPageMeta`・`aboutMetadata` の中身）は1行も変えない**——文言の出どころが1か所という U16 の性質がこの Unit の担保になる
- **`usePageMeta`（クライアント側の書き換え）はそのまま使えるはず。** あれは DOM を直接触るので、描いたのが Next.js でも Astro でも変わらない。**`<title>` を React が書き戻す問題（U16）が Astro でも起きるかは確かめる**——起きないなら `MutationObserver` は要らなくなる

**7. キャッシュ規則を作り直す。** `lib/cache/headers.ts` の中身が変わる。

- **`RSC_BYPASS_RULE` は消える。** 守っていた相手（`RSC: 1` の307）ごと無くなる
- **`/about`・`/company/[id]`・`/sitemap.xml`・`/robots.txt` は `public/_headers` へ移る**（静的アセットになるので `headers()` は通らない）
- **`/` だけが実行時のヘッダになる**
- **`_next/static/*` → `_astro/*`。** アダプタが `_headers` に自分で足すので、**二重に書かない**

**8. `wrangler.jsonc` の `run_worker_first` を `/` だけにする。** ここを縮め忘れると、アセットで返せるページが Worker を通り続ける——**この Unit の目的そのものが達成されない。**

**9. Next.js を消す。** `app/`・`next.config.ts`・`open-next.config.ts`・`next` と `@opennextjs/cloudflare` の依存・`AGENTS.md`（`next dev` が書くもの）。**`package.json` を変えたら `npm install` を同じコミットに入れる**（CLAUDE.md）。

## 検証の順序

**各ステップの直後に型チェックと Unit テストを回す。** まとめない。

**E2E は4ファイルを付け替える**（AC-6）。**何を守っていたかを引き継ぐ**——消してよいのは守る対象そのものが無くなったものだけ。

| ファイル | 扱い |
| --- | --- |
| `prefetch-loop.spec.ts` | **落とす。** 守っていた RSC のプリフェッチ暴走（#183）ごと消える |
| `cache-headers.spec.ts` | 引き継ぐ。`/` は実行時、他はアセットの `_headers` |
| `theme.spec.ts` | 引き継ぐ。FOUC は生の HTTP 応答を見る性質（AC-9） |
| `network.ts` | 引き継ぐ。`_next/static` の綴りが `_astro` に変わる |

**AC-1 は「CPU が床のままか」で固定する。** ヘッダでは判らない（`x-nextjs-*` は移行後に存在しない）。**`wrangler dev --local` に向けた新しい E2E が要る。**

**Worker に向けて回すものが増える。** ヘッダ・SEO・404・アセットのルーティング・そして新しい AC-1 のテスト。**dev サーバーには `run_worker_first` が効かない**ので、そこだけでは足りない（CLAUDE.md）。

**最後に全部通す。** `typecheck`・`lint`・`build`・`vitest`・`playwright`（dev）・`playwright`（Worker）。

**バンドルを `wrangler deploy --dry-run` で測る**（AC-4）。見込みは gzip 1,876 KiB → 522 KiB。

## 決め打ちにしないこと

**`NavLink` をどうするか。** 素の `a` 要素にすると `navProgress` を呼ぶ主体が遷移先に残らない。**待ち表示を残すかは F2 の判断**なので、この Unit では「壊れていない状態」までにする。

**`lib/history/pathname.ts` の history パッチ。** F0 で入れたもので、Astro の遷移がヘッダごと作り直すなら不要になる。**要らないことを確かめてから消す**——確かめずに消すと、F0 で E2E に固定した「打ちかけた語が残らない」が静かに壊れる。

## この Unit で決めないこと

**`/` の CPU**（→ ADR-0013・E0。マージ済み）。**ファセットのパス化**（→ ADR-0006 の再検討）。**画面の追加・変更**（spec 2.）。
