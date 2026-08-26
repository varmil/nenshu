# design.md — F0 `next/*` への依存を剥がす

Issue [#208](https://github.com/varmil/nenshu/issues/208)。spec は `docs/framework/spec.md` の 2.、決定は ADR-0014、段取りは `plan.md`。

## 剥がした範囲

**`next/navigation` と `next/script` の実行時 import が0件になった。** 残るのは `next/link` と型だけで、どちらも F1（#209）が引き取る。

| import | 箇所 | 置き換え先 |
| --- | --- | --- |
| `next/navigation` の `notFound` | `app/company/[id]/page.tsx` | `requireCompanyView()`（同ファイル） |
| `next/navigation` の `usePathname` | `HeaderSearch.tsx` | `lib/history/usePathname.ts` の `useIsRankingPath()` |
| 同上 | `BrandLink.tsx` | `lib/history/pathname.ts` の `isRankingPath()` |
| `next/script` の `Script` | `app/layout.tsx` | 素の script 要素 |

**`next/link` は F0 の範囲から外した。** 経緯は `plan.md` の 5.。**あれはクライアント遷移そのもの**で、素の a 要素に替えると全ページが再読み込みになる——それは遷移の方式を変えることであり、この Unit が「Next.js のまま完結する」という前提を失う。

## パスの読み方が2つある理由

**`BrandLink` は購読しない。`HeaderSearch` は購読する。** 同じ「いまランキングに居るか」でも、必要な時点が違う。

| | いつパスが要るか | 使うもの |
| --- | --- | --- |
| `BrandLink` | **クリックの瞬間だけ**（`onClick` の中で遷移を横取りするか決める） | `isRankingPath()`（即時読み） |
| `HeaderSearch` | **レンダーのたび**（`?q=` から入力欄を合わせる effect の依存） | `useIsRankingPath()`（購読） |

**`BrandLink` は購読しないほうが正しい。** レンダー時に採った値は、クリックが来るまでに古くなりうる——ヘッダはレイアウトが持っていて**ページ遷移で作り直されない**ためである。

## パスの変化を購読する仕組み

**`next/navigation` の `usePathname` は React の context で、パスが変わると購読側が再レンダーされる。** ヘッダが作り直されなくてもよかったのはこの経路があったからで、**外すとそこが消える。**

**推測せず、E2E を先に書いて落とした。**

```
/about で「商船三井」と打つ（送信しない）
  → ヘッダのサイト名から / へ移る
  → 入力欄が空になっている
```

`usePathname` を外して**その場で読むだけ**にすると、この最後の1行が落ちた（`expected "" / received "商船三井"`）。**打ちかけた語が次のページへ持ち越される**形になる。

**直したのは `lib/history/pathname.ts` の1か所。** `history.pushState`/`replaceState` を包んで、**パスが実際に変わったときだけ**購読者に知らせる。

- **CLAUDE.md は `nextjs-toploader` 系を使わないと決めている**が、その理由は「更新が止まっている」ことと「当サイトが自分で `pushState` を呼んでいるのに差し替えてくる」ことだった。**ここは自分で持つ数十行**で、元の関数を必ず先に呼ぶ
- **同じパスなら誰も起こさない。** 検索欄は打鍵のたびに `replaceState` を呼ぶ（`queryBroadcast.ts`）が、パスは変わらないのでヘッダは再レンダーされない。`pathname.test.ts` がこの性質を固定している
- **戻る/進むは `popstate`** で拾う。`pushState` は `popstate` を発火しないので両方が要る

### 知らせるのを1ティック遅らせている

**その場で知らせると React が警告を出す。**

```
useInsertionEffect must not schedule updates.
    at Object.check (lib/history/pathname.ts)
    at History.patched (lib/history/pathname.ts)
```

**Next.js のルーターは遷移のときに `useInsertionEffect` の中から `pushState` を呼ぶ。** そこから同期で `useSyncExternalStore` の購読者を起こすと、insertion effect の最中に更新を積むことになる。`queueMicrotask` に逃がすと commit を抜けた後・ペイントの前に走るので、警告は消えて振る舞いは変わらない。

**F1 でこの仕組みごと消えるはず。** Astro の遷移はヘッダごと作り直すので、パスの変化を購読する必要がなくなる（#209 の論点に書いた）。

## `notFound()` を 404 ではなくビルドの失敗にした

**この呼び出しは到達不能だった。** `dynamicParams = false` があるので `companies.json` に無いIDは**ページ本体に届く前に** 404 になる。ここで `buildCompanyView` が `null` を返すのは、`generateStaticParams` と同じ `companies.rows` を見ているのに食い違ったとき——**データが自己矛盾しているときだけ**になる。

**`notFound()` は、起こらない事態を 404 として静かに配ることになる。** 全社を事前生成する構成（ADR-0012）では、1社でも引けない時点でビルドが通ってはいけない。`requireCompanyView()` が例外を投げる。

**`generateMetadata` の `{ title: "見つかりませんでした" }` も同じ理由で消した。** 同じ到達不能な枝に、別の答えを2つ置いていた。

## `next/script` を外して HTML が小さくなった

**`strategy="afterInteractive"` は初回HTMLにタグを出していなかった。** スニペットの本文は RSC ペイロードに載り、**ハイドレーションの後にクライアントが script 要素を注入する**形だった。

同じ手順でビルドした `/about` の実測（`.next/server/app/about.html`）:

| | raw | gzip | `id="ms-clarity"` | `clarity.ms/tag` |
| --- | ---: | ---: | ---: | ---: |
| 前（`next/script`） | 101,920 B | 23,426 B | 0 | 1（RSC ペイロードのみ） |
| 後（素の script） | **101,108 B** | **23,399 B** | 1 | 2（タグ ＋ RSC ペイロード） |

**HTML にタグが増えたのに 812 B 小さくなった。** `next/script` のコンポーネントとしての情報が RSC ペイロードに載るぶんのほうが、インラインのタグより大きかった。**この差はレイアウトの変更なので全ページに同じだけ効く。**

**計測の開始が早くなる。** 前はハイドレーション後、後は HTML の解析中になる。**遅くなる心配は無い**——タグの中身は `t.async=1` で本体を非同期に読ませる数行で、重いのは本体のほうである（`lib/analytics/clarity.ts`）。

**`async` 属性は付けていない。** インラインの script では効かず、付けると「非同期に読む」という嘘の合図になる。**順序は body の末尾にあることが担保する。**

## lint

`no-restricted-imports` に `next/navigation` と `next/script` を足した。**剥がした先から戻ってこられないようにする**——Astro へ移すと決めた以上（ADR-0014）、`next/*` の実行時 API を増やすほど F1 の差分が増える。

**`next/link` の既存の規則はそのまま。** F1 まで使い続けるので、いまも `NavLink` 経由に寄せる必要がある。

**型（`Metadata` など）は止めていない。** 実行時のコードが0バイトで、F1 がルーティングごと移すときに一緒に消える。

## 検証

| | 結果 |
| --- | --- |
| `npm run typecheck` | 通る |
| `npm run lint` | 通る |
| `npm run build` | 通る（`/company/[id]` は 2,961社が `●`） |
| `npm test` | 44ファイル・517件 通る |
| `npm run test:e2e` | 382件 通る（7件 skip = `E2E_BASE_URL` が要る Worker 向け） |

**Worker に向けた E2E は回していない。** この Unit は `wrangler.jsonc`・`headers()`・`open-next.config.ts` に触っていない。

**`next/*` が消えたことは grep で確かめた**（目視で数えない）。実行時の import で残っているのは `NavLink.tsx` の `next/link` 1件だけ。

## 次に触る人へ

**`lib/history/` が「URL を読む・書く」の1か所である**という規則は変わっていない（U14・#108）。パスを読みたくなったら、**購読が要るかどうかで2つを使い分ける**——要らないなら `isRankingPath()`、要るなら `useIsRankingPath()`。**`window.location.pathname` を直接書かない。**

**history のパッチは1度だけ当たる**（`__openreportPathnameWatch` の印）。二重に包むと `check` が2回走る。
