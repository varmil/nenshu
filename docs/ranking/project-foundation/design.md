# U1 プロジェクト基盤とデザイントークン — design.md

## バージョン方針の訂正

実装着手時、ADR-0002・CLAUDE.mdが「Next.js 15」と明記していたが、`create-next-app@latest` は Next.js 16.3.1 を導入した。ユーザーに確認したところ、「Next.jsに限らずライブラリは全般的に最新版を使う」方針が正しいとのことで、**ADR-0002とCLAUDE.mdからバージョン固定の文言を削除し、最新安定版を使う方針に修正した。** 以後、特定バージョンへの固定が必要になった場合のみADRに理由を書く。

## 構成

```
repo/
├─ package.json              # データパイプライン専用（U0, 変更なし）
├─ scripts/                  # build-data.ts（U0, 変更なし。2026-08-17: Issue #11 で pipeline/scripts/ に移動）
├─ data/                     # ソースCSV・カーブ（変更なし。2026-08-17: Issue #11 で pipeline/data/ に移動）
└─ web/                      # Next.js アプリ本体（このUnitで新設）
   ├─ package.json
   ├─ next.config.ts          # output: 'export', images.unoptimized, turbopack.root
   ├─ app/
   ├─ design-system/
   │  ├─ tokens/
   │  │  ├─ tokens.css        # 色・余白・タイポ・角丸・影のCSS変数 + @theme マッピング
   │  │  └─ tailwind.preset.ts
   │  ├─ ui/                  # shadcn プリミティブ
   │  ├─ components/          # 合成物（このUnitでは器のみ）
   │  ├─ inventory.md
   │  └─ design-system.md
   ├─ features/ranking/components/  # 空（U2以降が使う）
   └─ public/data/             # companies.json / curves.json（U0の出力先をここに変更）
```

`web/` はリポジトリ直下の `package.json`（データパイプライン用）とは独立した別プロジェクトにする。npm workspaces化はしない。理由: 開発者1名・2プロジェクトの依存関係に重なりが無く、モノレポ化の複利が無い。`next.config.ts` の `turbopack.root` を `web/` 自身に明示し、2つの lockfile がある構成でも Turbopack のワークスペースルート誤検出が起きないようにする（実装中に警告が出たため確認済み）。

## デザイントークン（Tailwind v4）

Tailwind v4はJSプリセットの読み込みを前提とせず、CSSの `@theme` ブロックでテーマを直接定義する。Issue #2 の完了条件は「`tailwind.preset.ts` がトークンをTailwindのテーマへ写像している」という文言だが、v4ではCSS側が実質的な写像を担う。このUnitでは:

- `web/design-system/tokens/tokens.css`: `:root` に色・余白・角丸・影・タイポのCSS変数を定義し、同じファイル内の `@theme inline` ブロックで `--color-*` 等のTailwindトークンにマッピングする。ダークモードは `prefers-color-scheme` で変数を再定義する。
- `web/design-system/tokens/tailwind.preset.ts`: `tokens.css` のCSS変数名を型付きで再エクスポートする薄いファイル。Tailwindのビルドには使わないが、（a) Issueの完了条件の文言を満たす、(b) 将来 tokens.css 以外の場所（チャートの配色配列など、CSSでは表現しづらい場所）からトークンを型安全に参照する入口になる、という二つの役割を持たせる。tokens.css と値が乖離しないよう、値はハードコードせず `var(--color-xxx)` 文字列を返す関数にする。

生の hex はこの `tokens.css` の中だけに存在してよい唯一の場所とする。

## shadcn/ui

`npx shadcn@latest init` で `components.json` を生成し、`aliases.ui` を `@/design-system/ui`、`aliases.components` を `@/design-system/components` に向ける。CSS変数の参照先は `web/design-system/tokens/tokens.css` にする（`app/globals.css` は `@import` するだけにする）。

## lint: 生hex禁止

ESLint flat config（`eslint.config.mjs`）に、`no-restricted-syntax` で16進カラーリテラル（`/#[0-9a-fA-F]{3,4}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/`）を検出するルールを追加する。対象は `**/*.{ts,tsx}`、`web/design-system/tokens/**` は除外する（トークン定義の唯一の置き場所のため）。

## コミット前フック

