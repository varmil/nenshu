# U2 ランキング表と年齢スイッチ — Unit実行プラン

`docs/AI-DLC実践リファレンス_v10.pdf` p.8/p.13 の形式に合わせる。ここには**段取り**を中心に書く。ただし Issue #3 が「`useRankingState` の形をこのUnitで確定させる。設計承認を厚く取る」と明記しているため、承認対象となる状態の形だけは確定事項としてここに明示する（内部実装の詳細は `docs/ranking/ranking-table/design.md` に書く）。

## 参照

- Issue #3（完了条件の正）。参照: `docs/ranking/spec.md` §1.1〜1.4, AC-1 / AC-2 / AC-9。依存: U0, U1
- `docs/adr/0003-age-conversion-client-side.md`（年齢補正はブラウザで計算する）
- `docs/ranking/data-pipeline/design.md`（`companies.json` / `curves.json` のスキーマ）
- `docs/ranking/project-foundation/design.md`（デザイントークン・shadcn設定）

## 事前確認（済み）

- `web/design-system/ui/` の在庫は `button.tsx` のみ。今回 `table`・`toggle-group`・`badge`・`card` を shadcn CLI で追加する（`npx shadcn add table toggle-group badge card`、dry-runで `design-system/ui/` に出力されることを確認済み）。
- 年齢スイッチは shadcn/ui の `ToggleGroup`（`@base-ui/react/toggle-group` ラッパー）を使う。単一選択でも `value` は `string[]` で扱う点、矢印キーでのフォーカス移動とループがプリミティブ側で標準対応済みである点を確認済み（キーボード操作の完了条件を追加実装なしで満たせる）。
- `Table` プリミティブは素の `<table>/<thead>/<tbody>/<th>/<td>` を出す実装で、ヘッダー対応付けの完了条件をそのまま満たす。
- **データの取り込み方式を確定**: `app/page.tsx`（Server Component）が `web/public/data/companies.json` / `curves.json` をビルド時に直接 `import`（`resolveJsonModule`）し、クライアント側の `<RankingApp>` に props として渡す。`output: 'export'` は Client Component も含めて初回レンダーを静的HTMLに焼き込むため、初期状態（35歳・絞り込みなし）がそのままSSGされ、spec.md §3 の「初期表示はHTMLに含める」を追加のロジックなしで満たす。年齢スイッチ操作時の再計算はクライアントの手持ちデータで完結し、ネットワークアクセスは発生しない（spec.md §3 の応答要件と整合）。`public/data/*.json` はこの用途とは別に、`/data/companies.json` として直接アクセス可能な形でも残る（`/about` からの参照や透明性のため）。

## 確定事項: `useRankingState` の形（設計承認の対象）

U3（フィルタ）・U4（検索）・U5（URL同期）が同じ状態を共有する前提で、以下の形で確定する。

```ts
type TargetAge = 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;

interface RankingState {
  targetAge: TargetAge;          // 既定 35
  industry: string | null;       // tse33。U3が使う。U2では常にnull
  employeeSize: EmployeeSizeBucket | null; // U3が使う。U2では常にnull
  tenure: TenureBucket | null;             // U3が使う。U2では常にnull
  avgAgeBucket: AvgAgeBucket | null;       // U3が使う。U2では常にnull
  query: string;                 // U4が使う。U2では常に ""
  visibleCount: number;          // 既定 100（AC-1）。U6の追加読み込みが増やす
}

function useRankingState(companies: CompaniesData, curves: CurvesData): {
  state: RankingState;
  setState: ...; // 個々のsetterではなく単一のstate更新関数にし、U5のURL同期が1か所から状態を書き換えられるようにする
  rankedCompanies: RankedCompany[]; // 派生値。フィルタ→補正年収の計算→ソート→ランク付与→visibleCountで切り出し
}
```

- `rankedCompanies` は `useMemo` による**派生値**であり、それ自体はstateに持たない（Issueの「絞り込み後の行と順位を派生値として導出する」を文字通り満たす）。
- U2ではフィルタ・検索の実フィルタリングは実装しない（`industry`等が常にnullなので分岐が発生しない）。パイプライン自体（補正年収の計算→ソート→ランク付与→スライス）は今回実装し、U3・U4はここに絞り込みステップを差し込むだけで済む形にする。
- バケット型（`EmployeeSizeBucket`等）は spec.md §1.5 の区分に合わせて型だけ今回定義する（値を持つ判定ロジックはU3の担当）。

## 段取り

1. `docs/ranking/ranking-table/design.md` を書く（ファイル構成、補間ロジックの移植方法、フォーマット規則、レスポンシブ方針、テスト方針）。
2. `web/` に Vitest を追加する（ルートと同じ選定。既存の `web/design-system/**` のlint/typecheckフックに `npm --prefix web test` を追加）。
3. 補正年収の計算ロジックを実装する。`scripts/lib/curve.ts` の補間と同じアルゴリズムを `web/features/ranking/lib/curve.ts` に移植し、`web/public/data/companies.json` の実データに対して AC-1（キーエンス35歳=2,178万円）・AC-2（同25歳=1,642万円）をテストとして固定する。
4. ランキング生成パイプライン（フィルタ→補正年収→ソート→ランク付与→`visibleCount`で切り出し）を実装する。AC-2後半（60歳上位50社に35歳上位50社が40社以上含まれる）を実データに対するテストとして固定する。
5. 数値フォーマット（万円・カンマ区切り、小数第1位）をテストとともに実装する。
6. `useRankingState` フックを実装する。
7. shadcn/ui のコンポーネント（table, toggle-group, badge, card）を追加する。
8. `AgeSwitch`（ToggleGroupベース）、`RankingTable`（デスクトップ）、`RankingCardList`（モバイル、`md:hidden`で切替）を実装する。推定年収列を視覚的に最も強くし、列見出しに選択中の年齢を含め、推定である旨の表記を常時出す。平均年収（補正前）とは書式を明確に分ける。
9. `app/page.tsx` を実装し直す（U1のプレースホルダーを置き換え、JSONを読み込み `<RankingApp>` に渡す）。
10. `npm run build` で `output: 'export'` が通ることを確認する。
11. dev serverを起動し、実際にブラウザで確認する: 初期表示がAC-1の数値と一致すること、年齢スイッチでAC-2の数値に変わりページ遷移が起きないこと、モバイル幅でカード表示に切り替わること、年齢スイッチがキーボード操作できること。
12. Issue #3 の完了条件を一つずつ確認する。

## 依存

U0（`companies.json`/`curves.json`のスキーマ）、U1（Next.js基盤・デザイントークン・shadcn導入）。ともに実装済み。

## リスク

- `useRankingState` の形を誤ると後続3Unit分の手戻りになる（Issueの警告どおり）。上記の確定事項をこのUnitの実装前提として固定し、design.mdでも同じ形を踏襲する。
- Server ComponentでのJSON直import＋Client Componentへのprops引き渡しが、`output: 'export'`で意図通り静的HTMLに焼き込まれるかは手順10・11で実ビルド・実ブラウザで確認する。
- 補間ロジックの移植（Node→ブラウザ）でU0と同じ丸め誤差リスクがある。手順3のテストで実データ照合して確認する。

## この後

続けて design.md を書いてから実装に入る。実装完了後は `CLAUDE.md`「Unit完了後の運用」に従い、動作チェック → Issue #3 に紐づけたPR → 問題なければマージする。
