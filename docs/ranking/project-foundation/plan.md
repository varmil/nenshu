# U1 プロジェクト基盤とデザイントークン — Unit実行プラン

`docs/AI-DLC実践リファレンス_v10.pdf` p.8/p.13 の形式に合わせる。ここには**段取り**だけを書く。技術選定の理由・内部構造は `docs/ranking/project-foundation/design.md` に委ねる。

## 参照

- Issue #2（完了条件の正）
- `docs/adr/0001-hosting-cloudflare-pages.md`, `docs/adr/0002-stack-nextjs-static-export.md`
- `CLAUDE.md`「エージェントが従う優先順位」「Unit完了後の運用」

## 事前確認・確定事項

- Issue #2 の完了条件を取得済み: Next.js 15（App Router / `output: 'export'`）、`web/design-system/tokens/tokens.css`、`tailwind.preset.ts`、shadcn/ui 導入（`web/design-system/ui/`）、生hex禁止のlint、コミット前の型チェック・テスト強制、push で Cloudflare Pages 更新、`.gitignore` の確認。非対象はランキングの実装（中身は空でよい）。
- **Tailwind のバージョンをユーザーに確認し、v4（CSSの `@theme` でトークンをマッピングする現行デフォルト）で確定済み。** `tailwind.preset.ts` はIssueの文言通り作成するが、v3の `presets` 読み込みではなく、トークンの型付き参照用ファイルとして位置づける。実質的なテーマ写像は `tokens.css` の `@theme` が担う。詳細は design.md に書く。
- **Cloudflare Pages への接続はユーザー側の手動操作が必要。** Cloudflareアカウントへのアクセス・ブラウザでのGitHub連携が私には無いため、このUnitでは「pushすれば更新される状態」を作るところ（ビルド設定の確定・手順書の作成）までとし、実際のダッシュボード操作はユーザーに委ねる。
- `docs/ranking/data-pipeline/design.md` で U0 が残した宿題（`public/data/` はリポジトリ直下の暫定配置）をこのUnitで解消する。`web/public/data/` に移す。

## 段取り

1. `docs/ranking/project-foundation/design.md` を書く（ディレクトリ構成・Tailwind v4でのトークン設計・shadcn設定・lint/hooksの実装方法・Cloudflare Pagesのビルド設定）。
2. `web/` に Next.js 15（App Router・TypeScript・`output: 'export'`）を作成する。
3. `web/design-system/tokens/tokens.css` に色・余白・タイポ・角丸・影のCSS変数を定義し、`@theme` でTailwindのテーマへ写像する。`tailwind.preset.ts` も作成する。
4. shadcn/ui を導入し、プリミティブの出力先を `web/design-system/ui/` に向ける。
5. `web/design-system/components/`・`inventory.md`・`design-system.md` の器を作る（中身は最小限）。
6. 生の hex を書くと落ちる ESLint ルールを追加する。
7. Husky + lint-staged で、コミット前に型チェック・lint・テストを強制する。
8. `pipeline/data/ranking_unified_2026.csv` から `web/public/data/` へデータを再生成し、リポジトリ直下の暫定 `public/` を削除する。
9. `npm run build`（`web/`）が `output: 'export'` で通ることを確認する。
10. Cloudflare Pages のビルド設定（ルートディレクトリ・ビルドコマンド・出力ディレクトリ）を手順としてまとめ、ユーザーに接続してもらう。
11. Issue #2 の完了条件を一つずつ確認する。

## 依存

なし（`docs/ranking/overview.md` の通り、U1は他Unitに依存しない）。U0で確定した `pipeline/scripts/build-data.ts` の `--out` 引数をそのまま使う。

## リスク

- Tailwind v4 は JS プリセット読み込みを前提としないため、「`tailwind.preset.ts` がテーマへ写像している」というIssueの文言と実装がズレて見える可能性がある。design.md で `tailwind.preset.ts` の役割を明記し、Issueの意図（トークンとTailwindテーマの対応が単一の場所で追える）を満たすことを優先する。
- shadcn CLI のプリミティブ出力先をデフォルトの `components/ui/` から `design-system/ui/` に変更する設定が必要。`components.json` の `aliases` で対応できるか手順3で確認する。
- Cloudflare Pages の接続は私の手が届かない範囲。手順10はユーザーへの引き継ぎになる。

## この後

承認後、まず `docs/ranking/project-foundation/plan.md` にこの内容を保存し、続けて design.md を書いてから実装に入る。実装完了後は `CLAUDE.md`「Unit完了後の運用」に従い、動作チェック → Issue #2 に紐づけたPR → 問題なければマージする。