Husky + lint-staged を**リポジトリ直下**に導入する（`.git` はリポジトリ直下にあるため、フック自体はどこにpackage.jsonがあっても直下に置く必要がある）。ステージされたファイルが `web/` 配下かどうかで、`web/`のtypecheck・lint・testを呼ぶか、`pipeline/scripts/`のtest（U0）を呼ぶかをlint-stagedの対象パターンで振り分ける。

**2026-08-17追記（Issue #11）**: データパイプライン一式（`scripts/`・`data/`・`package.json`・`tsconfig.json`・`vitest.config.ts`・`salary/`）を `pipeline/` 配下に移動した。これに伴い、リポジトリ直下の `package.json` は husky + lint-staged だけを持つ「Gitフック調整役」に縮小し、データパイプラインの実行時依存（tsx/vitest/typescript）は `pipeline/package.json` に移した（`web/` と `pipeline/` という2つの独立npmプロジェクトを横断してフックを振り分ける役目は、`.git` がある直下に残す必要があるため）。`pipeline/scripts/build-data.ts` の `ROOT` 解決はファイル位置基準のため無変更で動くが、`--out` 引数は `pipeline/` からの相対パスになった点に注意（次節で更新）。

## Cloudflare へのデプロイ（Workers Builds + 静的アセット）

接続作業自体はユーザーが実施した（アカウントアクセスが無いため）。デプロイ時に発生したエラーの原因調査と修正はこちらで行った。**現在 https://nenshu.fkmks-247.workers.dev/ で稼働中。**

**現在のCloudflareダッシュボードには「Framework preset」に相当する項目が既存プロジェクトの設定画面には無い。** プロジェクト作成時のウィザードにだけ出る選択肢で、いったんプロジェクトができた後は「ビルドコマンド」「デプロイコマンド」「バージョンコマンド」「ルートディレクトリ」を直接編集する形になっている（Cloudflare Pagesという別製品ではなく、Workers Builds に一本化されている）。

- ルートディレクトリ: `web`
- ビルドコマンド: `npm run build`（`next build`。`next.config.ts` の `output: 'export'` により `web/out/` に静的書き出しされる）
- デプロイコマンド: `npx wrangler deploy`
- バージョンコマンド: `npx wrangler versions upload`
- 上記はWorkerのデプロイコマンドなので、`web/wrangler.jsonc` で `assets.directory: "./out"` を指定し、コード無しの静的アセット配信用Workerとして構成する（`compatibility_date` は着手日、`not_found_handling: "404-page"` でNext.jsが生成する404ページを使う）。

**踏んだ罠**: プロジェクト作成時に汎用の「Next.js」相当のテンプレートが選ばれると、ビルドコマンドが自動で `npx opennextjs-cloudflare build`（Next.jsをフルSSRでCloudflare Workers上に動かすアダプタ）になる。これは `.next/standalone` を前提にするが、本プロジェクトは `output: 'export'` の純粋な静的書き出し（ADR-0002）のため `.next/standalone` が存在せず、`ENOENT: pages-manifest.json` で失敗する。ビルドコマンドを `npm run build` に戻し、`wrangler.jsonc` を静的アセット配信の設定にすることで解消する。

ADR-0001は「Cloudflare Pages」という表記だが、現在は同じ基盤が Workers（静的アセット配信）に統合されている。無料枠の商用利用可否・帯域無制限といったADR-0001の判断根拠は変わらない。

**踏んだ罠その2（npmバージョン差）**: `wrangler.jsonc` を追加した際、ローカル（npm 11.6.2）で `package-lock.json` を作り直して `npm ci` の通過も確認したが、Cloudflareのビルドログには `Detected the following tools from environment: npm@10.9.2` とあり、そちらでは `npm ci` が「`@emnapi/core`/`@emnapi/runtime` がロックファイルに無い」で失敗した。**同じ `package.json` でも、npmのメジャーバージョンが違うと optionalDependencies（今回は `sharp`/`rolldown` が依存する `@emnapi/*` 系のWASMフォールバック）の解決結果が変わり、生成される `package-lock.json` の中身が変わる。** ロックファイルは必ず `npx npm@10.9.2 install`（Cloudflareと同じバージョン）で作り直し、`npx npm@10.9.2 ci` が通ることまで確認してからコミットする。CLAUDE.md「開発上の約束」にも同じ内容を書いた。

