# U3 フィルタ4種 — design.md

Unit内部の構造。

## 構成

```
web/design-system/ui/select.tsx           # shadcn add select（新規、base-ui/react/select）
web/design-system/inventory.md            # select.tsx を追記

web/features/ranking/lib/filter.ts        # 分類関数 + matchesFilters（新規）
web/features/ranking/lib/filter.test.ts   # 実データでspec.mdの区分件数・AC-3〜5相当を固定（新規）
web/features/ranking/lib/rank.ts          # フィルタを先頭に追加する順序変更（既存を修正）
web/features/ranking/lib/rank.test.ts     # AC-3/AC-4/AC-5をbuildRankedCompanies経由で固定（既存を拡張）
web/features/ranking/lib/filterOptions.ts # 従業員数・在籍年数・平均年齢のラベル付き選択肢定数（新規）

web/features/ranking/components/FilterSelect.tsx  # 汎用プルダウン（新規）
web/features/ranking/components/RankingApp.tsx     # フィルタ行を追加（既存を修正）
```

## `lib/filter.ts`

閾値は実データ検証済み（`docs/ranking/ranking-filters/plan.md`参照）。`< / < / それ以上` の3区分で1,867社を過不足なく分割する。

```ts
export function classifyEmployeeSize(employees: number): EmployeeSizeBucket {
  if (employees < 300) return "under300";
  if (employees < 1000) return "300to1000";
  return "1000plus";
}

export function classifyTenure(avgTenure: number): TenureBucket {
  if (avgTenure < 13) return "under13";
  if (avgTenure < 17) return "13to17";
  return "17plus";
}

export function classifyAvgAgeBucket(avgAge: number): AvgAgeBucket {
  if (avgAge < 40) return "under40";
  if (avgAge < 43) return "40to43";
  return "43plus";
}

export function matchesFilters(row: CompanyRow, industries: string[], state: RankingState): boolean {
  const [, , tse33Idx, , avgAge, avgTenure, , employees] = row;
  if (state.industry !== null && industries[tse33Idx] !== state.industry) return false;
  if (state.employeeSize !== null && classifyEmployeeSize(employees) !== state.employeeSize) return false;
  if (state.tenure !== null && classifyTenure(avgTenure) !== state.tenure) return false;
  if (state.avgAgeBucket !== null && classifyAvgAgeBucket(avgAge) !== state.avgAgeBucket) return false;
  return true;
}
```

4条件はすべてANDで、`state.<filter>` が `null` の条件はスキップする（U2で「フィルタなし＝null」という初期値の意味をすでに確定済みなので、その意味をそのまま使う）。

## `lib/rank.ts` の変更

`buildRankedCompanies` の処理順を「フィルタ→補正年収の計算→ソート→ランク付与→`visibleCount`で切り出し」に変更する。

```ts
export function buildRankedCompanies(companies, curves, state): RankedCompany[] {
  const filteredRows = companies.rows.filter((row) => matchesFilters(row, companies.industries, state));
  const withSalary = filteredRows.map((row) => { /* 既存と同じ計算 */ });
  const sorted = withSalary.sort((a, b) => b.estimatedSalary - a.estimatedSalary);
  const ranked = sorted.map((c, i) => ({ ...c, rank: i + 1 }));
  return ranked.slice(0, state.visibleCount);
}
```

フィルタを先に適用することで、ランクは「絞り込み後の集合の中での順位」になる（Issue #4の完了条件）。フィルタなし（`state`の4項目がすべて`null`）のときは全1,867社が対象のままなので、U2で固定したAC-1/AC-2のテストの前提は変わらない。

## `lib/filterOptions.ts`

```ts
export const EMPLOYEE_SIZE_OPTIONS: { value: EmployeeSizeBucket; label: string }[] = [
  { value: "under300", label: "〜300人" },
  { value: "300to1000", label: "300〜1,000人" },
  { value: "1000plus", label: "1,000人以上" },
];
// TenureBucket, AvgAgeBucket も同様の形で定義する
```

業種の選択肢はここには置かない。`companies.industries`（ビルド時に`localeCompare('ja')`でソート済み、U0）をそのまま`FilterSelect`に渡す。

## `components/FilterSelect.tsx`

`design-system/ui/select.tsx`（base-ui）をラップする。「すべて」を選ぶと`null`に戻る単一選択プルダウン。

