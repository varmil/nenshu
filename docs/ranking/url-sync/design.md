# U5 URLクエリとの同期 — design.md

Unit内部の構造。

## 構成

```
web/features/ranking/lib/urlState.ts        # buildSearchParams / parseSearchParams（新規）
web/features/ranking/lib/urlState.test.ts   # AC-7・順序決定性・不正値の固定（新規）
web/features/ranking/hooks/useRankingState.ts  # URL同期に差し替え（既存を修正）
web/app/page.tsx                             # <RankingApp> を <Suspense> で囲む（既存を修正）
docs/ranking/overview.md                     # Bolt 2 のパス設計を追記（既存を修正）
web/e2e/ranking-filters.spec.ts              # AC-7・戻る/進む・ネットワーク非発生を追加（既存を拡張）
```

## `lib/urlState.ts`

```ts
const EMPLOYEE_SIZE_TO_PARAM: Record<EmployeeSizeBucket, string> = {
  under300: "-300",
  "300to1000": "300-1000",
  "1000plus": "1000-",
};
const TENURE_TO_PARAM: Record<TenureBucket, string> = {
  under13: "-13",
  "13to17": "13-17",
  "17plus": "17-",
};
const AVG_AGE_TO_PARAM: Record<AvgAgeBucket, string> = {
  under40: "-40",
  "40to43": "40-43",
  "43plus": "43-",
};
// 逆引きは上記オブジェクトを Object.entries で反転して作る（手打ちの二重管理を避ける）。

export function buildSearchParams(state: RankingState): URLSearchParams {
  const params = new URLSearchParams();
  // 常にこの順で set する: age → ind → emp → ten → aage → q。
  // フィルタを適用した順序に関係なく、同じ絞り込みは常に同じ文字列になる（カノニカル化）。
  if (state.targetAge !== INITIAL_STATE.targetAge) params.set("age", String(state.targetAge));
  if (state.industry !== null) params.set("ind", state.industry);
  if (state.employeeSize !== null) params.set("emp", EMPLOYEE_SIZE_TO_PARAM[state.employeeSize]);
  if (state.tenure !== null) params.set("ten", TENURE_TO_PARAM[state.tenure]);
  if (state.avgAgeBucket !== null) params.set("aage", AVG_AGE_TO_PARAM[state.avgAgeBucket]);
  if (state.query !== "") params.set("q", state.query);
  return params;
}

export function parseSearchParams(params: URLSearchParams): Partial<RankingState> {
  const result: Partial<RankingState> = {};

  const age = params.get("age");
  if (age !== null) {
    const n = Number(age);
    if (TARGET_AGES.includes(n as TargetAge)) result.targetAge = n as TargetAge;
  }
  const ind = params.get("ind");
  if (ind !== null) result.industry = ind;

  const emp = params.get("emp");
  if (emp !== null && emp in PARAM_TO_EMPLOYEE_SIZE) result.employeeSize = PARAM_TO_EMPLOYEE_SIZE[emp];
  const ten = params.get("ten");
  if (ten !== null && ten in PARAM_TO_TENURE) result.tenure = PARAM_TO_TENURE[ten];
  const aage = params.get("aage");
  if (aage !== null && aage in PARAM_TO_AVG_AGE) result.avgAgeBucket = PARAM_TO_AVG_AGE[aage];

  const q = params.get("q");
  if (q !== null) result.query = q;

  return result;
}
```

- `visibleCount`はどちらの関数でも扱わない（spec.mdのURL例にも無い。「段階表示」はU6の対象で、URLに乗せる想定ではない）。
- `age`は`TARGET_AGES`にある値だけ受理。`emp`/`ten`/`aage`は既知の範囲表記だけ受理。それ以外（不正なURLを直接叩かれた場合）は黙って無視し、該当フィールドは`INITIAL_STATE`の値（`null`）に倒る。エラー画面は出さない。
- `ind`・`q`は文字列をそのまま受け渡す。実在しない業種名や存在しない検索語が来た場合は「0件」になるだけで済む（U6が0件時の案内を担当）。

## `hooks/useRankingState.ts` の変更

公開シグネチャ（`state: RankingState`、`setState: Dispatch<SetStateAction<RankingState>>`、`rankedCompanies: RankedCompany[]`）は変えない。`RankingApp.tsx`の呼び出し側（`setState(prev => ({...prev, key: value}))`という形）は無修正のまま動く。

### 実際に踏んだ罠: `useSearchParams()`はstatic exportでランキング表そのものをHTMLから消してしまう

