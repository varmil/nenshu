# U3 フィルタ4種 — Unit実行プラン

`docs/AI-DLC実践リファレンス_v10.pdf` の形式に合わせ、ここには段取りを中心に書く。技術的な詳細は `docs/ranking/ranking-filters/design.md` に書く。

## 参照

- Issue #4（完了条件の正）。参照: `docs/ranking/spec.md` §1.5, AC-3/AC-4/AC-5。依存: U2
- `docs/ranking/ranking-table/design.md`（`useRankingState`・`buildRankedCompanies`の既存構造）

## 事前確認（済み）

- 実データ（`web/public/data/companies.json`, 1,867社）で spec.md の区分件数を検証済み: 従業員数 517/734/616、在籍年数 545/732/590、平均年齢 450/709/708（すべて `< / < / それ以上` の単純な閾値で1,867社を過不足なく分割できる）。海運業は7社（AC-3と一致）。
- `npx shadcn add select --dry-run` で `design-system/ui/select.tsx` が追加されることを確認済み（U2で `table`/`toggle-group`/`badge`/`card` を追加したのと同じ導線）。
- URL反映（`ind=海運業` 等）は spec.md AC-3 の文面には出てくるが、**Issue #4 自身の完了条件チェックリストにはURLの項目がない**。`docs/ranking/overview.md` でもURL同期は独立したU5（依存: U3, U4）になっている。よってU3ではURL同期を実装しない（Issue #4の完了条件を正とする）。

## 確定事項（設計の骨子。詳細はdesign.mdへ）

- フィルタは並び替え・ランク付与より前に適用する（`buildRankedCompanies` を「フィルタ→補正年収の計算→ソート→ランク付与→`visibleCount`で切り出し」の順に直す）。
- フィルタ判定ロジックは新規 `web/features/ranking/lib/filter.ts` に置く。
- UIは業種・従業員数・在籍年数・平均年齢の4つとも `Select`（プルダウン）に統一する。年齢スイッチ（ToggleGroup）はそのまま。
- 汎用の `FilterSelect` コンポーネントを1つ作り、4箇所で使う。

## 段取り

1. `docs/ranking/ranking-filters/design.md` を書く（ファイル構成、`matchesFilters`のシグネチャ、`FilterSelect`のprops、テスト方針）。
2. `npx shadcn add select` で `design-system/ui/select.tsx` を追加する。`inventory.md` に追記する。
3. `web/features/ranking/lib/filter.ts` を実装する（分類関数3つ + `matchesFilters`）。実データに対するテスト（`filter.test.ts`）で spec.md の区分件数と海運業=7社を固定する。
4. `web/features/ranking/lib/rank.ts` を「フィルタ→計算→ソート→ランク付与→スライス」の順に書き換える。既存のAC-1/AC-2テスト（U2）が変わらず通ること、かつ新規テストでAC-3・AC-4・AC-5を固定する。
5. `web/features/ranking/lib/filterOptions.ts`（従業員数・在籍年数・平均年齢のラベル付き選択肢定数）を実装する。
6. `web/features/ranking/components/FilterSelect.tsx`（共通プルダウン）を実装する。
7. `RankingApp.tsx` にフィルタ行を追加し、`useRankingState` の `setState` を通じて4つのフィルタを配線する。
8. `npm run build` を確認し、dev serverをブラウザで確認する（絞り込み件数・順位の振り直し・複合フィルタ・モバイルレイアウト・キーボード操作）。
9. Issue #4 の完了条件を一つずつ確認する。

## 依存

U2（`useRankingState`・`buildRankedCompanies`・`RankingApp`）。実装済み。

## リスク

- フィルタを先に適用する順序変更が、U2で固定したAC-1/AC-2のテストを壊さないか。手順4で既存テストを流して確認する。
- `Select`（base-ui）のキーボード操作・aria対応がToggleGroup同様に標準で足りるか未検証。手順8で実ブラウザ確認する。

## この後

続けて `docs/ranking/ranking-filters/design.md` を書いてから実装に入る。実装完了後は `CLAUDE.md`「Unit完了後の運用」に従い、動作チェック → Issue #4 に紐づけたPR → 問題なければマージする。