```ts
function FilterSelect({
  label,
  value,       // string | null
  onChange,    // (value: string | null) => void
  options,     // { value: string; label: string }[]
  placeholder = "すべて",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}): JSX.Element
```

内部実装: `Select`の`value`には`value ?? ALL`（`ALL = "__all__"`という文字列センチネル）を渡し、`onValueChange`で`ALL`が来たら`null`に変換して呼び出し元に伝える。base-uiの`Select.Root`は`value: Value | null`をジェネリックに扱えるが、ジェネリクスの型解決を単純にするため文字列センチネルに寄せる。

業種・従業員数・在籍年数・平均年齢の4箇所ともこのコンポーネントを使う。ラベル（`aria-label`）を必ず渡し、キーボード操作（Tab移動・矢印での選択肢移動・Enterで確定）はbase-uiの標準動作に任せる。

## `RankingApp.tsx` の変更

`AgeSwitch`の下にフィルタ行を追加する。`handleAgeChange`と同じパターンで、フィルタごとに`setState(prev => ({ ...prev, <key>: value }))`を呼ぶハンドラを用意する。レイアウトは`flex flex-wrap gap-2`でモバイル幅での折り返しに対応する。

## テスト方針

- `filter.test.ts`: 実データ（`web/public/data/companies.json`）に対して、3分類関数それぞれの件数が spec.md の表（517/734/616、545/732/590、450/709/708）と一致すること。海運業の`matchesFilters`適用後の件数が7であること。
- `rank.test.ts`（既存ファイルへの追加）:
  - AC-3: `state.industry = "海運業"` で`buildRankedCompanies`の結果が7件、`rank`が1から始まること。
  - AC-4: `state.employeeSize = "1000plus"` で616件（`visibleCount`を1867等に上げて全件確認）。
  - AC-5: `state.industry = "情報・通信業"` 単独の件数 > `industry + avgAgeBucket = "under40"` の複合件数であること。
  - 既存のAC-1/AC-2テスト（フィルタなし）が変更後も通ること。

## 対象外

URL同期（`?ind=...`等）はU5で行う。Issue #4の完了条件に無いことを確認済み（`docs/ranking/ranking-filters/plan.md`参照）。

## 実ブラウザでの動作チェック: Playwright E2E

このセッションにはブラウザ操作ツール（chrome-devtools MCP）が接続されておらず、実装者（エージェント）が目視でブラウザ確認できない。ユーザーと相談し、**Playwright E2Eテストで代替し、ユーザー側の手動確認を不要にする**方針にした。

`@playwright/test` / `playwright-core` は npm registry 上で postinstall 等のライフサイクルスクリプトを持たない（`npm view @playwright/test scripts` が `{}`）ため、`web/`のdevDependenciesに追加してもCloudflareの本番ビルド（`npm ci` → `npm run build`）でブラウザダウンロードが走ることはなく、ビルド時間・失敗リスクへの影響はない。

```
web/
  playwright.config.ts       # testDir: "./e2e"
  e2e/
    ranking-filters.spec.ts
```

`playwright.config.ts`の`webServer`は`next dev`（既定の3000番）を自動起動・待受・終了まで面倒を見る。`reuseExistingServer: true`にしているため、既にdevサーバーが起動していればそれを再利用する（**Next.jsのdevサーバーはプロジェクトディレクトリ単位で単一インスタンスしか許可せず、ポートを変えても2つ目は起動を拒否されるため**、専用ポートに逃がす設計は成立しない。実装時に実際にこのエラーを踏んで修正した）。`output:'export'`はビルド・配信方式の違いでReactツリーの実行時挙動はdevと変わらないため、devサーバーに対してテストする。

`e2e/ranking-filters.spec.ts`は次を検証する。

1. 初期表示（AC-1のスモーク確認）: 1位が「株式会社キーエンス」、推定年収「2,178万円」。
2. AC-3: 業種「海運業」選択 → 表が7行、1行目の順位が1。
3. AC-4: 従業員数「1,000人以上」選択 → 表示される行（最大100件）の従業員数セルがすべて1,000以上。
4. AC-5: 業種「情報・通信業」→ 平均年齢「〜40歳」を追加選択 → 表示される全行の業種・平均年齢セルが両条件を満たす（AND結合がUI経由で効いていることの確認。正確な件数比較は`rank.test.ts`側で固定済み）。
5. キーボード操作: マウスを使わずTab→Enter→ArrowDown→Enterで業種を選択し、表が絞り込まれることを確認（Issue #4完了条件）。
6. モバイル幅（375×700）: デスクトップ用`<table>`が非表示・カードリストが表示、水平スクロールが発生しないこと。