当初案は`next/navigation`の`useSearchParams()`を使い、`<RankingApp>`を`<Suspense>`で囲む設計（Next.jsの一般的な「クライアントでクエリを読む」パターン）だった。実際に`npm run build`して`out/index.html`を確認したところ、`<table>`が影も形も無く、`<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">`というマーカーだけが埋め込まれていた。

**`useSearchParams()`を使うコンポーネントは、`output:'export'`では`<Suspense>`で囲んでいても静的HTMLへのプリレンダーからスキップされ、実行時に完全にクライアント側でレンダリングされる。** ビルド時に「初期値（35歳・絞り込みなし）」で中身を焼き込んでくれるわけではない。これはspec.md §3の「トップページの初期表示はHTMLに含める。クライアント側の描画待ちにしない」という要件に反する重大な後退だったため、`useSearchParams()`を使わない設計に直した。

**修正（1回目）**: `next/navigation`の`useSearchParams()`は使わず、代わりに`window.location.search`を直接読む。読み書きの実装には`useRouter().push`/`.replace`を使う案にした。

### 実際に踏んだ罠その2: `router.push`/`.replace`はネットワークリクエストを発生させる

E2Eで「フィルタ操作中にネットワークリクエストが発生しない」というテストを書いたところ、`router.push`/`.replace`（`next/navigation`）が`?age=45&_rsc=...`のようなRSCペイロード再取得のリクエストを実際に発生させていることが分かった。App Routerの通常のナビゲーション機構を経由する以上、同一パス・クエリのみの変更でもRSCツリーの再取得が走る（dev環境で確認。`output:'export'`の本番では静的な`index.html`が返るだけで実害は薄いが、それでも無駄なネットワークラウンドトリップが発生し、spec.md §3「ネットワークアクセスを伴わない」という要件に反する）。

さらに、この再フェッチの非同期性が絡み、フィルタを連続で素早く操作すると直前の選択が失われる不具合もE2Eで再現した。

**修正（2回目）**: `useRouter()`も使わず、`window.history.pushState`/`replaceState`を直接呼ぶ。Next.jsのナビゲーション機構を一切経由しないため、ネットワークもコンポーネントの再マウントも発生しない。

### 実際に踏んだ罠その3: マウント直後の競合状態でURLが一瞬デフォルトに巻き戻る

`window.history.pushState`直接呼び出しに直した直後、AC-7（`/?age=45&ind=銀行業`を直接開いて復元する）のE2Eが不安定に失敗した。原因は、読み取り方向のeffect（URLからstateを復元する）と書き込み方向のeffect（stateをURLへ反映する）が**同じマウント時のコミットで両方走る**ことによる競合状態だった。

1. マウント時、読み取りeffectが`window.location.search`（`age=45&ind=銀行業`）を読み、`setState(...)`を呼ぶ（更新はスケジュールされるだけで、この時点ではまだ`state`に反映されない）。
2. 同じコミットで書き込みeffectも走る。このeffectのクロージャが持つ`state`は**まだ更新前のデフォルト値**（`targetAge: 35`, `industry: null`）のまま。これと実際のURL（`age=45&ind=銀行業`）を比較すると「差分あり」と判定してしまい、**デフォルト値を基準にURLを`/`へpushState**してしまう（せっかくURLから読み取った`age=45&ind=銀行業`を、自分自身の書き込みでかき消してしまう）。
3. 直後、1.のsetStateが反映されて再レンダーが走り、書き込みeffectがもう一度発火する。今度は正しい`state`（45, 銀行業）を基準にURLを書き戻すため、最終的には辻褄が合う。

理屈のうえでは最終的に自己修復するはずだが、React Strict Modeの二重実行やタイミング次第で不安定になり、実際にE2Eで再現した。

**修正（3回目）**: 書き込みeffectの「1回目の発火」を無条件にスキップする`useRef`ガードを追加した。マウント直後の「まだ読み取りeffectのsetStateが反映されていない」状態で書き込みeffectが動くこと自体を防ぐ。

