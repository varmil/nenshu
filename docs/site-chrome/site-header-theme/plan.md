# S1 共通ヘッダとライト/ダーク切替 — plan.md

参照: Issue #68（親: #66）, `docs/site-chrome/spec.md` AC-1〜AC-9
依存: なし

## Context

`tokens.css` に `.dark` の配色は #63 で揃ったが、**アプリ側に `.dark` を付ける仕組みが無く、ダークは一度も画面に出ていない**。Issue #66 の動機は「テーマを適用したのでダークモードでの見栄えを確認したい」。

置き場所が問題になる。**3ページとも共通ヘッダが無い**（`/` は `max-w-5xl`、`/about` と `/company/[id]` は `3xl`、先頭要素もそれぞれ違う）。共通バーを新設し、そこにサイト名と切替を置く。

## 事前に確定させた数値（実測済み・受け入れ基準の元）

`tokens.css` のコントラスト（WCAG 2.1、oklch → 線形sRGB → 相対輝度で算出）

| ペア | ライト | ダーク（現状） |
| --- | ---: | ---: |
| `--foreground` on `--background` | 19.71 | 19.00 |
| `--muted-foreground` on `--background` | 4.61 | 8.07 |
| **`--primary` on `--background`** | **5.28** | **2.72 ★AA不足** |
| `--primary-foreground` on `--primary` | 5.07 | 6.97 |

ダークの `--primary` 候補（背景 `oklch(0.148 0.004 228.8)` に対して）

| 候補 | 値 | 文字色として | 塗った時の対文字 |
| --- | --- | ---: | ---: |
| 現状 | `oklch(0.45 0.085 224.283)` | 2.72 ★ | 6.97（白文字） |
| **採用**（プリセットの `.dark --sidebar-primary`） | `oklch(0.715 0.143 215.221)` | **8.34** | **5.66**（`oklch(0.302 0.056 229.695)`） |
| `--chart-3` | `oklch(0.609 0.126 221.723)` | 5.47 | 3.72 ★ |
| `--chart-1` | `oklch(0.865 0.127 207.078)` | 13.65 | 9.27 |

`--chart-1` は文字色としては最も読めるが塗りにした時に白文字が 1.39 まで落ちる。**両用途で AA を満たすのは採用案だけ**なので、これを選ぶ。

## 変更するもの

### design-system（先に直す）

- `web/design-system/tokens/tokens.css` — `.dark` の `--primary` / `--primary-foreground` のみ差し替える。ライト側は触らない

### web（新規）

- `web/features/theme/lib/theme.ts` — `Theme = "light" | "dark"`、`STORAGE_KEY`、保存値と OS 設定から実際に使うモードを解決する純粋関数、`<html>` の class を付け外しする関数。**判定とDOM操作を分ける**（前者を Unit テストの主対象にする）
- `web/features/theme/lib/themeScript.ts` — 初回描画前に流すインラインスクリプトを組み立てる。`web/lib/analytics/clarity.ts` の `buildClarityScript` が同じ形なのでそれに倣う
- `web/features/theme/components/ThemeToggle.tsx` — `"use client"`。lucide の `Sun`/`Moon`（`lucide-react` は導入済み）を既存の `design-system/ui/button.tsx` に載せる。**新しいプリミティブを足さない**
- `web/features/navigation/components/SiteHeader.tsx` — 共通バー。`NavLink`・`NavProgressBar` と同じ施策なのでここに置く

### web（変更）

- `web/app/layout.tsx` — インラインスクリプト、`<html suppressHydrationWarning>`、`SiteHeader`、`metadata.title`
- `web/features/ranking/components/RankingApp.tsx` — 「計算方法」リンクを削除（バーへ移る）。**`h1` は残す**
- `web/features/company/components/CompanyDetail.tsx` — パンくず先頭を「ランキング」に短縮
- `web/app/about/page.tsx` — `metadata.title`

### 再利用するもの（新しく作らない）

`NavLink`（`features/navigation/`）、`Button`（`design-system/ui/`）、`lucide-react` のアイコン。

## FOUC をどう避けるか

**`next/script` を使わない。** 素の `<script dangerouslySetInnerHTML>` を `<body>` の先頭に置き、パーサをブロックさせて最初の描画前に class を確定させる。`<html>` に `suppressHydrationWarning` を付ける（React の知らないところで class が変わるため）。

`web/AGENTS.md` のとおりこの Next は挙動が違いうるので、**実際にダークで開いて確かめる**（下の検証 3）。ダメなら `<head>` 直下に移す。

## テスト

「開発上の約束」に従い Unit と E2E の両方を書く。

- `web/features/theme/lib/theme.test.ts` — 保存値（無し / light / dark / 壊れた値）× OS 設定（light / dark）の組み合わせで解決結果を固定する
- `web/design-system/tokens/tokens.test.ts` — **コントラストのテストを `.dark` にも広げる**。今は `:root` しか見ておらず、それが 2.72 の見逃しを許していた
- `web/e2e/theme.spec.ts` — AC-3〜AC-7。`colorScheme: "dark"` での初回描画、トグルでの切替、リロード後の保持、切替でネットワークが発生しないこと、ダークでのリンクのコントラスト
- `web/e2e/ranking-filters.spec.ts` — AC-9（モバイル幅で横スクロールしないこと）は既存のテストがあるので、ヘッダ追加後も緑であることを確認する

## 検証

1. `cd web && npm run lint && npm run typecheck && npm test && npm run build`
2. `npm run test:e2e`
3. **dev server を立て、ライトとダークの両方で `/`・`/about`・`/company/6861` を実際に触る。** 特に見るところ:
   - ダークでリンク・選択中のタブ・年齢別チャートが読めるか（今回直す `--primary`）
   - 表の罫線（ダークの `--border` は `oklch(1 0 0 / 10%)` と薄い）が行を区切れているか
   - カード（`--card`）と背景の差がダークで付いているか
   - **OS をダークにした状態で初回表示し、一瞬白く光らないこと**
4. PR（`Closes #68`）→ 問題が無ければマージ

## リスク

- **FOUC が消せない可能性。** インラインスクリプトの位置で挙動が変わる。E2E（`domcontentloaded` 時点の class）とスクリーンショットの両方で見る
- **ダークの `--border` が `oklch(1 0 0 / 10%)` と薄く、表の行が区切れないかもしれない。** 実際に見て判断する。直すならこの Unit の中で（ダークが初めて出る Unit なので）
- **ヘッダの追加で既存のE2Eの座標系がずれる。** `navigation-progress.spec.ts` は `h1` の boundingBox を遷移の前後で比較しており、絶対位置ではないので通るはずだが、実行して確かめる
- **サイト名の変更が既存のE2Eに当たる。** `navigation-progress.spec.ts:46` が `h1` を「年齢補正年収ランキング」で取っている。`h1` を残す判断はこれとも整合する
