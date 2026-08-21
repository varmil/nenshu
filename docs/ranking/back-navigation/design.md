# U14 戻る/進むの状態復元 — design.md

Issue: [#121](https://github.com/varmil/nenshu/issues/121)（親 [#108](https://github.com/varmil/nenshu/issues/108)）
仕様: `docs/ranking/spec.md` AC-7・AC-15 ／ 分解: `docs/ranking/overview.md` U14

Unit 内部の構造。**見た目は1pxも変えていない。**

## 構成

```
web/lib/history/locationSync.ts              # 書き込み可否の判断（純粋関数。新規）
web/lib/history/locationSync.test.ts         # その規則の固定（新規）
web/lib/history/useLocationSyncedState.ts    # URL⇄state 同期のフック（新規）
web/features/ranking/hooks/useRankingState.ts        # 上のフックに載せ替え（既存を縮小）
web/features/company/components/CompanyDetail.tsx    # useTargetAge を同じフックに載せ替え（既存）
web/features/ranking/lib/queryBroadcast.ts           # 検索語の履歴の積み方（既存を修正）
web/features/ranking/lib/queryBroadcast.test.ts      # push / replace の境目の固定（新規）
web/e2e/ranking-url-sync.spec.ts             # 「ページを跨いだ戻る/進む」を追加（既存を拡張）
web/e2e/company-page.spec.ts                 # 「ランキングとの行き来」を追加（既存を拡張）
```

**置き場所は `web/lib/history/`。** ranking と company の両方にかかる横断の関心なので `features/<施策>/` には置かない（`lib/seo/`・`lib/analytics/` と同じ位置づけ）。

## 何が起きていたか（実測）

報告は「2ページ目から企業ページへ入って戻ると1ページ目になる」の1件だが、**壊れ方は4つあった**。どれも「URL を正として state を持つ」規則の綻びで、うち3つは URL を書く側が別々に書き写されていたことに由来する。

### 1. 復元された state が古く、それで URL を上書きしていた

戻ると `RankingApp` は作り直されるが、**サーバーが渡す `initialState` は「いまのURL」ではない**。Next.js はルーターキャッシュに載っている RSC ツリーをそのまま返すので、初期値は**そのツリーを作ったときのURL**（＝最初に `/` を開いたときの値＝1ページ目）になる。一方 URL は `?page=2` に戻っている。

この食い違いを、修正前は「state が正」として解消していた——`state → URL` の effect が差分を見つけて `pushState("/")` する。結果、

- URL が `/?page=2` から `/` に書き換わり、表も1ページ目に戻る（報告された症状）
- **進む先（企業ページ）の履歴が消える**。`pushState` は現在位置より先を切り捨てるため

修正前の実測（`history.length` は4のまま、内容が入れ替わる）:

```
[blank, /, /?page=2, /company/8729]   ← 企業ページから戻る
[blank, /, /?page=2, /]               ← 戻った先で pushState("/") が走った後
```

### 2. 抜けていくページが、行き先のURLを書き潰していた

`/?ind=銀行業&age=35` から企業ページへ入って戻ると、**画面は企業ページのまま、URL だけ `/?age=35`**（`ind` が消える）になった。戻るをもう一度押しても企業ページのまま動かない。

`CompanyDetail` の `?age=` 同期が、遷移の途中でランキングのURLを書いていた。`popstate` でランキングのURL（`age=35` を含む）を読み、自分の state（実測値＝`null`）と違うので `${window.location.pathname}?age=35` を書く——このときの `pathname` はもう `/` である。

**Next.js は `history.pushState` を「浅い遷移」として扱う**（公式ドキュメントの Native History API）。URL だけが変わってルートは再描画されないので、**URLはランキング・画面は企業ページ**という行き止まりができる。

### 3. マウント中に積まれる、行き止まりの履歴

`/?ind=銀行業&age=35` を開くと、`buildSearchParams` の正規形（`age` → `ind` の順）と1文字違うだけで `pushState` が走り、履歴が1件増えていた（`history.length` が 2 ではなく 3）。読者から見ると**戻るを押しても同じページに留まる**。

しかもこの履歴は**ハイドレート中に積まれるため Next.js のルーター状態を持たない**。2. で画面が動かなくなっていたのは、この行き止まりの履歴に戻っていたためでもある。

**ガードはあったが効いていなかった。** U5 が入れた「書き込み effect の1回目を飛ばす」`useRef` は、**開発サーバーの StrictMode で effect が2回走ると2回目が素通りする**。トレースで確認した:

```
[write-effect] first? true  value=age=35&ind=…  url=?ind=…&age=35   ← 飛ばす
[write-effect] first? false value=age=35&ind=…  url=?ind=…&age=35   ← ここで pushState
```

**「マウント後の1回目だけ」という数え方をやめた**のがこの Unit の設計上の要になる（下の規則2）。

### 4. 検索語1文字につき履歴が1件

共通ヘッダの検索欄は打つそばから `pushRankingQuery` を呼び、それが `pushState` していた。「トヨタ」で3件、「トヨタ自動車」で6件積まれる（`history.length` 2 → 5 を実測）。戻るボタンが文字数ぶん潰れる。

U5 は検索語だけ `replaceState` ＋デバウンスにしていたが、**U12 で検索欄を共通ヘッダへ移したときに、URL を書く場所がフックの外へ出て、その判断だけが置き去りになっていた**（フック側の分岐は残っていたが、`query` は URL 経由でしか変わらなくなっていたので二度と通らない死んだ枝だった）。

## 出来上がりの構造

### `lib/history/useLocationSyncedState.ts` — 同期の規則を1か所に

```ts
const [value, setValue] = useLocationSyncedState(initial, read, toSearch, syncEvent?);
```

- `read: (params: URLSearchParams) => T` — URL → 値
- `toSearch: (value: T) => string` — 値 → 検索文字列（`?` 無し）。**値どうしの等価判定にも使う**（URL に出ない差は「同じ」でよい）
- `syncEvent` — 別のコンポーネントが `pushState` で URL を書いたときの合図（ランキングだけが使う。共通ヘッダの検索欄は `RankingApp` の祖先ではないため）

規則は3つ。

1. **マウント時は URL が正。** `useLayoutEffect`（サーバーでは `useEffect`）で読み直す。ペイントより前に直すので、復元のときに古い内容が1フレーム見えることがない。
2. **URL へ書くのは、アプリ側の操作で値が変わったときだけ。** 返す setter を包んで印を付け、URL 由来の更新（1. の採り直しと `popstate`）では書かない。**「1回目だけ飛ばす」という数え方にしない**——StrictMode で漏れる（上の 3.）。この規則にすると、
   - 復元された古い値で URL を上書きしない（壊れ方 1.）
   - 並びが違うだけのURLを書き直さない（壊れ方 3.）——読者が触るまで URL はそのまま。canonical は `lib/seo/ranking.ts` が別に出しているので、URL の並びが正規形でなくても検索エンジン側の申告は揺れない
3. **自分のパスを離れたら書かない・読まない。** マウント時に記録した `pathname` と `window.location.pathname` が違えば何もしない（壊れ方 2.）。

書き込みは常に `pushState`（1操作＝1履歴エントリ）。判断そのもの（`shouldWriteLocation`）は `locationSync.ts` の純粋関数にしてあり、ブラウザ無しで固定できる。

### 呼び出し側は語彙を与えるだけ

| | `read` | `toSearch` | `syncEvent` |
| --- | --- | --- | --- |
| `useRankingState` | `{...INITIAL_STATE, ...parseSearchParams(p)}` | `buildSearchParams(state).toString()` | `RANKING_STATE_CHANGED_EVENT` |
| `useTargetAge`（企業詳細） | `parseAge(p.get("age"))` | `age === null ? "" : "age=" + age` | なし |

**`useRankingState` と `useTargetAge` を1つにはしない。** 前者は7つの値とページ番号を持ち、その大半は企業ページに存在しない概念になる（C1 で決めた線を変えていない）。共有するのは**規則だけ**で、語彙は各施策に残す。

### 検索語の履歴（`queryBroadcast.buildQueryLocation`）

`q` はフックを通さない。打つそばから変わる値なので、書き手側で積み方を決める。

- **`q` が付く／外れる境目だけ `push`、`q` どうしの打ち替えは `replace`。**
- 1回の検索がまとまって履歴1件になり、戻ると検索を始める前の一覧に戻る。消し切るのも境目なので1件積む（戻ると直前の検索語に戻れる）。
- 全部 `replace` にはしない——検索を始める前の一覧に戻れなくなる。

デバウンスは置かない。`replaceState` は履歴を増やさないので、URL と入力欄が常に一致しているほうが素直（直接コピーされたURLがそのとき打っている語になる）。

## 直さないと決めたもの

### スクロール位置は自前で復元しない

**ブラウザ（`history.scrollRestoration = "auto"`）が正しく戻していた。** 本番ビルドで、`?page=2` を `y=1200` まで送ってから企業ページへ入り戻ると `y=1200` に戻る（実測）。

一度は自前の復元（URLごとに位置を覚えるストア）まで作ったが、**それが直していたのは E2E の測り方の問題だった**。Playwright の `locator.click()` は**クリック前に対象をビューポートへスクロールする**ので、`y=1200` で画面外の行を押すと、押した時点の位置は `y=381` になっている。戻って `381` になるのは正しい復元だった。**戻る/進むの位置を E2E で見るときは、そのとき画面内にある要素を押すこと。**

自前の復元は捨てた。`scroll` と `click` を常時拾う仕組みを、直っていない問題のために全ページへ置くことになるため。

### `useSearchParams()` / `useRouter()` へは移らない

ADR-0004 と `docs/ranking/url-sync/design.md` の判断を変えていない。**この Unit の壊れ方はどれも「Next.js の外で URL を触っていること」自体が原因ではなく、書く条件の側にあった。**

## テスト

- `lib/history/locationSync.test.ts` — 書かない3条件（マウント前・別パス・差が無い）と URL の組み立て。
- `features/ranking/lib/queryBroadcast.test.ts` — `push` / `replace` の境目、他の絞り込みを残してページ番号だけ1に戻すこと。
- `e2e/ranking-url-sync.spec.ts`「ページを跨いだ戻る/進む」— 2ページ目からの往復（**進むで企業ページに戻れることも見る**。壊れ方 1. は進む先を消すため）、絞り込みを保ったままの往復、並びが正規形でないURLで履歴が増えないこと＋そこから戻れること、6文字打っても履歴が1件であること。
- `e2e/company-page.spec.ts`「ランキングとの行き来」— 年齢そろえのまま復元されること。
- **どのE2Eも、修正前のコードで落ちることを先に確認した**（4件が失敗）。落ちないテストは回帰を止めない。
