# U0 データ変換パイプライン — Unit実行プラン

**2026-08-17追記（Issue #11）**: 本文中の `scripts/`・`data/` は、その後 `pipeline/scripts/`・`pipeline/data/` に移動した。詳細は `docs/ranking/data-pipeline/design.md` の追記を参照。

`docs/AI-DLC実践リファレンス_v10.pdf` p.8/p.13 の形式に合わせる。ここには**段取り（作業手順と検証順）**だけを書く。技術選定の理由や内部構造・関数シグネチャは書かない — それは `docs/ranking/data-pipeline/design.md` に委ねる。

## 参照

- Issue #1（完了条件の正）
- `docs/adr/0003-age-conversion-client-side.md`
- `docs/ranking/spec.md` §3

## 事前確認（済み）

- `data/ranking_unified_2026.csv`（1,867行）と `data/annual_curves.json` の列・値を実データで確認済み。CSVの `industry` 列（産業大分類）がすでに賃金カーブのキーと一致しており、`salary/curves.py` の `TSE33_TO_INDUSTRY` 表を再実装する必要はないと判明。
- **id のスラッグ化方式をユーザーに確認し、機械的フォールバック方式で確定済み**（正確なローマ字化に必要な読み仮名辞書がリポジトリにもEDINETコードリストにも無いため）。詳細アルゴリズムは design.md に書く。

## 段取り

1. `docs/ranking/data-pipeline/design.md` を書く（ファイル構成・id生成アルゴリズム・テスト内容・使用ツールの選定理由）。
2. 補間ロジック（区分線形補間、範囲外は端の値で頭打ち）を実装 → 単体テストで `salary/curves.py` の `_interp` と同じ挙動になることを確認。
3. CSVパーサを実装（`data/ranking_unified_2026.csv` を読み、1,867行であることをアサート）。
4. id生成（証券コード優先／欠損時は確定済みのフォールバック方式）を実装 → 1,867件の一意性をテスト。
5. `companies.json` / `curves.json` を書き出す本体を実装。
6. Issue #1 の完了条件をテストとして固定する。特に「カーブから再計算した35歳時点の推定年収が、CSVの `salary35` と全1,867社で一致する」を最優先で検証する。
7. `companies.json` の gzip後サイズが100KB以内であることを確認する。
8. 実際に生成した `companies.json` を、`docs/ranking/spec.md` の AC-1（キーエンスが1位・推定年収2,178万円）と目視で突き合わせる。

## 依存

なし（`docs/ranking/overview.md` の通り、U0は他Unitに依存しない）。

## リスク

- Python の `round()`（銀行丸め）と JavaScript の `Math.round()`（四捨五入）の差により、`salary35` の全数一致テストが極小数の境界ケースで割れる可能性がある。手順6で実際に確認し、発生したら丸め方式をPython側に合わせる。
- `web/`（Next.jsアプリ本体）がまだ存在しない（U1未着手）。U0をそれに依存させない置き場所にする方針は design.md で確定させる。

## この後

続けて `docs/ranking/data-pipeline/design.md` を書いてから実装に入る。
