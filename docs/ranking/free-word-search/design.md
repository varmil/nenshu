# U4 フリーワード検索 — design.md

Unit内部の構造。

## 構成

```
web/design-system/ui/input.tsx              # shadcn add input（新規、base-ui/reactラップ）
web/design-system/inventory.md               # input.tsx を追記

web/features/ranking/lib/search.ts           # normalizeCompanyName + matchesQuery（新規）
web/features/ranking/lib/search.test.ts      # AC-6を実データで固定（新規）
web/features/ranking/lib/rank.ts             # matchesQueryをANDで追加（既存を修正）
web/features/ranking/lib/rank.test.ts        # 検索×フィルタの複合ケースを追加（既存を拡張）

web/features/ranking/components/SearchInput.tsx    # 検索欄（新規）
web/features/ranking/components/RankingApp.tsx     # 検索欄を配線（既存を修正）

web/e2e/ranking-filters.spec.ts              # AC-6・複合検索のE2Eケースを追加（既存を拡張）
```

## `lib/search.ts`

```ts
const CORPORATE_FORM_PATTERN = /(株式会社|\(株\)|㈱|有限会社|合同会社)/g;

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(CORPORATE_FORM_PATTERN, "")
    .toLowerCase()
    .replace(/\s/g, "");
}

export function matchesQuery(name: string, query: string): boolean {
  if (query === "") return true;
  return normalizeCompanyName(name).includes(normalizeCompanyName(query));
}
```

- `normalize("NFKC")` で全角英数→半角・半角カナ→全角カナを同時に満たす（`"ｷｰｴﾝｽ".normalize("NFKC")` → `"キーエンス"`、`"Ａ１".normalize("NFKC")` → `"A1"`、`"㈱".normalize("NFKC")` → `"(株)"` を確認済み）。
- 法人格除去はIssueの完了条件に明記された5パターンをそのままコードにする（`㈱`はNFKCで`(株)`に分解されるため実質`(株)`パターンでカバーされるが、意図の可読性のため明示的に残す）。
- 空白除去は正規表現`\s`が半角スペース・全角スペース（U+3000）の両方にマッチすることを確認済みなので追加パターン不要。
- `query === ""`（初期状態）は無条件で`true`を返す。空文字列に対して`normalizeCompanyName("").includes("")`も`true`になるため実際には分岐無しでも動くが、意図を明示するため早期リターンする。

## `lib/rank.ts` の変更

```ts
const filteredRows = companies.rows.filter(
  (row) => matchesFilters(row, companies.industries, state) && matchesQuery(row[1], state.query)
);
```

U3の`matchesFilters`（業種・従業員数・在籍年数・平均年齢）とは別関数のまま、`rank.ts`側でANDする。`row[1]`が会社名（`CompanyRow`の2番目の要素）。フィルタ・検索とも「絞り込み→計算→ソート→ランク付与→`visibleCount`で切り出し」という既存の処理順の中の「絞り込み」ステップに乗るだけなので、ランクの振り直し・`visibleCount`の扱いはU3から変更しない。

## `components/SearchInput.tsx`

U3で確立した「ラベル+コントロール」パターン（`FilterSelect`/`FilterToggleGroup`と同じ、`aria-hidden`の可視ラベル+実際のアクセシブルネームはinput自体の`aria-label`）に合わせる。

```ts
function SearchInput({
  value,       // string
  onChange,    // (value: string) => void
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element
```

- ラベル文言: 「会社名で検索」
- `placeholder`: 「商船三井」のような実例を1つ入れ、部分一致であることが伝わるようにする。
- `<Input>`の`onChange`をそのまま`setState(prev => ({...prev, query: e.target.value}))`に流す（他のフィルタと同じ、単一state更新関数を通す方式）。デバウンスは入れない。1,867社への`includes`判定は軽量（手順6の実測・E2Eで100ms要件を確認する）。

## `RankingApp.tsx` の変更

フィルタ行（`FilterSelect`/`FilterToggleGroup`の並び）の中、または直後に`SearchInput`を配置する。`state.query`を渡し、`onChange`で`setState`する。

## テスト方針

- `search.test.ts`:
  - AC-6-1: `matchesQuery("株式会社　商船三井", "商船三井")` が`true`。
  - AC-6-2: `matchesQuery("株式会社キーエンス", "ｷｰｴﾝｽ")` が`true`。
  - 法人格除去: `normalizeCompanyName("株式会社ABC")` と `normalizeCompanyName("有限会社ABC")` と `normalizeCompanyName("ＡＢＣ㈱")` がいずれも同じ正規化結果になること。
  - 大文字小文字: `matchesQuery("ABC株式会社", "abc")` が`true`。
  - 空クエリ: `matchesQuery(anyName, "")` が常に`true`。
  - 実データ全件（1,867社）に対して`normalizeCompanyName`を適用してもエラーにならないこと（防御的なスモークテスト）。
- `rank.test.ts`（既存ファイルへの追加）:
  - AC-6を`buildRankedCompanies`経由でも固定する（「商船三井」で検索した結果に「株式会社　商船三井」が含まれる）。
  - 検索とフィルタの複合（AND）: 業種フィルタ＋検索語の組み合わせで、検索語なしのときより件数が減ることを固定する。
- E2E（`web/e2e/ranking-filters.spec.ts`に追加）:
  - AC-6の2ケースをブラウザ操作で確認（検索欄に入力→該当社が表に現れる）。
  - 検索欄のキーボード操作（フォーカス→入力）で表が更新されることの確認。
  - 検索欄に可視ラベルが表示されること（既存の「業種・従業員数・在籍年数・平均年齢のフィルタに可視ラベルが表示される」テストに「会社名で検索」を追加する形で拾う）。

## 対象外

業種名・業績での検索、あいまい検索（Issueに明記）。URL同期（`?q=...`）はU5の担当。
