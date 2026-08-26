# plan.md — F0 `next/*` への依存を剥がす

Issue [#208](https://github.com/varmil/nenshu/issues/208)。spec は `docs/framework/spec.md` の 2.（AC-5・AC-6）、決定は ADR-0014、分解は `docs/framework/overview.md`。

**Next.js のまま完結させる。** main は動き続け、デプロイも通る状態を保つ。

## 進め方

**1. 剥がす順に、影響の小さいものから当てる。** 5か所は独立しているので、1つずつ「置き換える → 型チェックと Unit テスト → 次へ」で進める。まとめて当てて壊れると、どれが原因か切り分けられない。

順序は `Script` → `notFound` → `usePathname` → `Link`/`useLinkStatus`。**後ろほど振る舞いに関わる。**

**2. `Script` から始める。** `app/layout.tsx` の Clarity だけが使っている。**本番ビルドでしか出ない**ので、`isClarityEnabled` の分岐が保たれることを Unit テストで確かめ、生成された HTML にタグが1つだけ入ることを見る。

**3. `notFound` を外す。** `dynamicParams = false` があるので、`companies.json` に無いIDは**ページ本体に届く前に** 404 になる。**つまりこの呼び出しは到達不能**——`generateStaticParams` が返したIDで `buildCompanyView` が `null` を返すのは、データが自己矛盾しているときだけになる。**404 に倒すのではなく、ビルドを落とす形に置き換える。** 到達不能であることを、その場のコメントではなく型で示す。

**4. `usePathname` を外す。** ここがこの Unit で唯一、振る舞いを壊しうる場所になる。

- **`BrandLink` はフックが要らない。** パスを使うのは `onClick` の中だけなので、**クリックの瞬間に読む**ほうが正しい（レンダー時の値は古くなりうる）
- **`HeaderSearch` は2つに分けて考える。** `handleSubmit`・`onChange` はイベントの中なので同じくその場で読める。**残るのは「`?q=` から入力欄を合わせる」effect の1つだけ**で、ここだけが「いまランキングにいるか」を継続的に知る必要がある

**先に確かめること。** いまは `usePathname` が React の context なので、**ヘッダが再レンダーされなくてもパスの変化を拾えている。** 外すとその経路が消えるので、`/about` から `/` へ移ったときに入力欄が同期し直されるかが変わりうる。**推測で作り込まず、E2E を先に書いて落ちるかを見る。**

- 落ちなければ、その場で読む実装のままにする
- 落ちたら、`lib/history/` に「パスの変化を購読する」1か所を作って直す。**`history.pushState` を差し替えるライブラリ流の解法は採らない**（CLAUDE.md。当サイトは自分で `pushState` を呼んでいる）

**5. `Link` と `useLinkStatus` は F0 では外さない**（着手して分かったので、この段取りを改めた）。

**当初は「`NavLink` の中だけで完結させる」つもりだった。** 実際に書いてみて、それが成り立たないことが分かった——**`next/link` はクライアント遷移そのもの**で、素の `<a>` に替えるとページ遷移が全ページ再読み込みになる。それはこの Unit が「やらない」と決めたこと（すぐ上の段落に自分でそう書いていた）に真正面からぶつかる。

**`next/link` を外すこと ＝ 遷移の方式を変えること**であり、それは F1 の中身そのものになる。**F0 に残すと、この Unit が「Next.js のまま完結する・main は動き続ける」という前提を失う。**

**だから `next/link` と `useLinkStatus` は F1 へ移す。** F0 が外すのは `next/navigation`（`notFound`・`usePathname`）と `next/script` の4か所になる。**型（`Metadata` など）はもともと F1 の担当**なので、F1 が引き取るのは「型 ＋ `next/link`」になる。

**この Unit の価値は変わらない。** F1 のカットオーバーから抜けるのは「ルーティングと関係ない API の置き換え」で、そこは元々混ぜたくなかった部分になる。

**6. `eslint.config.mjs` の `no-restricted-imports` に `next/navigation` と `next/script` を足す。** 剥がした先から戻ってこられないようにする。**`next/link` の既存の規則はそのまま残す**（5. のとおり F1 まで使い続けるので、いまも `NavLink` 経由に寄せる必要がある）。

## 検証の順序

**型チェックと Unit テストは各ステップの直後に回す。** まとめない。

**E2E は 4. の前に書く。** 上のとおり、`usePathname` の置き換えは「落ちるかどうかを見てから決める」ので、テストが先に要る。

- **ヘッダ検索がページをまたいだときの入力欄**（新規。4. の判断に使う）
- 既存の `navigation-progress.spec.ts`（5. が直接ぶつかる）
- 既存の `ranking-url-sync.spec.ts`・`ranking-filters.spec.ts`（`pushState` まわりが無事か）

**最後に全部通す。** `npm run typecheck && npm run lint && npm run build`、`npm test`、`npm run test:e2e`（343件）。

**`next/*` が消えたことを機械で確かめる。** 目視で数えない——`app/` の外に実行時の import が0件であることを grep で見て、その結果を design.md に残す。

**Worker に向けた E2E は回さない。** この Unit は Worker の設定に触らない（`wrangler.jsonc`・`headers()`・`open-next.config.ts` はそのまま）。

## この Unit で決めないこと

**遷移の待ち表示を残すか**（→ F2）。ここでは「いまの見え方を保ったまま Next.js の外へ出す」ところまでにする。

**`Metadata` などの型**（→ F1）。実行時のコードが0バイトなので、ルーティングごと移すときに一緒に消える。

**Astro の足場**（→ F1）。この Unit では依存を1つも足さない。
