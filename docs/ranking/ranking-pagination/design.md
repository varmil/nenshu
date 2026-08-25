# U6 0件・端の状態と段階表示 — design.md

Unit内部の構造。

## 構成

```
docs/ranking/spec.md                                  # §1.7/1.8/1.9を更新（既存を修正）
web/features/ranking/types.ts                         # visibleCount→page、PAGE_SIZE定数（既存を修正）
web/features/ranking/lib/urlState.ts                   # pageのbuild/parse追加（既存を修正）
web/features/ranking/lib/rank.ts                       # {companies, totalCount}を返す・ページ切り出し（既存を修正）
web/features/ranking/lib/pagination.ts                 # ページ番号範囲の計算（新規）
web/features/ranking/lib/pagination.test.ts             # 同上のテスト（新規）
web/design-system/ui/pagination.tsx                     # shadcnプリミティブ（新規、npx shadcn add pagination）
web/features/ranking/components/RankingPagination.tsx  # ページネーションUI（新規）
web/features/ranking/components/RankingApp.tsx          # 0件案内・page:1リセット・RankingPagination組み込み（既存を修正）
web/features/ranking/hooks/useRankingState.ts           # totalCountを返すよう変更（既存を修正）
web/e2e/ranking-pagination.spec.ts                       # E2E（新規）
```

## 検討したが不採用: `next/link`の`<Link>`による実ナビゲーション＋Suspense

当初、ページ送りの「読み込み中」状態をNext.jsのSuspense機構（`app/loading.tsx`）で自然に表現する案を検討した（ユーザー提案）。spec.md §3の「応答」要件（100ms以内・ネットワークアクセスを伴わない）は文言上「年齢スイッチ・フィルタ・検索」に限定されており、ページ送りは対象外なので、ページ送りだけ実ナビゲーションにすることは仕様上は可能だった。

しかし実装前に本番のレスポンスを実測したところ、**現在すでに1,867社ぶんの全企業データが初回HTMLにembedされている**（gzip後64KB、spec.mdの100KB予算の64%。`RankingApp`が`"use client"`で`companies`/`curves`をpropsに受け取り、Next.jsがクライアント側のハイドレーション用データとして丸ごとシリアライズするため）。つまり**クライアントは初回ロードの時点で全件を既に保持している。** この前提がある限り、ページ送りのたびに`<Link>`で新しいRSCペイロードを取得しても、取得できるデータはクライアントが既に持っているものと同じで、通信する意味がない。むしろ、フィルタ用の独自`pushState`履歴管理とNext.js管理の履歴（`<Link>`ナビゲーション用）が混在する複雑さだけが増える。

**将来、掲載企業数を増やす際（Issue #22、有価証券報告書全件で4,000社規模を見込む）に、この「全件embed」アーキテクチャ自体を見直す可能性が高い。** spec.mdの100KB予算に対し、1,867社で既に64KBを消費しており、単純な比例計算で4,000社では137KB程度になり予算超過が見込まれる。そのときは「クライアントは全件を持たない」前提に変わるため、ページ送りの通信化（`<Link>`+Suspense）を改めて検討する価値が出る。今回はその前提が無いため、既存のフィルタと同じクライアント側完結（`pushState`、ネットワーク非発生）で実装した。この経緯はIssue #22にもコメントして残す。

**2026-08-25 追記（E0・Issue #174・ADR-0013）: 全件embed はやめた。** 母集団が 2,961社になり、`/` の HTML が gzip 91,724 B ＝ 予算の 91.8% まで来たため、全件を**静的アセット（`/data/companies.json?v=…`）として初回に1度だけ配る**形に変えた（`docs/expansion/initial-payload/design.md`）。

**上の「クライアントは初回ロードの時点で全件を既に保持している」は「初回ロード後は保持している」に読み替える。** ページ送りの結論そのものは変わっていない——**届いた後の操作はいまも全部クライアント側で完結し、ネットワークを起こさない**（`docs/ranking/spec.md` AC-7）。変わったのは**届く前**で、そこだけ実ナビゲーション（`window.location.assign`）に倒れる。`<Link>` + Suspense を採らない理由も変わっていない：届いた後は取りに行く先が無く、届く前に要るのは素の遷移だけで、どちらも `<Link>` の履歴管理を持ち込む理由にならない。

## `lib/rank.ts` の変更

