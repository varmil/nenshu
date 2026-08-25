# plan.md — S2 OGPと構造化データ

参照: Issue #116, `docs/site-chrome/spec.md` 4.（AC-10〜AC-16）, `docs/adr/0006-public-url-strategy.md`, `docs/site-chrome/overview.md` S2
依存: U8（#53。`og:url` は `rankingCanonical()` を通す）／S4（#163。OG画像がブランドの図を使う）

着手前の段取り。出来上がりの構造は `design.md` に書く。

## 順序

**文言の出どころ → OG画像 → 構造化データ → 検証** の順に積む。

OG画像から始めたくなるが、先に片付けるのは文言のほうである。**`og:title`・`og:description`・`og:url` は title・description・canonical と同じ文字列でなければならない**（AC-11・AC-12）ので、これは「新しい文言を作る」仕事ではなく「既にある文言の出口を1つ増やす」仕事になる。画像から始めると、その構造を決める前に画像のパスだけが増える。

### 1. 文言の出口を1つにする

1. U16 の `PageMeta` → `Metadata` の変換（`lib/seo/pageMeta.ts` の `toMetadata`）に `og:` 一式を足す。**ここ以外で `openGraph` を組み立てない**——別々に作ると、非正規URLで canonical だけが寄せ先を指し `og:url` が自分自身を指す食い違いが起きる
2. `toMetadata` を通っていないページを探して通す。`/about` が素の `Metadata` を直書きしているので、文言を `lib/seo/` へ出す
3. Next.js のメタデータのマージが**入れ子ごと差し替え**であることを確かめ、ページが返さないルート（`/_not-found`）のぶんを `app/layout.tsx` に置く
4. クライアント側（`usePageMeta`）でも `og:title`・`og:description`・`og:url` を書き換える。**操作はすべて `pushState`** なので、これが無いと DOM の上で canonical と `og:url` が食い違う

### 2. OG画像を1枚焼く

5. 寸法・パス・代替テキストを `web/lib/brand/assets.ts` の表に足す（S4 が作った表。使い手は生成スクリプト・`layout.tsx`・テスト・`e2e/network.ts` の4つ）
6. 版面を組む。**シンボルは `pipeline/brand/symbol.ts` から取る**——図形を書き写すと「OG画像だけ古い形」という気づけない壊れ方をする
7. **文字をどう置くかを先に決める。** `sharp`（librsvg）の `<text>` は実行環境の fontconfig を引くので、日本語フォントの無い機械で焼くと豆腐が並ぶ——しかも寸法もバイト数も正しいままなので、テストでは捕まらない
8. `pipeline/scripts/build-brand.ts` から焼き、`public/_headers` にキャッシュ規則を足す

### 3. 構造化データ

9. `BreadcrumbList`（`/company/[id]`）と `WebSite`（`/`・`/about`）を作る。**画面に既にある情報だけ**（AC-15）
10. パンくずの段の並びを画面と共有する。**書き写すと、業種チップの行き先を直したときに構造化データだけが古い階層を指す**（AC-14）

### 4. 検証

11. Unit テスト: `toMetadata` が og を出すこと・JSON-LD の形・OG画像の寸法と不透明度・版面が枠からはみ出さないこと
12. E2E: 5種類のページ（`/`・`/?age=N`・`/?ind=X`・`/about`・`/company/[id]`）で `og:` 一式が出ること、非正規URLでも `og:url` が canonical と一致すること、OG画像が 200 で 1200×630 であること、JSON-LD が画面のパンくずと一致すること
13. E2E: **操作したあとも `og:url` が canonical と一致すること**（`e2e/metadata.spec.ts` の比較対象に足す）
14. `npm run build` の後に `/` の HTML を gzip で測り、AC-16 の予算 75,000 バイトに収まっていることを確認する
15. dev サーバーを起動してブラウザで見る。ブラウザ操作ツールが使えなければ E2E の結果で代替する（CLAUDE.md「Unit完了後の運用」）

## 先に確かめること

- **Next.js のメタデータは `openGraph` を深くマージするのか。** ページとレイアウトの両方に置いたときに何が残るかで、定数をどこに置くかが変わる
- **`twitter:*` をどこまで書くか。** X は `og:` を読むので、同じ文言を2組書くのはバイト数の無駄になる。Next.js が `twitter` から何を自動で埋めるかを実際のHTMLで確かめる
- **OG画像の文字。** ブランド名は Latin、説明文は日本語。どちらもフォントが要る——実行環境に依存しない置き方があるか
- **`WebSite` に `potentialAction`（サイトリンク検索ボックス）を足すか。** ヘッダに検索欄はある

## リスク

- **画面に無い主張を構造化データに書いてしまう。** 企業ページには金額・偏差値・順位が揃っているので、`Organization` や `Dataset` を足したくなる。**spec 4.4 が禁じているのはそれ**で、鍵の集合そのものをテストで固定して入口を塞ぐ
- **HTML サイズ。** `og:` は文言を2度（`<meta>` と RSC ペイロード）出すので、description の長い企業ページで効く。AC-16 の予算があるので測ってから閉じる
- **OG画像が壊れても気づけない。** 寸法もバイト数も正しいまま中身だけが豆腐になる経路があるので、「焼いた実物を見るテスト」（S4 の `assets.test.ts`）だけでは足りない
