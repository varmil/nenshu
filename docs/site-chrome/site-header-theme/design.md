# S1 共通ヘッダとライト/ダーク切替 — design.md

参照: Issue #68（親: #66）, `docs/site-chrome/spec.md`
plan: `./plan.md`

実装しながら決めたこと。決定は Issue のコメントではなくここに置く（CLAUDE.md）。

## 1. 表示モードは `<html>` のクラスが正で、React はそれを読むだけ

**サーバーはモードを知りえない。** SSR の出力はエッジで24時間キャッシュされる（`next.config.ts` の `s-maxage=86400`、`wrangler.jsonc` の `cache.enabled: true`）ので、モードをHTMLに焼くと**ある読者の選択がキャッシュ経由で他の読者に配られる**。

したがって唯一の真実は「いま `<html>` に `dark` が付いているか」で、これを

1. `themeScript.ts` のインラインスクリプトが**最初の描画より前に**確定させる
2. `ThemeToggle` が後から読む

という順序にした。React の state をモードの正にしていない。

### `useSyncExternalStore` を使った理由

最初は `useEffect` + `setState` で `<html>` のクラスを読んでいたが、**lint に止められた**:

```
react-hooks/set-state-in-effect
Calling setState synchronously within an effect can trigger cascading renders
```

これは正しい指摘で、`<html>` のクラスは「React の外にある状態」なのだから `useSyncExternalStore` が本来の道具になる。`getServerSnapshot` は `null` を返し、サーバー描画とハイドレーション中はアイコンを出さない。**ここで仮に太陽を描くと、ダークの読者にだけ一瞬まちがったアイコンが見える。**

購読は `<html>` の class 属性への `MutationObserver`。自分の `applyTheme` による変更も同じ経路で拾えるので、状態の持ち方が1本になる。

## 2. FOUC は素の `<script>` で殺す。`next/script` は使わない

`next/script` の `strategy` は `beforeInteractive` を含めどれも「**描画をブロックしない**」ことを目的にしている（同梱docs `01-app/03-api-reference/02-components/script.md`: "their execution does not block page hydration from occurring"）。ここで欲しいのは逆の性質——**ブロックしてでも最初のペイントより前に走る**こと。

`<body>` の先頭に素の `<script dangerouslySetInnerHTML>` を置き、HTMLパーサを止めて実行させる。`<html>` には `suppressHydrationWarning` を付ける（Reactの知らないところでクラスが変わるため）。

**効いていることをE2Eで固定した。** `waitUntil: "domcontentloaded"` の時点で `dark` が付いていることを見る——`load` 後に見ると、ハイドレーション後に付いた場合でも通ってしまい、テストとして意味を失う。

インラインスクリプトを消すと AC-3 と AC-5 が実際に落ちることを確認済み。

## 3. ダークの `--primary` をプリセットの別トークンから借りた

`.dark` の `--primary` は背景に対して **2.72:1** しかなかった（AA は 4.5:1）。#65 で Primary をリンク・選択中のタブ・年齢別チャートの色に振り直しているので、**直さずに出すと全リンクとチャートが読めない。**

候補を実測して比べた（背景 `oklch(0.148 0.004 228.8)`）:

| 候補 | 文字色として | 塗った時の対文字 |
| --- | ---: | ---: |
| 現状 `oklch(0.45 0.085 224.283)` | 2.72 ★ | 6.97 |
| **採用** `oklch(0.715 0.143 215.221)` | **8.34** | **5.66** |
| `--chart-3` `oklch(0.609 0.126 221.723)` | 5.47 | 3.72 ★ |
| `--chart-1` `oklch(0.865 0.127 207.078)` | 13.65 | 9.27 / 白文字は 1.39 ★ |

採用した値は**プリセット `b1sAmVzuq` が `.dark` の `--sidebar-primary` / `--sidebar-primary-foreground` として持っているペアそのもの**。プリセットの外の色を発明していない。`--primary` は「リンクの文字色」と「選択中のタブの塗り」の両方で使うので、**両用途で AA を満たす必要がある**。それを満たすのは採用案だけだった。

### なぜ今まで気づかなかったか

`tokens.test.ts` のコントラストテストが **`:root` しか見ていなかった**。ダークの配色はファイルには揃っていたが画面に出す仕組みが無く、誰も見ていなかった。**この Unit でテストを両モードに広げた**（`it.each` を `modes.flatMap(...)` に変更）。広げたテストは、`--primary` を元の値に戻すと実際に落ちる。

## 4. `ThemeToggle` を `design-system/` へ昇格させない

リファレンスの運用ルール④（featureをまたぐUIは `design-system/components/` へ昇格）に照らすと、共通ヘッダから使われる以上「またいでいる」ように見える。

**昇格させないと判断した。** 使う場所は共通ヘッダ1箇所だけで、複数の feature から使われるわけではない。`design-system/` は「在庫」であって「1箇所で使う部品の置き場」ではない。`AgeSwitch` を昇格させなかったとき（`docs/company/company-page/design.md`）と同じ基準。

`design-system/ui/` にも何も足していない。2状態なので dropdown-menu が要らず、既存の `Button`（`variant="ghost"` / `size="icon"`）と `lucide-react` のアイコンで足りた。

## 5. `h1` は「年齢補正年収ランキング」のまま残した

ブランド名（OpenReport）はヘッダが持ち、**`h1` はそのページの内容を表すべき**なので変えていない。`/` の `h1` を「OpenReport」にすると、検索エンジンにも読者にも「このページが何か」が伝わらなくなる。

副次的に、`e2e/navigation-progress.spec.ts` がこの文字列で `h1` を取っているため既存テストも壊れていない。

## 6. OS の設定変更にセッション中も追従する

`matchMedia("(prefers-color-scheme: dark)")` の `change` を購読し、**まだ読者が選んでいない場合にかぎり**画面へ反映する（`syncSystemTheme`）。明示的な選択があるときは何もしない——読者が選んだものを OS の都合で上書きしない。

このとき保存はしない。保存すると「未選択」という状態そのものが消えてしまい、以後 OS に追従しなくなる。

## 残った負債

- **`--border` がダークで `oklch(1 0 0 / 10%)` と薄い。** 実際に見たところ表の行は区切れていたので今回は触っていないが、掲載企業数が増えたときに読みにくくなる可能性はある
- **`/company/[id]` の title にブランドを入れていない。** 会社名と金額が主役で、文字数を食いたくないため（spec.md 1.4）。サイト全体のブランディングを詰める段になったら見直す