```ts
export interface RankedCompaniesResult {
  companies: RankedCompany[];
  totalCount: number;
}

export function buildRankedCompanies(
  companies: CompaniesData,
  curves: CurvesData,
  state: RankingState
): RankedCompaniesResult {
  // ...フィルタ→補正年収の計算→ソート→ランク付与、はU2から無変更...

  const totalCount = ranked.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(state.page, totalPages);

  return {
    companies: ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    totalCount,
  };
}
```

- `totalCount`はフィルタ後・ページ切り出し前の件数。0件判定（AC-8）と総ページ数の算出の両方に使う。
- **要求された`page`が総ページ数を超える場合は、内部で最終ページにクランプしてスライスする。** `state.page`自体（URLやReactのstate）は書き換えない——実装をシンプルに保つための意図的な割り切り。`?page=999999`のような不正なURLを直接開いても、クラッシュせず最終ページの内容が返る（E2Eで確認）。ページネーションUIの「アクティブなページ番号」表示は`state.page`（クランプ前の値）を使うため、この状況では見た目上どのページ番号もアクティブに見えない状態になりうるが、実運用でユーザーが手でこの範囲のURLを叩くことは稀と判断し、割り切った。

## `lib/pagination.ts`（新規）

ページネーションUIに表示するページ番号の並び（先頭・末尾・現在ページの前後1ページ、間は省略記号）を計算する、Reactに依存しない純粋関数。`Set`で表示すべきページ番号を集め、ソート後に隣接ページとの差が1より大きい箇所に`"ellipsis"`を挿む方式。ページ数が少ないときは自然に省略記号が出ない（特別扱いのコードが不要）。

## `components/RankingPagination.tsx`（新規）

- 各`PaginationLink`の`href`は`buildSearchParams({...state, page: n}).toString()`から生成する。現在のフィルタを保持したままの完全なクエリ文字列になるため、クロールされれば直接そのURLがSSRで正しく返る。
- クリック時は`e.preventDefault()`し、`useTransition()`の`startTransition`でラップした`onPageChange(n)`（＝`setState`）を呼ぶ。`pushState`経路（`useRankingState`の書き込みeffect）にそのまま乗る。
- **「読み込み中の状態」（Issue #7の完了条件）は`useTransition()`の`isPending`で表現する。** 1ページぶんの再描画は通常一瞬で終わるため、実際に目に見える保留状態にならないことが多い。U5の`useLayoutEffect`チラつきの件と同様、**この保留状態が安定してE2Eで検証できるとは限らない**（今回のE2Eでは`isPending`の可視化自体はテストしていない。ネットワーク非発生・URL反映・内容の変化は確認済み）。
- shadcnの`PaginationLink`/`PaginationPrevious`/`PaginationNext`は内部で`Button`コンポーネントを`render`propで`<a>`に差し替えている実装で、**`role="button"`が明示的に付与される**（`<a href>`だが実装上は`role="link"`にならない）。E2Eのロケータは`getByRole("button", ...)`を使う必要がある（`getByRole("link", ...)`ではタイムアウトする。実際に踏んだ）。
- `PaginationPrevious`/`PaginationNext`の`aria-label`はshadcnの既定で英語（"Go to previous/next page"）固定。日本語UIとの整合とE2Eの安定したセレクタ確保を兼ねて、`aria-label="前のページへ"`/`"次のページへ"`で明示的に上書きした（`{...props}`が既定の`aria-label`より後にスプレッドされるため、propsで渡すだけで上書きできる）。

## ページ送りの後は最上部へ戻す（Issue #96、2026-08-20）

`RankingPagination` の `goTo` は `startTransition` の直後に `scrollToPageTop()`（`lib/scroll.ts`）を呼ぶ。

**ページ送りのボタンは表1ページぶん下にある。** スクロール位置を保ったまま行だけ入れ替わると、変わったのは画面の上のほう＝視界の外なので、「押しても何も起きていない」ように見える（公開後の指摘。1ページ100件だった頃の実測でボタンの位置は `scrollY = 5,653`。30件でも表の高さは1画面を超えるので事情は変わらない）。

- **戻す先はページ最上部**（`{ top: 0, left: 0 }`）。表の先頭ではなく見出しまで戻す——ページが変わったことは見出し直下の「1,867社 中 31〜60社目」で読める。
- **`behavior` は指定しない**（＝一瞬で戻す）。`smooth` にすると表1ページぶんの距離を流れることになり、`prefers-reduced-motion` への配慮も要る。ページ送りは離散的な操作なので途中の景色に意味が無い。
- **呼ぶ場所は `goTo` の中**。先頭の `if` で「範囲外・同じページ」を弾いた後なので、**実際にページが変わるときだけ**戻る。無効化された「前へ」を押しても位置は動かない。
- `window` は引数で受ける（既定値 `globalThis.window`）。node 環境の vitest から呼べるようにするためで、SSR で読み込まれても評価時には何も起きない。