`npm run test:e2e`（`playwright test`）で実行する。ブラウザ起動を伴い遅いため**pre-commitフック（`.lintstagedrc.mjs`）には含めない**。オンデマンド実行に位置づける。

### 実際に踏んだ罠: `mx-auto`がflexアイテムのstretchを無効化し、モバイル幅で横スクロールが発生していた

モバイル幅レイアウトのE2Eテストが実際に失敗し、`document.documentElement.scrollWidth`（398px）が375pxのビューポート幅を23px超えていることが判明した。

原因は `RankingApp.tsx` のルート要素 `<div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">`。`app/layout.tsx` の `<body className="min-h-full flex flex-col">` により、この div は body の flex アイテムになっている。**flexアイテムに `margin-left/right: auto`（`mx-auto`）が付くと、そのアイテムはクロス軸（この場合は横幅）で `align-items: stretch` による引き伸ばしを受けず、代わりに `fit-content`（自分の子要素のmax-content幅）でサイズが決まり、その上で auto marginで中央寄せされる。** 子要素（年齢スイッチの8ボタン等）のラップ前の合計幅がビューポート幅より広かったため、div自体がビューポートより広く算出され、それがそのまま横スクロールとして現れた。`min-width: 0` を足しても改善しなかった（widthの決定メカニズムが「縮まない」ではなく「fit-contentで決まる」側だったため）。

**修正**: `max-w-5xl mx-auto` の前に `w-full` を足す（`w-full max-w-5xl mx-auto`）。`width: 100%` を明示することでflexアイテムのサイズ決定を「fit-content」から「コンテナ幅いっぱい」に固定し、`max-w-5xl` は広い画面でのみ効くようになり、`mx-auto` はその上限に達したときだけ中央寄せとして機能する。

**教訓**: `flex-col` の親の直下で `mx-auto` を使ってコンテナを中央寄せする場合は、必ず `w-full`（または同等の明示的幅指定）を併用する。`mx-auto` 単体では意図しない `fit-content` サイズになりうる。この種のバグは静的な型チェック・単体テストでは検出できず、実ブラウザ（今回はPlaywright E2E）でのモバイル幅チェックで初めて顕在化した——U1〜U2のブラウザ確認では検出されておらず、今回のE2E導入で初めて見つかった既存バグである。

## 追記: 従業員数・在籍年数・平均年齢をSelectからToggleGroupに変更

初回実装ではUI統一のため4フィルタすべて`Select`にしたが、ユーザーからのフィードバックで「業種以外は3択しかないのでプルダウンではなくスイッチにしたい」と指示があり、業種以外の3フィルタ（従業員数・在籍年数・平均年齢）を`ToggleGroup`（`design-system/ui/toggle-group.tsx`、`AgeSwitch`と同じプリミティブ）に変更した。業種（33択）は引き続き`Select`のまま。

新規 `features/ranking/components/FilterToggleGroup.tsx` は `FilterSelect` と同じ`value: string | null` / `onChange` インターフェースを持つが、内部は`ToggleGroup`の`value`を`string[]`（0件または1件）として扱う。**「すべて」の選択肢ボタンは置かず、選択中のボタンをもう一度押すと解除されて`null`（絞り込みなし）に戻る**（base-uiのToggleは個々に押下状態を持ち、グループは「同時に押せるのは1つまで」を強制するだけなので、選択中のボタンを再度押すと自然に0件になる）。

この変更に伴い `web/e2e/ranking-filters.spec.ts` を更新した（見た目の変更にはUnit/E2E双方の更新が必須というCLAUDE.mdのルールに従う）。`ToggleGroup`は`role="group"`＋`aria-label`、各選択肢は`role="button"`＋`aria-pressed`でレンダリングされる（`AgeSwitch`のE2E確認と同じ仕組み）。追加したケース: トグルのキーボード操作（Tab/ArrowRight/Enter）、再押下による解除（絞り込み解除）。
