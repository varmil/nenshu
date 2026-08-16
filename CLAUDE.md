# CLAUDE.md

年齢補正した年収ランキングを公開する静的サイト。AI-DLC に沿って開発する。

AI-DLC のフェーズ定義・ドキュメント種別（spec / overview / plan / design の違い）・承認ゲートは `docs/AI-DLC実践リファレンス_v10.pdf` が正。plan.md や design.md を書く前、Unit に着手する前は必ずこれを読み、記載されている型に従う。

## このリポジトリの読み方

決定はすべて `docs/` にある。セッションをまたぐ前提はここから読む。

| 知りたいこと | 読む場所 |
| --- | --- |
| 開発の進め方（フェーズ・ドキュメント種別・承認ゲート） | `docs/AI-DLC実践リファレンス_v10.pdf` |
| プロダクト全体の面・アクター・施策一覧 | `docs/product/product.md` |
| 用語の定義 | `docs/product/glossary.md` |
| なぜ作るか・成功指標 | `docs/ranking/intent.md` |
| 何を作るか・受け入れ基準 | `docs/ranking/spec.md` |
| Unit の分解と順序 | `docs/ranking/overview.md` |
| 不可逆な技術決定 | `docs/adr/NNNN-*.md` |

Unit ごとの `plan.md` / `design.md` は、その Unit に着手する時点で書く。事前に埋めない。

## 採用スタック

Next.js 15（App Router / `output: 'export'`）、TypeScript、Tailwind CSS、shadcn/ui、Cloudflare Pages。
サーバーサイドの実行環境を持たない。API もデータベースもない。

理由は ADR-0001 と ADR-0002 にある。

## エージェントが従う優先順位

既存コードベース ＞ `web/design-system/` のレジストリ ＞ モック。

色は `design-system/tokens/tokens.css` の CSS 変数だけを使う。生の hex を書かない。
コンポーネントは `design-system/ui/`（shadcn プリミティブ）と `design-system/components/`（合成物）から取る。
在庫にないものが必要になったら、その場で作らず Issue を起票する。

## 開発上の約束

- 数値の出典と計算方法は必ずユーザーから見える場所に置く。根拠を隠した推定値を表示しない。
- 推定値と実測値を同じ書式で並べない。年齢補正後の金額は推定であることが読んで分かる形にする。
- データの再生成は `scripts/build-data.ts` に集約する。手作業で JSON を編集しない。

## Unit完了後の運用

Unit の実装を終えたら、次の順で進める。

1. **動作チェック**: ビルドとテストを実行する。UIを持つ Unit は dev server を起動し、実際にブラウザで機能を触って確認する（型チェック・テストが通ることはコードの正しさの保証であって、機能の正しさの保証ではない）。
2. 対応する Issue に紐づけた PR を作成する（`Closes #<番号>`）。
3. **動作チェックに問題がなければ、承認を待たずにマージしてよい。** 問題が見つかった場合はマージせず、内容を報告する。

この許可は Unit の実装フロー（ビルド・テスト・PR・マージ）に限る。破壊的な操作（force push・履歴の書き換え等）や、この運用の対象外の判断が要る場面は都度確認する。

## 現在地

Bolt 1（MVP: ランキング1ページ）に着手する段階。U0（データ変換パイプライン）は実装済み（`docs/ranking/data-pipeline/`、Issue #1）。次は `docs/ranking/overview.md` の U1（プロジェクト基盤とデザイントークン）。
