# plan.md — R0 画面が読むデータと、1リクエストの計算を減らす

Issue: [#165](https://github.com/varmil/nenshu/issues/165)（親: [#118](https://github.com/varmil/nenshu/issues/118)）
仕様: `docs/runtime/spec.md` 2.・3.（AC-1〜AC-10）
参照: `docs/adr/0004-ssr-opennext-cloudflare.md`

着手前の段取り。**測ってから直し、直してから同じ手法で測り直す**——CPU は環境で数倍変わるので、前後を同じ物差しで並べないと効いたかどうか言えない。

## 手順

1. **測り方を先に決めて、現状を記録する。**
   1. `JSON.parse` をファイル単位で測る（Node 22・中央値41回）。ページごとに読んでいるファイルを足し上げて cold の内訳を出す
   2. `buildCompanyView`・`findNeighbors` をそれぞれ測る
   3. `npx opennextjs-cloudflare build` → `npx wrangler dev --local` に対して、`/proc/<workerd>/schedstat` の差分を N リクエストで割って1リクエストあたりの CPU を出す。warm と cold（起動直後の初回）を分けて記録する
2. **切り出す側（パイプライン）から直す。** web 側を先に変えると、読むファイルがまだ無い状態になる。
   1. `build-data.ts` に `population.json` を書かせる。`stats.json` と同じ値であることを生成時に確かめる
   2. `build-logos.ts` に `logo-ids.json` を書かせる。`logos.json` の `byId` のキーと一致することを生成時に確かめる
   3. 両方の生成物についてテストを足す（AC-4・AC-5）
   4. 生成し直して差分を見る。**`stats.json`・`logos.json` 自体は1バイトも変わらないこと**を確かめる
3. **ページの import を差し替える。**
   1. `/` を `population.json`・`logo-ids.json` に切り替える
   2. `/company/[id]` を `logo-ids.json` に切り替える
   3. `/about` はそのまま（`logos.json` の帰属表示を使っている）
4. **lint で戻れなくする。** `eslint.config.mjs` にページ単位の `no-restricted-imports` を足し、**わざと違反を書いて落ちることを確かめてから**消す（AC-3）。
5. **リクエストごとの計算を1回にする。**
   1. `buildCompanyView` の呼び出しを1本にまとめる（AC-6）
   2. `findNeighbors` の全表走査を isolate ごとの索引に置き換える（AC-7）
   3. 既存の Unit テストが通ることを確かめる。**`findNeighbors` の戻り値が1件も変わらないことが条件**
6. **検証する。**
   1. `npm run lint` / `npm run typecheck` / `npm run test`（web・pipeline の両方）
   2. `npm run test:e2e` を全て通す（AC-8・AC-9。**画面を変えていないので、落ちたら直したのではなく壊したということ**）
   3. `/` のHTMLサイズを `next start` に対して測り直す（AC-10）
   4. 手順1と同じ手法で CPU を測り直し、前後を並べる
7. **design.md に、測った値と分割の規則を書く。** 決めた構造として書く（型は PDF p.13）。

## 検証の順序

**パイプライン → web の import → lint → 計算の重複、の順に入れる。** 逆にすると、途中で「読むファイルが無い」か「使われないファイルが増えただけ」の状態を経由する。

**E2E は最後にまとめて回す。** この Unit は画面を変えないので、E2E は「直ったか」ではなく「壊していないか」を見るために回す。

## 想定される手戻り

**`cache()` がリクエストをまたいでしまう場合。** またぐと、ある読者の会社の数字が別の読者に出る。**`generateMetadata` と本体で同じ id を渡したときだけ1回になり、id が違えば別々に走ることをテストで確かめる。**

**`logo-ids.json` と `logos.json` がずれる場合。** ずれるとロゴが消えるか、存在しない画像を読みに行く。生成時の検証とテストの両方で止める（AC-4）。

**効果が足りない場合。** spec 5. の静的生成に進む。**その判断は測ってからで、この Unit の中では決めない。**
