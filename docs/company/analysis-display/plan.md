# C10 要約と分析の表示 — plan.md

参照: Issue [#242](https://github.com/varmil/nenshu/issues/242)（親: [#214](https://github.com/varmil/nenshu/issues/214)）, `docs/company/spec.md` 1.19・AC-28〜AC-30, [ADR-0015](../../adr/0015-company-analysis-subjectivity.md)
依存: [#241](https://github.com/varmil/nenshu/issues/241)（C9。全2,961社の生成は 2026-09-23 に完了）, [#799](https://github.com/varmil/nenshu/issues/799)（C11。サイドバーの「この会社の要点」を先に外した）

## Context

C9 が全2,961社ぶんの要約と分析を作った（`pipeline/data/company_analysis_2026.csv`）。これを
`/company/[id]` に2つの節として出す。見た目は Claude Design の `改善案.dc.html` のアートボード
8a（SP）・8b（PC）・8c（SP の分析の節・出典あり）。

**この Unit の要件の中心は、読者が2つを見分けられること**（AC-29・ADR-0015 決定5）。
もう1つの重さは量で、1社あたり約2.4KB の文章がある。島の props に載せると HTML の属性にも
同じ文章が入る（W2・C7 で固定の文言について2回踏んだ形）ので、props を通さない渡し方を先に
確かめる。

## 進め方

1. **デザインを読む。** `DesignSync` で `改善案.dc.html` を落とし、アートボード 8 だけを切り出して
   並び・寸法・文言・断りの置き方・出典の書式を拾う。注記に残っている論点（一言と本文の重複）も拾う
2. **データを作る。** `build-data.ts` に `analyses.json` の書き出しを足し、実測してから上限を置く。
   一言と本文の書き出しが同じ会社を数え、どこで直すかを決める（生成をやり直すか、取り込みで直すか）
3. **props を通さずに島へ差し込めるかを確かめる。** Astro の名前付きスロットで静的な HTML を
   渡し、dev サーバーの生の HTML で文章が1回ずつしか出ないこと、ハイドレーション後も節が残ることを
   見る。だめなら props で渡して増分を測る
4. **2つの節を描く。** 分析は平均年収カードの直後、要約は稼ぐ力の推移の後ろ
5. **/about に作り方の節を足す。** 分析の節からの導線の先
6. **テストを書く。** 純関数（対で落とす・出典の書式・一言の重複）は Unit テスト、並び・断り・出典・
   props に入らないこと・表示基準で変わらないこと・`/` に入らないことは E2E
7. **検証。** lint・typecheck・vitest（web・pipeline）、E2E 全件、`npm run build`。`/company/6861` の
   HTML を前後で測る
8. **docs を直す。** design.md、spec 1.19 の未決事項（置き場所・`rel`・リンク切れ）、overview、CLAUDE.md
