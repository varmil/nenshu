# 現在地: 全体の経緯と Unit の順序

> CLAUDE.md の「現在地」節から移した（2026-10-07・トークン消費の削減。移しただけで、本文は1字も書き換えていない）。
> 文中の「上の」「下の」は、CLAUDE.md の「現在地」に並んでいた当時の位置を指す。対応する項は `docs/status/` のどれかにある（索引は CLAUDE.md）。
> **新しく分かったことはここに書く。CLAUDE.md には書かない**（CLAUDE.md は全セッション・全サブエージェントが毎回読むので、伸ばすとそのまま消費量になる）。

**Bolt 1（MVP: ランキング1ページ＋計算方法ページ）の全Unit U0〜U7が実装済み。** U0（データ変換パイプライン、`docs/ranking/data-pipeline/`、Issue #1）・U1（プロジェクト基盤とデザイントークン、`docs/ranking/project-foundation/`、Issue #2）・U2（ランキング表と年齢スイッチ、`docs/ranking/ranking-table/`、Issue #3）・U3（フィルタ4種、`docs/ranking/ranking-filters/`、Issue #4）・U4（フリーワード検索、`docs/ranking/free-word-search/`、Issue #5）・U5（URLクエリとの同期、`docs/ranking/url-sync/`、Issue #6）・U6（0件・端の状態とページネーション、`docs/ranking/ranking-pagination/`、Issue #7）・U7（計算方法ページ`/about`、`docs/ranking/about-page/`、Issue #8）。

**Bolt 2 に着手中（企業詳細ページと公開URL戦略）。Inceptionは完了。**

順序: C0（#51）→ C1（#52）→ U11（#71）→ U12（#80）→ C2（#83）→ **U13（#88）** → **C3（#89）** → **U8（#53）** → **U14（#121）** → **U15（#132）** → **S3（#134）** → **U16（#135）** → **C4（#146）** → **S4（#163）** → **S2（#116）**。**U8 のリンクハブは U12 の業種チップで賄えたので、U8 の範囲は canonical・sitemap・robots に狭めた**（`docs/ranking/overview.md`）。**U8 は実装済み**（`docs/ranking/search-discovery/`）。
