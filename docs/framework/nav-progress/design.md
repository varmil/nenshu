# design.md — F2 遷移の待ち表示を作り直す（作らずに消した）

Issue [#210](https://github.com/varmil/nenshu/issues/210)。spec は `docs/framework/spec.md` AC-5、決定は ADR-0014、入れた経緯は `docs/company/company-page/design.md`、段取りは同じディレクトリの `plan.md`。

**測った結果、作らないことにした。** Issue の AC-4（作らない場合）に従って、待ち表示を丸ごと落とす。

## 決定

**ページ間の遷移中に自前の指示器を出さない。ブラウザ標準に任せる。**

## なぜ

### 1. 入れた理由がもう無い

このバーは `prefetch={false}` の代償として入れたもので、**クリックから RSC ペイロードが届くまでの待ち**を埋めるためだった（`docs/company/company-page/design.md`）。**その待ち自体が F1 で消えた**——遷移は素の文書取得になり、ブラウザが本来の仕事として指示器を出す（運営者が実機で確認。**モバイルでは標準のプログレスバーが出る**）。

### 2. 自前のバーは仕事を全うできない

**始まりしか分からない。** 終わりは「文書ごと入れ替わった」ことでしか表現できず、完了を見せる相手がもう居ない。実際 **F1 以降 `navProgress.end()` を呼ぶ主体が1つも無く**、`phase` が `"finishing"` になる経路は存在しなかった——`.is-finishing` の CSS も `nav-progress-finish` の keyframes も `FINISH_MS` のタイマーも、**消す時点ですでに到達不能**だった。

中断・リダイレクト・遅いサブリソースも扱えない。**同じ事象に指示器を2つ出すのは、1つより悪い。**

### 3. 遷移が速い

`wrangler dev --local` に対する TTFB の中央値（10回）。**サーバー側の取り分**を切り出したもの。

| URL | TTFB | 総転送 |
| --- | --- | --- |
| `/about` | **4.3 ms** | 4.3 ms |
| `/company/6861` | **5.1 ms** | 5.5 ms |
| `/company/8058` | **5.3 ms** | 5.7 ms |
| `/`（warm） | 26.2 ms | 26.7 ms |
| `/`（cold・3回） | 88.5 / 102.2 / 98.6 ms | — |

本番（`https://openreport.net/`）に対して同じもの。**このコンテナからは proxy 越しなので上振れする**ので、床として小さな静的アセットを一緒に測った。

| URL | TTFB |
| --- | --- |
| `/favicon.svg`（床） | 183〜492 ms（中央値およそ 187 ms） |
| `/about` | **164.8 ms** |
| `/company/6861` | **161.1 ms** |
| `/` | 348.9 ms |

**`/about` と `/company/[id]` は床と区別が付かない。** つまり読者が待っているのはネットワークそのもので、**自前のバーが縮められる部分でも、説明を足せる部分でもない。** `/` だけは床より 160 ms ほど上に出るが、これは唯一 Worker を通るルートで（ADR-0006）、しかも CPU の 26 ms 以外はエッジの取り分になる。

**バーは元から 120 ms 遅れて現れる設計だった**（`animation-delay: 120ms`。ちらつき防止）。サーバー側の取り分が 4〜5 ms のページでは、**出るとすればネットワークが遅いときだけ**——それはブラウザ標準がすでに、しかも正確に扱っている場面である。

## 消したもの

| 対象 | 行数 |
| --- | --- |
| `features/navigation/components/NavProgressBar.tsx`（島） | 81 |
| `features/navigation/lib/navProgress.ts` | 86 |
| `features/navigation/lib/navProgress.test.ts` | 95 |
| `features/navigation/lib/navIntent.ts`（どれを遷移と見なすかの純粋関数） | 63 |
| `e2e/navigation-progress.spec.ts` | 139 |
| `styles/globals.css` の `.nav-progress` と keyframes | 71 |
| `features/navigation/components/NavLink.tsx` | 30 |

**`NavLink` も消した。** バーが無くなると `a` 要素に `prefetch` プロップを捨てるだけの包みになる。**業種チップと `/about` の本文にはすでに素の `a` 要素が置かれていた**ので、残すと「2つの書き方があるのに区別する理由が無い」状態になる。9ファイル・26箇所を素の `a` に開いた。

**`prefetch={false}` の理由を書いたコメント3か所も消した**（`RankingTable`・`RankingCardList`・`NeighborCompanies`・`CompanyDetail`）。直すのではなく消す——**プリフェッチという概念ごと無くなっている**（F1）。なぜ切っていたか自体は CLAUDE.md に残る。

**`eslint.config.mjs` の `no-restricted-imports` は `astro:transitions` の1件だけになった。** `next/link` を止めていたのは F1 まで、`NavLink` を通させていたのは F2 まで——**どちらもバーのための縛り**だった。`astro:transitions` の禁止は残す（ADR-0014。素の HTML 取得であることが、事前生成したページを静的アセットで返せる前提）。

## 効果

`wrangler dev --local` に対して、削除の前後を同じ手法で測った（body のバイト数）。

| URL | 前 raw / gzip | 後 raw / gzip | 差（raw） |
| --- | --- | --- | --- |
| `/` | 246,536 / 19,480 | **246,251 / 19,431** | −285 B |
| `/about` | 48,221 / 12,950 | **47,935 / 12,899** | −286 B |
| `/company/6861` | 144,084 / 19,546 | **143,798 / 19,502** | −286 B |
| `/company/8058` | 149,227 / 20,797 | **148,941 / 20,754** | −286 B |

**全ページから同じ 286 B が消える**（島1つぶんの `astro-island` 要素）。**2,964ページで合わせておよそ 828 KB。**

**クライアントの JS は 452,049 → 449,806 B（−2,243 B）、11 → 9 ファイル。** 島が減るので、**全ページでハイドレーションが1つ減る**（`/about` は 2→1、`/company/[id]` は 3→2、`/` は 3→2）。`document` に張っていたクリックの委譲リスナーも無くなる。

**Worker の CPU は変わらない**（床 3.9 ms・`/about` 3.7 ms・`/company/6861` 4.0 ms・`/` 26.6 ms）。消えたのはクライアント側の仕事なので、ここは動かないのが正しい。

## 残したもの

**`BrandLink`。** `/` の上でサイト名を押したときに絞り込みを解く役があり（`pushRankingReset()`）、遷移の待ちとは関係がない。素の `a` 要素を返すようになっただけ。

**`features/navigation/` そのもの。** `SiteHeader`・`HeaderSearch`・`BrandLink` が残る。

## この Unit で決めなかったこと

**プリフェッチの復活**（Issue の非対象）。**`astro:transitions` を入れること**（ADR-0014 が禁じている）。**`/` の CPU**（→ ADR-0013・E0）。