## 1ページの件数は30件（Issue #103、2026-08-20）

`PAGE_SIZE = 30`（`web/features/ranking/types.ts`）。公開当初は100件だったが、1画面のスクロール量として多すぎるという指摘を受けて減らした。1,867社は63ページになる。

**この定数はページの重さを決める値ではない。** 全1,867社ぶんのデータは表示件数に関わらずハイドレーション用に初回HTMLへ埋まっている（Issue #22）ので、減らして軽くなるのは描画する行数ぶんだけ——実測でトップページの HTML は gzip 70,283 B → 62,563 B（`next start` に対して計測。同じ手法で `/company/[id]` は変化なし）。Issue #22 の全件embedの問題はこれで解けたわけではない。

**E0（#174）で全件embed をやめた後は、`PAGE_SIZE` が HTML の重さを決める値になった。** サーバーが渡すのは1ページぶん（`RankingBootstrap.page`）だけなので、増やせばそのぶん HTML が増える。

**行数を「絞り込みが効いたか」の判定に使っているテストは書き換えた。** 1ページの行数は `PAGE_SIZE` で頭打ちなので、「業種を選ぶと100行未満になる」「銀行業は82行」といったアサーションは、絞り込みが壊れても通ってしまう。件数表示（`82社 中 1〜30社目`）で見るように直した（`e2e/ranking-basis.spec.ts`・`e2e/ranking-url-sync.spec.ts`・`e2e/ranking-filters.spec.ts`）。同じ理由で `rank.test.ts` の「上位50社の重なり」はページを継ぎ足して50社を作る。

`<Link prefetch={false}>` の件数も100→30に減るが、**先読みは元から0件**なので `npm run measure:prefetch` の結果は変わらない（実測で `/company/` への先読み0件）。

## `components/RankingApp.tsx` の変更

- 各フィルタ・年齢・検索語の`onChange`ハンドラに`page: 1`を追加した（`setState(prev => ({...prev, key: value, page: 1}))`）。ページネーション自体のクリック（`handlePageChange`）だけは`page`のみを変える。
- `totalCount === 0`のとき、`RankingTable`/`RankingCardList`/`RankingPagination`の代わりに案内メッセージを表示する。`text-muted-foreground`のみでdestructive系のスタイルは使わない（AC-8「エラー表示にはしない」）。

## テスト方針

- `rank.test.ts`: `totalCount`の算出、pageによる正しいオフセットの切り出し（2ページ目の先頭が`rank = PAGE_SIZE + 1`になること）、範囲外pageのクランプ、0件時に`companies`が空配列になることを固定。既存のAC-1〜AC-6のテストは新しい返り値の形（`{companies, totalCount}`）に合わせて書き換えた。
- `urlState.test.ts`: `page`のparse（正常値・0/負数/非数値は無視）・build（既定値1は省略、末尾に付く）・カノニカル順序のテストを追加。
- `scroll.test.ts`: `scrollToPageTop` が `{top: 0, left: 0}` で呼ぶこと・`behavior` を渡さないこと・`window` が無い環境で落ちないこと。
- `pagination.test.ts`: `getPaginationRange`の境界値（総ページ数0/1、先頭付近・末尾付近・中間、隙間が1ページしかない場合に省略記号が出ないこと）を固定。
- E2E（`web/e2e/ranking-pagination.spec.ts`）:
  - AC-8: 0件のとき案内が表示され、`<table>`が存在しないこと。
  - ページ送りクリックで内容（1位→`PAGE_SIZE + 1`位の会社名）が変わり、URLに`page=2`が反映されること。
  - フィルタ変更で`page`パラメータがURLから消える（1に戻る）こと。
  - ページ送り操作中にネットワークリクエストが発生しないこと（U5と同じ手法）。
  - ページ送りを押すと `window.scrollY` が0に戻ること（Issue #96。ボタンまでスクロールしてから押し、押す前が0でないことも確かめる）。
  - `?page=2`・`?page=999999`への生HTTPリクエスト（JS実行なし）で、SSRの時点で正しい内容（クランプ後の最終ページ含む）が返ること（U5フォローアップと同じ手法。`<table>`部分だけを正規表現で取り出して検証する——U5フォローアップで判明した「companies.json全件がハイドレーション用データとして埋め込まれる」問題を踏まえた手法）。
