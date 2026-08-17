# inventory.md — デザインシステム在庫台帳

`design-system/ui/` と `design-system/components/` にあるものの一覧。新しい合成物を追加したときはここに追記する。

## tokens/

- `tokens.css` — 色・余白・タイポ（フォントサイズ）・角丸・影のCSS変数。色以外はライト/ダークで変わらない。
- `tailwind.preset.ts` — 上記トークンを型付きで参照するための薄いレイヤー（CSS以外の場所からの参照用）。

## ui/（shadcnプリミティブ）

| コンポーネント | 追加日 | 備考 |
| --- | --- | --- |
| `button.tsx` | U1 | `npx shadcn@latest add button` |
| `table.tsx` | U2 | `npx shadcn@latest add table` |
| `toggle.tsx` / `toggle-group.tsx` | U2 | `npx shadcn@latest add toggle-group`（年齢スイッチ用） |
| `badge.tsx` | U2 | `npx shadcn@latest add badge` |
| `card.tsx` | U2 | `npx shadcn@latest add card` |
| `select.tsx` | U3 | `npx shadcn@latest add select`（フィルタ4種のプルダウン用） |

## components/（合成物）

まだ無い。Bolt 1 で複数施策から使う合成物が必要になった時点で追加し、ここに記録する。
