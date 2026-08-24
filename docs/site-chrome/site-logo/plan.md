# plan.md — S4 サイトロゴとファビコン

参照: Issue #163, `docs/site-chrome/spec.md` 6.（AC-21〜AC-28）, `docs/site-chrome/overview.md` S4
依存: なし（S1 は #68 で完了済み）

着手前の段取り。出来上がりの構造は `design.md` に書く。

## 順序

**色 → 図形 → 生成 → 参照 → 画面 → 検証** の順に積む。逆から始めると、色を仮の hex で直書きしてから直すことになり、AC-26（新しい hex を増やさない）を自分で破ってから直す羽目になる。S3 の `plan.md` が決算期で踏んだのと同じ形。

### 1. 色をトークンに繋ぐ

1. `design-system/tokens/tokens.css` の `--primary`（`:root` / `.dark`）を sRGB の hex に変換し、その2値だけを持つ場所を1か所作る
2. **その値がトークンと一致することを固定するテストを先に書く。** トークン側を差し替えたときにここが取り残されるのを止める（`tokens.test.ts` が oklch → 線形sRGB の変換を既に持っているので、同じ手順を使う）

### 2. シンボルの図形を1か所に置く

3. デザイン案の座標（48×48・リング `r=16`・線幅6・`stroke-dasharray="73 28"`・チェック `M15 25 L22 31 L35 16`）を、色と倍率を引数に取る1つの関数にする
4. **倍率の下限・上限をテストで固定する。** maskable のセーフゾーン（中央80%の円）に収まること、クリアスペースが高さの25%以上あること（spec 6.3）。ここを数字で決めておかないと、後で図が切れても気づけない

### 3. 成果物を生成する

5. `pipeline/` に生成スクリプトを足し、`web/public/` へ書き出す（`build:data`・`build:logos` と同じ形）。**`web/` に `sharp` を足さない**——optionalDependencies の解決差で Cloudflare の `npm ci` だけが落ちる事故が2回起きている（CLAUDE.md「開発上の約束」）
6. 出すもの: SVG のファビコン（ダーク対応）、PNG のフォールバック、`apple-touch-icon`、`any`/`maskable` のアイコン、`favicon.ico`、web app manifest
7. **`sharp` は ICO を書けない**ので、ICO の器は自前で組む（PNG を中に入れる形式。`pipeline/lib/logo/image.ts` の `icoToImage` が読む側で、その逆）

### 4. 参照を張り替える

8. `app/layout.tsx` の `metadata.icons` / `manifest` / `viewport.themeColor` から生成物を指す
9. **`web/app/favicon.ico`（`create-next-app` の既定・25,931 バイト）を消す。** 消し忘れると Next.js が自動で `<link rel="icon">` を出し続けるので、AC-21 は「消えていること」をテストで固定する
10. `public/_headers` にアイコンのキャッシュ規則を足す（`/logos/*` と同じ扱いでよいかを見る）

### 5. 画面

11. 共通ヘッダのワードマークを `--primary` の色にする（spec 6.3）。**文字のまま**で、`BrandLink` の振る舞いは変えない

### 6. 検証

12. Unit テスト: 色がトークンと一致すること、生成物の寸法・不透明度・manifest の中身・SVG にダークの分岐があること、旧ファビコンが無いこと
13. E2E: `/` の HTML に各 `<link>` が出ること、参照先が全部 200 で返ること、ヘッダのブランドの色が `--primary` と一致すること（ライト・ダークの両方）、390px で横スクロールが出ないこと
14. `npm run build` の後に `/` の HTML を gzip で測り、AC-28 の予算 75,000 バイトに収まっていることを確認する（現状 63,293 B）
15. dev サーバーを起動してブラウザで実際に見る。ブラウザ操作ツールが使えなければ E2E の結果で代替する（CLAUDE.md「Unit完了後の運用」）

## 先に確かめること

- **アイコンを `app/` の規約ファイル（`app/icon.svg` 等）にするか `public/` に置くか。** 規約ファイルはルートハンドラになるので、リクエストのたびに Worker が起きる。Issue #118（Worker の CPU 超過）を抱えている以上、静的アセットとして配れるかどうかを先に確かめる
- **`/favicon.ico` を残すか。** `web/e2e/network.ts` が「Chromium 141 は `pushState` のたびに `/favicon.ico` を取り直す」として計測から外している。パスを変えるならここも直す
- **ダークのファビコン**（AC-25）。`<link rel="icon" media="...">` はブラウザの対応がまちまちなので、SVG の中に `@media (prefers-color-scheme: dark)` を書く形と比べる
- **`apple-touch-icon` の背景。** 透過のまま渡すと iOS が黒で埋める。不透明にする必要があるかを確かめる

## リスク

- **生成物をコミットする以上、スクリプトを回さずに手で直せてしまう。** `build:data` の「手作業で JSON を編集しない」と同じ線を引き、生成物の性質（寸法・不透明度）をテストで固定する
- **HTML サイズ。** `<link>` が数本増えるだけなので数十バイトの見込みだが、AC-28 があるので測ってから閉じる
