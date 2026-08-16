# design-system.md — 規約

このディレクトリはフェーズに属さない永続層（CLAUDE.md「エージェントが従う優先順位」に対応）。

## 優先順位

既存コードベース ＞ このレジストリ ＞ モック。在庫にないものが必要になったら、その場で作らず Issue を起票する。

## 色

`tokens/tokens.css` の CSS 変数だけを使う。生の hex は書かない（`web/eslint.config.mjs` の `no-restricted-syntax` で強制、`tokens/` ディレクトリ自身は除外）。

## 余白・タイポ・角丸・影

同じく `tokens/tokens.css` の CSS 変数から。ただし余白（`--space-*`）は Tailwind の `--spacing-*` 名前空間とは意図的に分離している。`--spacing-*` は `w-*` / `max-w-*` / `h-*` / `p-*` / `m-*` / `gap-*` など複数の utility ファミリーが共有する基準スケールで、そこに独自の名前付きキー（`sm`/`md`/`lg` 等）を追加すると無関係な utility の値を書き換えてしまう（U1 実装中に `max-w-md` が壊れる形で実際に発生した）。今後もこのファイルの `@theme` ブロックに `--spacing-*` の新しいキーを追加しない。

## コンポーネント

`ui/` は shadcn CLI が生成するプリミティブ専用（手で盛らない）。`components/` は複数箇所で使う合成物。単一施策専用のUIは `features/<施策>/components/` に置き、ここには昇格させない。

## 追加手順

1. `npx shadcn@latest add <component>` → `design-system/ui/` に生成される（`components.json` の alias 設定済み）。
2. `inventory.md` に追記する。
