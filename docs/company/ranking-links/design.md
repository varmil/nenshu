# C20 ランキングへ戻る導線 — design.md

参照: `docs/company/spec.md` 1.24・AC-37, [plan.md](plan.md), Claude Design `企業詳細 ランキング導線.dc.html`（1b・1b PC）

## 出来上がり

```
div.max-w-5xl
├─ nav（パンくず）
├─ header
├─ div.md:grid（本文＋サイドバー）
├─ nav[aria-label=ランキング]          ← C20
│   ├─ h2  ランキングで比べる
│   └─ div  枠（border・rounded-lg）。md 以上は2列
│       ├─ a[href=/?ind=電気機器]   電気機器の平均年収ランキング / この会社は193社中6位   ›
│       └─ a[href=/]               全業種の平均年収ランキング / この会社は2,961社中84位 ›
└─ footer
```

- 行は1本ずつ `a` 全体がリンク。高さは最小 44px（`min-h-11`）
- 文言は `text-primary`・14px・600、順位は `text-muted-foreground`・12px・`tabular-nums`
- 2本目の区切り線は、モバイルが上辺（`border-t`）、PC が左辺（`md:border-l`）

## 構成

| 場所 | 中身 |
| --- | --- |
| `web/features/company/lib/rankingLinks.ts` | `buildRankingLinks(view, current)`。行き先は `industryPath()` と `/`。順位は `current`（表示中の基準）から取る |
| `web/features/company/components/RankingLinks.tsx` | 描画だけ。島の props には載せず、`CompanyDetail` が描画のたびに組み立てて渡す |
| `web/features/company/components/CompanyDetail.tsx` | 本文＋サイドバーの grid とフッタの間に置く |

## テスト

| 場所 | 固定すること |
| --- | --- |
| `lib/rankingLinks.test.ts` | 2本の順番・文言・順位の書式、行き先がパンくずと同じ文字列 |
| `e2e/company-refresh.spec.ts`「節の並び」 | h2 の並びの末尾が「ランキングで比べる」 |
| 同「AC-37」 | 置き場所（grid の次・フッタの前）、押すと業種で絞り込んだランキングが開く、PC 2列・390px 縦積み |
