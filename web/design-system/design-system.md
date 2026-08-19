# design-system.md — 規約

このディレクトリはフェーズに属さない永続層（CLAUDE.md「エージェントが従う優先順位」に対応）。

## 優先順位

既存コードベース ＞ このレジストリ ＞ モック。在庫にないものが必要になったら、その場で作らず Issue を起票する。

## 色

`tokens/tokens.css` の CSS 変数だけを使う。生の hex は書かない（`web/eslint.config.mjs` の `no-restricted-syntax` で強制、`tokens/` ディレクトリ自身は除外）。

配色は shadcn の create プリセット **`b1sAmVzuq`**（style `nova` / baseColor `mist` / theme `cyan` / chart `cyan` / radius `small`）由来（Issue #62）。

**入れ替えるときは手で書かず CLI を使う。**

```
cd web && npx shadcn@latest apply <preset-code> --only theme --yes
```

`--only theme` なら `:root` / `.dark` の色変数と `--radius` だけが書き換わり、このファイル独自の `@theme` ブロックや `--space-*` は保たれる（適用後、`--background` / `--foreground` が `:root` の末尾へ移動するので先頭に戻すこと）。**`--only font` は使わない**——`app/globals.css` に既にある `@layer base` を重複して吐き、`app/layout.tsx` を独自の書式で上書きするため。フォントは今のところプリセットの対象外にしている（和文サイトで Noto Sans (latin) に替えても日本語グリフはシステムフォントのままで、見た目が変わらない割に CLS リスクだけ増えるため）。

`components.json` の `style` は `<プリミティブ基盤>-<デザイン>` の合成 ID（`base` = Base UI / `radix` / `aria` × `nova` / `luma` / `sera` …）。`preset decode` が出す `style` はデザイン側の名前だけで、基盤は含まれない。このリポは `base-nova`。

トークンの健全性（ライト/ダークの対称性・WCAG AA のコントラスト）は `tokens/tokens.test.ts` と `e2e/theme.spec.ts` で固定してある。プリセットを差し替えたらこの 2 つを走らせる。

### Primary の役割

**Primary はナビゲーションの色。データの色ではない。**

| 使う | 使わない |
| --- | --- |
| リンク全般（会社名・パンくず・「計算方法」・本文中・外部リンク） | 年収額などの数値そのもの（地のテキスト色のまま） |
| 選択中のタブ（年齢スイッチ・フィルタ）の塗り | 見出し・本文 |
| 年齢別チャートの折れ線と選択中の点 | |

年収額は主役だが、**主役だからと色を付けると画面上で最も目立つ色が「押せないもの」に割り当てられる。** サイズと太さで主役であることは十分伝わるので、色はクリックできるものに取っておく。OpenWork の企業一覧が同じ切り分け（黒＝データ、青＝ナビゲーション）で、リンク色は `rgb(22,108,157)` — この `--primary`（`rgb(0,117,149)`）とほぼ同じ色を1ページ 430 リンクに当てても煩くない。

選択中のタブは `TAB_TOGGLE_SELECTED_CLASS`（`features/ranking/components/tabToggleClass.ts`）で塗る。shadcn プリミティブの既定 `data-[state=on]:bg-muted` はごく薄いグレーで選択中が分からないため上書きしている。`ui/` は手で盛らない約束なので、プリミティブ側ではなく呼び出し側で当てる。

## 余白・タイポ・角丸・影

同じく `tokens/tokens.css` の CSS 変数から。ただし余白（`--space-*`）は Tailwind の `--spacing-*` 名前空間とは意図的に分離している。`--spacing-*` は `w-*` / `max-w-*` / `h-*` / `p-*` / `m-*` / `gap-*` など複数の utility ファミリーが共有する基準スケールで、そこに独自の名前付きキー（`sm`/`md`/`lg` 等）を追加すると無関係な utility の値を書き換えてしまう（U1 実装中に `max-w-md` が壊れる形で実際に発生した）。今後もこのファイルの `@theme` ブロックに `--spacing-*` の新しいキーを追加しない。

## コンポーネント

`ui/` は shadcn CLI が生成するプリミティブ専用（手で盛らない）。`components/` は複数箇所で使う合成物。単一施策専用のUIは `features/<施策>/components/` に置き、ここには昇格させない。

## 追加手順

1. `npx shadcn@latest add <component>` → `design-system/ui/` に生成される（`components.json` の alias 設定済み）。
2. `inventory.md` に追記する。