```ts
"use client";

function readStateFromLocation(): RankingState {
  if (typeof window === "undefined") return INITIAL_STATE;
  const parsed = parseSearchParams(new URLSearchParams(window.location.search));
  return { ...INITIAL_STATE, ...parsed };
}

export function useRankingState(companies, curves) {
  const [state, setState] = useState<RankingState>(INITIAL_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isFirstWrite = useRef(true); // 書き込みeffectの1回目の発火をスキップするガード

  // 読み取り方向: マウント時に一度、以後は popstate（戻る/進む）でだけ読み直す。
  // pushState/replaceState は popstate を発火させないため、自分の書き込みで
  // 読み取りが再トリガーされることはない。
  useEffect(() => {
    setState(readStateFromLocation());
    const onPopState = () => setState(readStateFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 書き込み方向: state → URL。
  useEffect(() => {
    if (isFirstWrite.current) {
      isFirstWrite.current = false;
      return; // マウント直後、読み取りeffectのsetStateがまだ反映されていない1回目はスキップ
    }

    const nextQs = buildSearchParams(state).toString();
    const currentQs = window.location.search.replace(/^\?/, "");
    if (nextQs === currentQs) return; // 無変更なら何もしない

    const url = nextQs ? `${window.location.pathname}?${nextQs}` : window.location.pathname;
    const currentFromUrl = readStateFromLocation();
    const onlyQueryDiffers = /* state と現在のURLから復元した値を比較し、query以外が同じか */;

    clearTimeout(debounceRef.current);
    if (onlyQueryDiffers) {
      debounceRef.current = setTimeout(() => window.history.replaceState(null, "", url), 300);
    } else {
      window.history.pushState(null, "", url);
    }
    return () => clearTimeout(debounceRef.current);
  }, [state]);

  const rankedCompanies = useMemo(() => buildRankedCompanies(companies, curves, state), [companies, curves, state]);

  return { state, setState, rankedCompanies };
}
```

- **`next/navigation`から`useRouter`/`usePathname`/`useSearchParams`をすべて使わない最終形になった。** `app/page.tsx`への`<Suspense>`追加も不要（一度追加して取り除いた）。
- **`query`だけデバウンス**: 検索欄に1文字打つたびに`state`は即座に更新される（フィルタ結果の表示は瞬時、100ms要件はここで満たす）。URLへの反映だけ300ms遅延させ、`replaceState`で履歴を汚さない。年齢・業種・3フィルタの変更は即座に`pushState`し、1操作=1履歴エントリにする（AC-7の「戻るで一つ前の絞り込み状態に戻る」）。
- ESLintの`react-hooks/set-state-in-effect`ルールが、外部システム（URL）からの意図的な同期に対しても警告を出す。該当箇所は理由コメント付きで`eslint-disable-next-line`する。
- **この3段階の罠はいずれもE2E（Playwrightで実ブラウザ操作）で見つけた。** Unitテスト（`urlState.test.ts`、Reactに依存しない純粋関数のテスト）だけでは検出できない領域だった。

## Bolt 2 のパス設計（`docs/ranking/overview.md`に追記）

- `/age/[age]/` — `age`は`TargetAge`（8値）をそのまま文字列化。
- `/industry/[industry]/` — `industry`は`companies.industries`の業種名（33件）をそのまま使う。`ind`クエリパラメータと同じ値空間。
- `/company/[id]/` — `id`はU0の`makeId`が生成した既存の一意キー（1,867件）をそのまま使う。

3種とも新しいID生成方式は不要。既存の識別子をそのまま`generateStaticParams`に渡すだけで済む設計にしてある。実装そのものはBolt 2の対象外。

## テスト方針

- `urlState.test.ts`:
  - AC-7: `parseSearchParams(new URLSearchParams("age=45&ind=銀行業"))` が `{ targetAge: 45, industry: "銀行業" }` を含む。
  - 初期値は出力されない: `buildSearchParams(INITIAL_STATE).toString()` が空文字列。
  - 不正値は無視される: `age=999`（`TARGET_AGES`に無い）、`emp=abc`（未知パターン）を渡しても該当フィールドは`undefined`のまま。
  - **順序の決定性**: 同じ絞り込み内容を異なる順序で組み立てた`RankingState`同士で、`buildSearchParams(...).toString()`が完全一致する。
  - バケット系の相互変換（`emp`/`ten`/`aage`）が全パターンで往復一致する。
- `useRankingState`自体はNext.jsのルーターに依存するため重いテストにせず、E2Eで実ブラウザの挙動を確認する。
- E2E（`web/e2e/`）:
  - AC-7-1: `/?age=45&ind=銀行業`を直接開くと年齢45・業種「銀行業」・82社の状態で表示される。
  - AC-7-2: フィルタ操作後にブラウザの戻るを押すと一つ前の絞り込み状態に戻る。
  - 初期状態（何も操作しない）のURLが`/`のままであること。
  - フィルタ操作中にネットワークリクエストが発生しないこと（Playwrightの`page.on("request", ...)`で監視し、フィルタ操作の前後で追加のリクエストが無いことを確認する）。
