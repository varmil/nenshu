# U4 フリーワード検索 — Unit実行プラン

## 参照

- Issue #5（完了条件の正）。参照: `docs/ranking/spec.md` §1.6, AC-6。依存: U2
- `docs/ranking/ranking-table/design.md`（`useRankingState`・`buildRankedCompanies`の既存構造）
- `docs/ranking/ranking-filters/design.md`（U3のフィルタ実装。`buildRankedCompanies`のフィルタ→計算→ソート→ランク付与の順、`FilterSelect`/`FilterToggleGroup`の見た目パターン）

## 事前確認（済み）

- 実データで確認: 社名に全角スペースを含む会社が74件（spec.mdの記載と一致）。`6861`=株式会社キーエンス、商船三井の社名は`株式会社　商船三井`（全角スペース入り）。
- 正規化に必要な変換（全角英数→半角、半角カナ→全角カナ、英字小文字化）は `String.prototype.normalize("NFKC")` 一発で「全角英数→半角」と「半角カナ→全角カナ」の両方が満たせることをNode上で実証済み。
- 法人格除去の対象「㈱」はNFKC正規化で自動的に`"(株)"`に分解されることを確認済み。Issueの完了条件の文言に合わせ、5パターン（株式会社・(株)・㈱・有限会社・合同会社）を明示的にコードへ書く。
- 空白除去は正規表現の`\s`で半角・全角スペース（U+3000）の両方にマッチすることを確認済み。
- `npx shadcn add input --dry-run` で `design-system/ui/input.tsx` が追加されることを確認済み。

## 確定事項（設計の骨子。詳細はdesign.mdへ）

- 正規化・照合ロジックは新規 `web/features/ranking/lib/search.ts` に置く（`filter.ts`とは別の関心事）。
- `rank.ts`のフィルタ条件に`matchesQuery`をANDで足す。
- UIは`design-system/ui/input.tsx`（shadcn、新規追加）ベースの`SearchInput`コンポーネントを1つ作り、フィルタ行の近くに配置する。デバウンス無しでも100ms要件は満たせる想定。

## 段取り

1. `docs/ranking/free-word-search/design.md` を書く（ファイル構成、シグネチャ、UI配置、テスト方針）。
2. `npx shadcn add input` で `design-system/ui/input.tsx` を追加、`inventory.md`に追記する。
3. `web/features/ranking/lib/search.ts` を実装する。`search.test.ts`でAC-6の2ケースを実データに対して固定する。
4. `rank.ts`に`matchesQuery`をANDで追加する。既存テストが壊れないことを確認する。
5. `SearchInput`コンポーネントを実装し、`RankingApp.tsx`に配線する。
6. Unitテスト・lint・typecheck・buildを確認する。
7. 見た目・機能の変更なのでE2Eも書く（`web/e2e/`）。AC-6の2ケース、フィルタとの複合検索、キーボード入力での更新を確認する。
8. Issue #5 の完了条件を一つずつ確認する。

## 依存

U2（`useRankingState`・`RankingApp`）、U3（`buildRankedCompanies`の順序、フィルタコンポーネントの見た目パターン）。ともに実装済み。

## リスク

- 法人格除去パターンが社名の一部と偶然一致するケースがないか、手順3で実データ全件に対する副作用を確認する。
- 検索とU3のフィルタの組み合わせ順序（AND）を`rank.ts`側で正しく書けるか、手順4で複合ケースをテストする。

## この後

続けて `docs/ranking/free-word-search/design.md` を書いてから実装に入る。実装完了後は `CLAUDE.md`「Unit完了後の運用」に従い、動作チェック（Unit + E2E）→ Issue #5 に紐づけたPR → 問題なければマージする。
