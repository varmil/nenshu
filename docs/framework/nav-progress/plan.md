# plan.md — F2 遷移の待ち表示を作り直す

Issue [#210](https://github.com/varmil/nenshu/issues/210)。spec は `docs/framework/spec.md` AC-5、決定は ADR-0014、入れた経緯は `docs/company/company-page/design.md`、分解は `docs/framework/overview.md`。

**作ると決めていない Unit。** まず測って、要らないなら消す（Issue の AC-4）。**測る前に手を動かさない。**

## 進め方

**1. 遷移時間を測る。** dev サーバーではなく本番相当で（AC-1）。

- `wrangler dev --local` に対して `/`・`/about`・`/company/[id]` の TTFB と総転送時間。**サーバー側の取り分を切り出す**
- 本番（`https://openreport.net/`）に対して同じもの。**実ネットワークを含む**が、このコンテナからは proxy 越しになるので上振れする——**その断りごと記録する**
- **`/company/[id]` → `/` だけは Worker を通る**（`/` が唯一の SSR ルート）。待ちが出るとすればここなので、別に測る

**2. 「ブラウザ標準の指示器で足りるか」を決める。** 実測値と、運営者が実機で確かめた事実（モバイルではブラウザのプログレスバーが出る）を突き合わせる。

**3. 足りるなら消す。** 消す対象を先に数え上げてから手を付ける——**1つ残すと「なぜこれだけ残っているのか」が答えられなくなる。**

- `features/navigation/components/NavProgressBar.tsx`（島）
- `features/navigation/lib/navProgress.ts` とその単体テスト
- `features/navigation/lib/navIntent.ts`（どれを遷移と見なすかの純粋関数）
- `e2e/navigation-progress.spec.ts`
- `styles/globals.css` の `.nav-progress` と keyframes
- `src/layouts/Base.astro` からの取り付け
- **`features/navigation/components/NavLink.tsx` も。** バーが無くなると `a` 要素に `prefetch` プロップを捨てるだけの包みになる。**業種チップと `/about` の本文にはすでに素の a 要素が置かれている**ので、残すと「2つの書き方があるのに区別する理由が無い」状態になる

**4. 規約を書き換える。** 消したものを指している記述を残さない。

- CLAUDE.md の「ページ間の遷移は `NavLink` を使う」「遷移中のバーは `NavProgressBar` が…」
- `docs/framework/overview.md` の F2 の行
- `docs/company/company-page/design.md`（バーを入れた経緯。**消さずに「消した」ことを追記する**——なぜ入れたかは残す価値がある）
- `eslint.config.mjs`。**`astro:transitions` の禁止は残す**（ADR-0014。素の HTML 取得であることが静的アセットで返せる前提）

## 検証の順序

**消したあとに回すのは、消したことで壊れていないことの確認になる。**

- `typecheck`・`lint`・`vitest`——`navProgress.test.ts` が消えるぶんテスト数が減ることを確かめる
- `astro build`——島が3→2に減る。**`/` と `/company/[id]` の HTML を前後で測る**
- `playwright`（dev）——`navigation-progress.spec.ts` が消えるぶん件数が減る。**それ以外が1件も落ちないこと**が本体
- `playwright`（`wrangler dev`）——ルーティングとヘッダは触っていないので変わらないはずだが、`Base.astro` を触るので回す

## この Unit で決めないこと

**プリフェッチの復活**（Issue の非対象。`prefetch={false}` にした理由は移行後も変わらない）。**`astro:transitions` を入れること**（ADR-0014 が禁じている）。**`/` の CPU**（→ ADR-0013・E0）。
