# ADR-0002 Next.js の静的書き出し＋shadcn/ui を採用する

状態: Accepted
日付: 2026-08-16

## 文脈

作るのは1,867社のランキングを絞り込んで読ませるサイト。データはビルド時に確定し、実行時に変わらない。

自然検索が North Star KPI（`docs/ranking/intent.md`）なので、初期表示のHTMLに中身が入っている必要がある。

Bolt 2 以降で企業詳細1,867ページ・業種33ページ・年齢別8ページの静的生成に広げる予定がある。MVP がその拡張を塞がない形であること。

開発は1名＋AIエージェントで進める。参照できる実装例の多さが速度に直結する。

## 決定

**Next.js 15（App Router）を `output: 'export'` で使い、UI は shadcn/ui + Tailwind CSS で組む。TypeScript。**

データはビルド時に CSV から JSON へ変換して同梱する。データベースも API も持たない。

## 理由

`output: 'export'` は完全な静的HTMLを吐くため、ADR-0001 の Cloudflare Pages にそのまま載る。Vercel 固有の機能を使わないので、ホスティングの移動が可能な状態を保てる。

`generateStaticParams` で1,900ページ規模の事前生成が素直に書ける。Bolt 2 の拡張が同じ枠組みの中に収まる。

shadcn/ui はコンポーネントをコピーして自分のリポジトリに置く方式なので、依存が増えず、後から自由に手を入れられる。テーブル・セレクト・入力といった今回必要な部品が揃っている。Next.js との組み合わせは実装例が多く、エージェントに書かせたときの精度が上がる。

## 結果

- ディレクトリ構成は AI-DLC リファレンスに従う。`web/design-system/tokens/`（CSS変数）、`web/design-system/ui/`（shadcn プリミティブ）、`web/design-system/components/`（合成物）、`web/features/ranking/components/`（施策固有UI）。
- 色は `tokens.css` の CSS 変数のみを使う。生の hex を書けない状態を lint で強制する。
- レジストリ外のコンポーネントを新規に作る場合は Issue を起票する。
- 画像最適化（`next/image`）は静的書き出しで制限があるため、使う場合は unoptimized 前提で設計する。
- サーバーコンポーネントでのデータ取得や Route Handlers は使えない。データはすべてビルド時に確定させる。

## 却下案

**Astro + React アイランド** — 出力するJSは小さくなり、静的サイトとしての適合度は高い。ただし shadcn のテーブル周りの実装例が Next.js より少なく、エージェントに書かせたときの手戻りが読めない。ページ数が1,900規模に増えたときのビルド設計の情報も薄い。MVP の速度を優先して見送る。

**素の Vite + React SPA** — 初期表示がクライアント描画になり、SEO が North Star KPI である以上そこを落とせない。

**Next.js をサーバーモードで動かす** — サーバーが要る要件がない。ADR-0001 のホスティング判断とも合わない。
