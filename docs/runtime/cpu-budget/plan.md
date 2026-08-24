# plan.md — R1 企業詳細ページを事前生成する

Issue: [#180](https://github.com/varmil/nenshu/issues/180)（親: [#118](https://github.com/varmil/nenshu/issues/118)）
仕様: `docs/runtime/spec.md` 1.・2.（AC-1〜AC-12）
参照: `docs/adr/0012-prerender-company-pages.md`, `docs/adr/0004-ssr-opennext-cloudflare.md`

着手前の段取り。**測ってから直し、直してから同じ手法で測り直す**——CPU は環境で数倍変わるので、前後を同じ物差しで並べないと効いたかどうか言えない。

## 手順

1. **測り方を先に決めて、現状を記録する。**
   1. `npx opennextjs-cloudflare build` → `npx wrangler dev --local`
   2. `/proc/<workerd>/schedstat` の第1フィールド（ns）の差分を N リクエストで割る。**静的アセット（`/favicon.ico`）も一緒に測って床にする**
   3. `/company/[id]`・`/`・`/about` を記録する
2. **`incrementalCache` を先に挿す。** 事前生成しても、これが無ければ結果は1枚も返らない。
   1. `open-next.config.ts` に `staticAssetsIncrementalCache` を入れる
   2. `/about` の CPU を測り直す。**ここで下がらなければ以降の前提が崩れている**ので、先へ進まない
3. **`?age=` を企業詳細から外す。** 事前生成の前提条件（`force-static` は `searchParams` を読めない）。
   1. `CompanyDetail` の表示基準を `useLocationSyncedState` から素の `useState` に移す
   2. 配ってしまった `?age=N` を `replaceState` で掃除する（読みはしない）
   3. `lib/seo/company.ts` から表示基準の引数を落とす。**`usePageMeta` は呼び続ける**——ランキングから遷移してきたときに前のページの canonical が残るため
   4. Unit テストを直す
4. **事前生成する。**
   1. `app/company/[id]/page.tsx` に `generateStaticParams`・`dynamic = "force-static"`・`dynamicParams = false`
   2. `searchParams` を Props から落とす
   3. ビルドして `●` が1,867社ぶん出ることと、ビルド時間・アセットのファイル数と容量を記録する
5. **E2E を書き換える。**
   1. `?age=N` を直接開いていたテストを、状態操作（年齢そろえ → 年齢）に置き換える
   2. 「URLに age が出る」を確かめていたテストを「URLが変わらない」に反転させる
   3. 古い `?age=N` のリンクが掃除されることのテストを足す
   4. dev サーバーに対して全件通す
6. **Worker に向けて確かめる。**
   1. アセットにキャッシュが配置されることを確かめる（`wrangler.jsonc` の `build.command`）。**ここが走らないと全ページ 404 になるが、ビルドもデプロイも成功と表示される**
   2. `E2E_BASE_URL=http://127.0.0.1:<port> npx playwright test e2e/cache-headers.spec.ts e2e/seo.spec.ts`。**キャッシュ経由に変わるのでヘッダは必ずここで確かめる**（CLAUDE.md「`headers()` を触ったら E2E を Worker に向けて回す」と同じ理由）
   3. 404（`dynamicParams = false`）を実際に叩く
7. **手順1と同じ手法で測り直し、前後を並べる。**
8. **`/` のHTMLサイズと `npm run measure:prefetch` を確かめる**（AC-12。プリフェッチは本番ビルドでしか動かないので E2E では見えない）。
9. **design.md に、測った値と決まった構造を書く。** ADR-0012 に不可逆な決定（`?age=` を出さない・全件事前生成）を切り出す。

## 検証の順序

**`incrementalCache` → `?age=` → 事前生成、の順に入れる。** 逆にすると、事前生成した結果が返らないまま「効かない」と判断することになる（手順2の確認はそのために置いてある）。

**E2E は dev サーバーで全件、Worker では ヘッダ・SEO・404 だけ。** 「操作でネットワークが発生しない」系のテストは**本番ビルドのプリフェッチを拾うので Worker 相手には通らない**——これは R1 の前からそうで、`npm run measure:prefetch` が別に見ている領域（CLAUDE.md）。

## 想定される手戻り

**アセットの容量。** 1,874ページ × 約180KB で 340MB 前後になる。無料枠の上限はファイル数（20,000）と1ファイル（25MiB）なので収まるはずだが、**デプロイが通ることは本番に入れて初めて分かる**（`wrangler.jsonc` と同じで、ブランチのビルドで判断しない）。

**キャッシュ経由でヘッダが落ちる場合。** `enableCacheInterception` は Next.js のルーティングに入る前に返すので、`next.config.ts` の `headers()` が効かなくなる可能性がある。手順6で確かめ、落ちるようなら interception を切る。

**`?age=` を外したことで壊れる導線。** ランキングから企業詳細へ渡していた表示基準は無くなる。**もともと渡していない**（ランキングの会社名リンクは素の `/company/[id]`）ので影響しないはずだが、E2E で確かめる。
