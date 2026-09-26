# C16 実測値の4項目を年収に関するQ&Aに — design.md

参照: Issue [#838](https://github.com/varmil/nenshu/issues/838)（親: [#836](https://github.com/varmil/nenshu/issues/836)）, `docs/company/spec.md` 1.22・AC-34・1.17・1.20・1.21・AC-17・AC-31・AC-32, `docs/site-chrome/spec.md` 4.4・5.1
依存: なし（C13・#814 の帯と C10・#242 の要約の位置を前提にする。どちらも実装済み）

## 出来上がり

`/company/[id]` の本文（左の列）の並び。**動いたのは実測値の節だけ**で、作り替えたうえで要約の直後へ移した
（Claude Design `Company Actuals QA.dc.html` の 1b・1d）。

```
変更前（C15）                               変更後（C16）
① 平均年収カード                            ① 平均年収カード
② 公開資料による全体像（レーダー）          ② 〃
③ {社名}の現状と今後（AI 分析）              ③ 〃
④ 残業・有給・男女の賃金の差異              ④ 〃
⑤ 年齢別の推定年収                          ⑤ 〃
⑥ 有価証券報告書の実測値（2026年3月期）     ⑥ 平均年収推移（過去10年間）
⑦ 平均年収推移（過去10年間）                ⑦ 稼ぐ力の推移（過去10年間）
⑧ 稼ぐ力の推移（過去10年間）                ⑧ {社名}の有価証券報告書の要約
⑨ {社名}の有価証券報告書の要約              ⑨ {社名}の年収に関するQ&A ＋ EDINET の帯
⑩ このページの出典                          ⑩ このページの出典
```

節の中身。

```
section[data-testid=company-qa]
├─ h2  株式会社キーエンスの年収に関するQ&A
├─ p   2026年3月期の有価証券報告書の値です。提出会社（単体）のもので、連結子会社の従業員は入りません。
└─ div
   ├─ div[data-testid=company-qa-list]   枠。上の角だけ丸め、行の間に罫線
   │   └─ div × 4                         grid（24px ｜ 残り）
   │       ├─ span「Q」（aria-hidden）  h3  株式会社キーエンスの平均年収はいくらですか？
   │       └─ span「A」（aria-hidden）  p   株式会社キーエンスの平均年収は<strong>2,178万円</strong>です。
   └─ a[data-testid=company-filing]       EDINET の帯（C13 の FilingLink）。下の角を持つ
```

4問は 平均年収 → 平均年齢 → 平均勤続年数 → 従業員数。従業員数の回答だけ末尾が
`です（提出会社単体。連結子会社の従業員は含みません）。` になる。文言の全体は spec 1.22 の表。

## 構成

| 場所 | 中身 |
| --- | --- |
| `web/features/company/lib/actualsQa.ts` | `buildActualsQa(view, fiscalPeriod)` が見出し・説明・4問を返す純粋関数。回答は `{ before, value, after }` の3つに割って持つ（値だけを太字にするため。つなげると1文） |
| `web/features/company/components/ActualsQaSection.tsx` | 上の木を描く。**状態を持たない**。下辺に `FilingLink` を置く |
| `web/src/pages/company/[id].astro` | `buildActualsQa` を呼び、`<ActualsQaSection slot="qa">` で島に差し込む。書類 ID は `companyFilingDocId(id)` から取り、帯と「このページの出典」の2か所に渡す |
| `web/features/company/components/CompanyDetailIsland.tsx`・`CompanyDetail.tsx` | `qa` スロットを受け、要約（`digest`）と出典（`sources`）の間に置く。実測値の節と `filingDocId` の prop を外した |
| `web/features/company/lib/pageData.ts` | `CompanyPageData` から `filingDocId` を外し、`companyFilingDocId(id)` を足した |
| `web/features/company/lib/highlights.ts` | C4 の地の文 `buildActualsSummary` を外した（4つの回答がそれぞれ1文になったので） |
| `web/lib/seo/jsonLd.ts` | 変えていない。`FAQPage` を出さない理由をコメントに足した |

データの流れ（すべてビルド時）。

```
[id].astro
  companyPageData(id) ──────────────→ data ─→ CompanyDetailIsland（client:load）─→ CompanyDetail
  buildActualsQa(data.view, data.fiscalPeriod) ─┐
  companyFilingDocId(id) ───────────────────────┼─→ ActualsQaSection（slot="qa"・静的な HTML）
                                                └─→ buildSourceRows ─→ SourcesSection（slot="sources"）
```

## 決めたこと

- **島の外で描く。** 中身は表示基準でも年齢でも変わらないので、C10 の2節・C12 の出典と同じく名前付き
  スロットで静的な HTML として差し込む。置き場所（要約と出典の間）も両隣がスロットなので、並びは
  `CompanyDetail` が3つのスロットを続けて置くだけになる。**書類 ID が島の props から外れた**——使うのは
  島の外の2か所（帯・出典の節）だけになったため。Q&A の部品もクライアントの JS に入らない
- **文言は1つの純粋関数から組む。** 画面と Unit テストが同じ関数を見る。`FAQPage` を後で足すなら同じ
  配列から出す（画面と別に組むと、片方だけ直したときに食い違う）
- **質問は h3、回答はその直後の `p`。** 節の h2 の下に問いが見出しとして並ぶので、見出しで辿れ、
  文書の構造として問いと答えの対が読める。`dl`（`dt`/`dd`）にしなかったのは、問いを見出しとして
  読ませたいから
- **「Q」「A」の字は `aria-hidden`。** 問いが見出し、答えがその直後の段落という並びが同じことを
  伝えているので、読み上げでは重ねない
- **太字は回答の値だけ。値は折り返さない**（`whitespace-nowrap`）。390px では回答が2〜3行になり、何も
  しないと `38.8` / `歳`、`293` / `人` のように数字と単位が行をまたいでいた（ジャストシステム 4686 で
  実測）。値は長くても `12,345人` ほどなので、折り返しを止めてもはみ出さない
- **字の大きさと余白はモック 1b のまま。** 質問・回答とも 14px、行の余白は上下 14px・左右 16px、
  「Q」「A」の列は 24px。質問は太字（600）、回答は通常の太さ
- **決算期は説明の1行の先頭。** 見出しからここへ移った（`有価証券報告書の実測値（2026年3月期）` →
  `2026年3月期の有価証券報告書の値です。…`）。要約の節の説明（`2026年3月期の有価証券報告書のうち…`）と
  合わせて企業詳細で2か所のまま。**要約の直後に来たので2つは隣り合う節の先頭に出る**が、どちらも
  自分の節の中身の時点を言っているので両方残した（`docs/site-chrome/spec.md` 5.1）
- **FAQPage の JSON-LD は出さない**（運営者の判断）。1b の注記は出す案だったが、Google は 2026-05-07 に
  FAQ のリッチリザルトを終了しており（[FAQ structured data のドキュメント](https://developers.google.com/search/docs/appearance/structured-data/faqpage)の廃止の告知）、`potentialAction` を出さないのと
  同じ扱いにした。出していれば `/company/[id]` の HTML がさらに1社あたり約1KB 増えていた
- **作り替えで外したもの。** C4 の地の文（`有価証券報告書によると、…です。`）と C1 の4セルの表。
  どちらも同じ4つの数字を言っており、4つの回答がそれぞれ1文になったので役目が重なる

**モックから変えたところは無い。** 値の折り返しを止めたのは、モックが 684px の幅でしか描いておらず、
390px で折れることが見えていなかったため。

## 実測値

`astro build` の成果物（gzip は `gzip -9`）。

| | 変更前 | 変更後 | 差 |
| --- | --- | --- | --- |
| `/company/6861` raw / gzip | 145,226 B / 20,775 B | 146,635 B / 20,840 B | +1,409 B / +65 B |
| `/company/4686` raw / gzip | 146,361 B / 21,000 B | 147,844 B / 21,054 B | +1,483 B / +54 B |
| `/company/7203` raw / gzip | 148,370 B / 22,001 B | 149,803 B / 22,245 B | +1,433 B / +244 B |
| `/company/8058` raw / gzip | 151,452 B / 22,515 B | 152,838 B / 22,633 B | +1,386 B / +118 B |
| `/company/7488` raw / gzip | 143,994 B / 21,268 B | 145,359 B / 21,312 B | +1,365 B / +44 B |
| `/`（`wrangler dev` の応答） | 247,097 B | 247,097 B | ±0 |

**増えたのはほぼ節そのもの。** 6861 で節の HTML は 2,715 B → 4,136 B（+1,421 B）。うち文字が
467 B → 842 B（社名を質問と回答で8回書くぶん）、残りは4問ぶんの器の `class`。島の props から書類 ID が
外れたぶんと、スロットの包み（`astro-slot`）が1つ増えたぶんはほぼ相殺している。**`/` は変わらない**
——企業詳細のコンポーネントを import していない。

dev サーバーで節の上端（ページの先頭から）と高さを測った。

| | 1280×800 変更前 | 1280×800 変更後 | 390×844 変更前 | 390×844 変更後 |
| --- | --- | --- | --- | --- |
| 6861 節の上端 | 2,982px | 4,780px | 3,543px | 5,474px |
| 6861 節の高さ | 222px | 439px | 311px | 626px |
| 4686 節の高さ | 222px | 439px | 311px | 654px |
| 6861 ページの高さ | 5,339px | 5,556px | 6,985px | 7,300px |

**節は約2倍の高さになる**（PC +217px、390px +315〜343px）。4問を開いたまま並べたぶんで、折りたたむ案
（1c）を採らなかった代償になる。ページの末尾に移したので、上の節の位置は下がらない（推移の2節は
実測値の節のぶんだけ上がった）。

## 固定しているもの

- **Unit テスト**（`features/company/lib/actualsQa.test.ts`）——キーエンスの見出し・説明・4問の質問と
  回答を文全体の一致で。値が数字だけで前後の地の文を含まないこと。4月期のヤガミ（7488）で決算期が
  その会社の値になり、説明の1行にだけ入ること
- **E2E**（`e2e/company-refresh.spec.ts`）——
  - AC-34: 4問が h3 としてこの順に並び、回答が開いたまま見え、太字が値だけ。「推定」が無く、
    「有価証券報告書の実測値」の見出しが無い
  - AC-34: 390px で回答の値が1行に収まる（4686・6861。`strong` の `getClientRects()` が1つ）。
    **`whitespace-nowrap` を外すと落ちることを確かめた**
  - 節の並び: h2 の並び全体（要約の直後・出典の直前）
  - 横スクロール: 既存の AC-15 のループ（375px・6861 / 9413 / 8031）
- **E2E**（`e2e/company-page.spec.ts`）——AC-10: JS 実行前の HTML に見出し・4問・回答の書き出しと値・
  従業員数の断りがある。AC-3: 表示基準と年齢を切り替えても Q&A の中身が1文字も変わらない
- **E2E**（`e2e/company-filing.spec.ts`）——AC-31: 帯の上辺が4問の枠の下辺に接し、左右がそろう
- **E2E**（`e2e/data-period.spec.ts`）——企業詳細の決算期は2回で、Q&A の説明と要約の説明にある
  （6861・7488）
- **E2E**（`e2e/social.spec.ts`）——`/company/[id]` の JSON-LD は `BreadcrumbList` の1件だけで、
  `FAQPage` の文字列が HTML に無い