## 2026-08-17追記（SSR移行、ADR-0004）

`docs/ranking/ssr-migration/`で、`output:'export'`（静的アセット配信）からCloudflare Workers上でのNext.jsフルSSR（`@opennextjs/cloudflare`）に切り替えた。これに伴い、Cloudflareダッシュボードのビルド/デプロイコマンドを次のとおり変更する必要がある（**ダッシュボードの更新はユーザーが実施する。アカウントアクセスが無いため**）。

- ビルドコマンド: `npm run build`（`next build`のみ）→ **`npx opennextjs-cloudflare build`**（`next build`を内部で実行したうえで`.open-next/`にCloudflare Workers用の成果物を生成する）
- デプロイコマンド: `npx wrangler deploy`（変更なし。ただし参照先は`wrangler.jsonc`の新しい`main`/`assets`設定になる）

これは上記の「踏んだ罠」で当時失敗した構成（自動検出される「Next.js」テンプレートのデフォルトビルドコマンド）に**意図的に戻す**変更である。当時失敗したのは`output:'export'`のままだったため（`.next/standalone`が存在せず`ENOENT: pages-manifest.json`）。今回は`next.config.ts`から`output:'export'`を削除したため、同じコマンドが正しく機能する。

**マージ順序に注意**: コード（`main`ブランチ）を先にマージし、そのあとダッシュボードのコマンドを更新する。逆順（ダッシュボードを先に変更）だと、まだ`output:'export'`のコードに対して`opennextjs-cloudflare build`が失敗する。コードを先にマージした場合、ダッシュボードが旧コマンドのままでも`next build`自体は成功するが、`npx wrangler deploy`が`.open-next/worker.js`（新しい`wrangler.jsonc`が要求するエントリーポイント）を見つけられずに失敗する。Cloudflareは通常ビルド失敗時に直前の成功バージョンを配信し続けるため、本番が即座に壊れることはない想定。

詳細は`docs/ranking/ssr-migration/design.md`参照。

## 2026-08-26追記（Astro へのカットオーバー、ADR-0014・F1・[#209](https://github.com/varmil/nenshu/issues/209)）

`docs/framework/astro-cutover/` で、Next.js ＋ `@opennextjs/cloudflare` から Astro（`@astrojs/cloudflare`）へ移した。**`next` も `@opennextjs/cloudflare` も依存から消えたので、いまのビルドコマンドはそのまま失敗する。**

**ダッシュボードの更新はユーザーが実施する（アカウントアクセスが無いため）。**

- ビルドコマンド: `npx opennextjs-cloudflare build` → **`npm run build`**（＝ `astro build`）
- デプロイコマンド: `npx wrangler deploy`（変更なし）
- バージョンコマンド: `npx wrangler versions upload`（変更なし）
- ルートディレクトリ: `web`（変更なし）

**`wrangler.jsonc` の `build.command` は消えた。** OpenNext が事前生成した結果をアセットへ写す工程で、`opennextjs-cloudflare deploy` を使っていないぶんを補うものだった。Astro は `astro build` の時点で `dist/client/` に HTML を並べるので、写す工程そのものが無い。

**`main` と `assets.directory` も書かなくなった。** `@astrojs/cloudflare` が `@astrojs/cloudflare/entrypoints/server` を差し込み、出力先は `@cloudflare/vite-plugin` が知っている。**書くとビルド前に「そのファイルが無い」で落ちる**（成果物を指すので鶏と卵になる）。

**マージ順序**: 2026-08-17 と同じで、**コード（`main`）を先にマージし、そのあとダッシュボードのコマンドを更新する。** 逆順だと、まだ Next.js のコードに対して `astro build` が走って失敗する。コードを先にマージした場合、ダッシュボードが旧コマンドのままだと `npx opennextjs-cloudflare build` が「そんなコマンドは無い」で失敗する。**どちらの向きでも、Cloudflare はビルド失敗時に直前の成功バージョンを配信し続けるので本番は落ちない**（更新が止まるだけ）。

詳細は `docs/framework/astro-cutover/design.md` 参照。

## データの再生成

`pipeline/scripts/build-data.ts` の `--out` 引数を使い、`web/public/data/` に出力し直す（`pipeline/` から実行する場合は `--out ../web/public/data`）。リポジトリ直下の暫定 `public/` は削除する。
