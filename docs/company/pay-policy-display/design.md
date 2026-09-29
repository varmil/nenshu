# C19 給与の決定方針の表示 — design.md

参照: Issue [#852](https://github.com/varmil/nenshu/issues/852)（親: [#850](https://github.com/varmil/nenshu/issues/850)）, `docs/company/spec.md` 1.23・1.15・AC-36・AC-16, `docs/site-chrome/spec.md` 5.1, [plan.md](plan.md), [C18 の design.md](../pay-policy-text/design.md)
依存: #851（C18。マージ済み）

## 出来上がり

`/company/[id]` の本文（左の列）の並び。**足したのは要約と Q&A の間の1節だけ**（Claude Design `C19 給与の決定方針.dc.html` の 1a）。

```
① 平均年収カード
② 公開資料による全体像（レーダー）
③ {社名}の現状と今後（AI 分析）
④ 残業・有給・男女の賃金の差異
⑤ 年齢別の推定年収
⑥ 平均年収推移（過去10年間）
⑦ 在籍年数推移（過去10年間）
⑧ 稼ぐ力の推移（過去10年間）
⑨ {社名}の有価証券報告書の要約
⑩ {社名}の給与の決定方針 ＋ EDINET の帯      ← C19
⑪ {社名}の年収に関するQ&A ＋ EDINET の帯
⑫ このページの出典                          ← 先頭に区分「原文」
```

節の中身。

```
section[data-testid=company-pay-policy]
├─ h2  トヨタ自動車株式会社の給与の決定方針
├─ p   有価証券報告書に会社が書いた方針です。要約も言い換えもせず、原文のまま載せています。 a「抜き出し方」→ /about#pay-policy
└─ div
   ├─ blockquote[cite=EDINET の書類]         枠。上の角だけ丸める
   │   ├─ p   「人材戦略に関する基本方針等」から          出どころの節（11px・muted）
   │   ├─ p[data-pay-title]  ②従業員の給与その他の…方針   会社の小見出し（14px・600）
   │   ├─ 塊 × n  [data-pay-block=para|heading|table|image]  開いておく部分
   │   └─ details（1,000字を超える80社だけ）
   │       ├─ summary  ⌄ 続きを読む（残り2,104字）
   │       └─ 塊 × m                                        畳む部分
   └─ a[data-testid=company-pay-policy-filing]   EDINET の帯（C13 の FilingLink）。下の角を持つ
```

| 塊 | 描き方 |
| --- | --- |
| `para` | `p`。14px・行間1.8。段落の中の改行は残す（`whitespace-pre-line`） |
| `heading` | `p`。本文と同じ大きさで太さだけ500。**見出し要素にしない** |
| `table` | design-system の `Table`。行はすべて `td`。結合したセルは `colSpan`・`rowSpan` で原文どおりに結合する。字のあるセルに5字ぶんの最小幅を持たせ、収まらなければ表の器の中で横に送る |
| `image` | `（図は省略しています）`（12px・muted） |

本文の無い会社（改正前の様式の1,036社と、給与の決定方針が空の63社）には、節も帯も無い。

「このページの出典」の先頭の行。

| 区分 | 該当するもの | 出典 |
| --- | --- | --- |
| 原文 | 給与の決定方針 | 有価証券報告書（EDINET の書類へのリンク）の本文をそのまま（どこまでが給与の決定方針かは生成AIが判定） |

## 構成

| 場所 | 中身 |
| --- | --- |
| `pipeline/scripts/lib/payPolicy.ts` | `toPayPolicyRecord(row)`。C18 の1行を表示の形（`source`・`title`・`blocks`）にする。**文は変えない。** 落とすのは範囲の番号などの鍵と画像の代替テキストだけ。形が崩れていたら例外 |
| `pipeline/scripts/build-data.ts` | `buildPayPolicies` が `pay_policy.json` を EDINETコードで引き、`companies.rows` の ID で `pay-policies.json` を書く。書類 ID がいまの採用書類と違えば落とす（C18 を回し直す合図）。gzip の上限 700KB |
| `web/public/data/pay-policies.json` | `{ byId: { [企業ID]: { source, title, blocks } } }`。**本文のある1,862社だけ**。raw 2,567,771 B・gzip 591,235 B |
| `web/features/company/lib/payPolicy.ts` | `buildPayPolicyView(name, record)` が見出し・出どころの節の名前・会社の小見出し・開く塊・畳む塊・畳んだ字数を返す純粋関数。本文が無ければ `null` |
| `web/features/company/components/PayPolicySection.tsx` | 上の木を描く。**状態を持たない**（畳みはブラウザの `details`） |
| `web/features/company/lib/pageData.ts` | `companyPayPolicyFor(id, name)`。`pay-policies.json` を読み、`buildPayPolicyView` を通す |
| `web/src/pages/company/[id].astro` | 本文があれば `<PayPolicySection slot="payPolicy">` を島に差し込み、有無を `buildSourceRows` に渡す |
| `web/features/company/components/CompanyDetailIsland.tsx`・`CompanyDetail.tsx` | `payPolicy` スロットを受け、`digest` と `qa` の間に置く |
| `web/features/company/components/FilingLink.tsx` | `testId` を受けるようにした。Q&A の帯（`company-filing`）と並ぶので、こちらは `company-pay-policy-filing` |
| `web/features/company/lib/sources.ts` | 区分 `original`（「原文」）。`PagePresence.payPolicy` が真のときだけ先頭に足す |
| `web/features/about/components/AboutPage.tsx` | 「給与の決定方針の抜き出し方」（`id="pay-policy"`）。社数は `pay-policies.json` から数える |

データの流れ（すべてビルド時）。

```
pipeline/data/pay_policy.json（C18）
  → build-data.ts  toPayPolicyRecord → web/public/data/pay-policies.json
[id].astro
  companyPayPolicyFor(id, name) ─┬─→ PayPolicySection（slot="payPolicy"・静的な HTML）
                                 └─→ 有無 → buildSourceRows → SourcesSection（slot="sources"）
AboutPage.tsx
  pay-policies.json の社数 → 「給与の決定方針の抜き出し方」
```

**`pay-policies.json` はクライアントにも Worker にも届かない。** 読むのは事前生成する `/company/[id]` と `/about` だけで、`dist/server` に入るのはアセットの一覧のパス1行だけ（中身の文字列は0件）。`/` からは読まない。

## 決めたこと

- **島の外で描く。** 中身は表示基準でも年齢でも変わらないので、C10 の2節・C12 の出典・C16 の Q&A と同じく名前付きスロットで静的な HTML として差し込む。props で渡すと、最長3,140字の本文が HTML の属性と本文の2か所に入る
- **見出しは `{社名}の給与の決定方針`**（運営者の判断。デザインの「給与・賞与の決定方針」は採らない——開示府令の項目の名前に合わせる）
- **会社が付けた小見出しは引用の先頭に残す**（運営者の判断。デザインどおり）。どの項目の原文かと、抜き出した範囲の始まりが読める。本文の `heading` より一段太い600
- **出どころの節の名前は開示府令の項目名で書く。** 会社によって「人財戦略」と書くが、どの会社の枠にも同じ名前が出るほうが「同じ項目から取った」ことが読める。参照先から取った会社は「サステナビリティに関する考え方及び取組」（101社）・「従業員の状況」（1社）
- **節の中に「生成AI」「推定」の語と決算期を置かない。** 文そのものを AI が書いたように読めるので、範囲の判定に生成AIを使ったことは出典の行と `/about` が言う。決算期は企業詳細で2か所（Q&A の説明・要約の説明）と決まっている（`docs/site-chrome/spec.md` 5.1）
- **`heading` を見出し要素にしない。** C18 の `heading` は「句点で終わらない短い行」で、箇条書きの1項目や言いさしも入る（1,728個のうち112個がひらがなや読点で終わる）。h3 にすると、それが文書の見出しとして並ぶ
- **1,000字を超える会社（80社）だけ畳む。先頭は400字に届くまで塊の単位で開き、小見出しで終わらせない。** 1,000字は 390px で縦に約1,000px。開いている部分は80社で中央値466字・最大938字で、75%点の会社（509字）がまるごと見える量にそろう。小見出しで切ると、その中身だけが「続きを読む」の向こうに行く。畳む部分が空になるなら畳まない
- **畳みはブラウザの `details`。** JS が要らないので島の外に置ける。**全文は初期 HTML にある**——閉じた `details` の中身も文書にあり、検索エンジンも JS を実行しない読者も読める。残りの字数は空白を除いて数える（C18 が字数を数えたのと同じ規則）
- **表は表のまま、行はすべて `td`。** どの行が見出しかは原文から決まらない。**字のあるセルに5字ぶんの最小幅**——持たせないと表は器の幅に縮もうとして、6列の表（コニシ 4956）が 390px で1字ずつ縦に折れた（「※所定内賃金」が6行）。**字の無いセルには付けない**——字下げの列（ソニーグループの株式報酬の内訳。原文では24px）に使われていて、5字ぶん取ると 390px で本文の列が細る。収まらない表は器の中で横に送る（文書は横にはみ出さない）
- **結合したセルは原文どおりに結合する**（`cellSpan` が `spans` から `colSpan`・`rowSpan` を引く）。公開後の指摘（2026-09-28）で足した——結合を読まずに描いていたので、ソニーグループ（6758）の報酬の表で株式報酬の内訳の行だけが1列右へずれていた。本文に入っている71の表のうち8社の表が結合を持ち、結合を入れると71とも各行が同じ列数を占める（Unit テストが全件で見ている）
- **画像は出さない。** 有報の HTML の代替テキストは空かファイル名（`0104010_004.png`）で、読める文字が無い。図は下辺の帯から開く有報で見られる
- **下辺に EDINET の帯。** Q&A の帯と同じ書類（平均年間給与を取った書類＝C18 が節を読んだ書類）を開く。`blockquote` の `cite` も同じ URL

**モックから変えたところ。** 見出しの文言（上）、節の説明に `/about` への導線を足したこと（spec 1.23）、表のセルの最小幅（モックは表を描いていない）。

## 実測値

`astro build` の成果物（gzip は `gzip -9`）。

| | 変更前 | 変更後 | 差 |
| --- | --- | --- | --- |
| `/company/7203` raw / gzip | 166,618 B / 23,317 B | 169,733 B / 23,736 B | +3,115 B / +419 B |
| `/company/3032`（畳む） | 165,057 B / 22,954 B | 179,998 B / 26,396 B | +14,941 B / +3,442 B |
| `/company/9024`（最長3,140字） | 169,480 B / 22,892 B | 186,293 B / 26,557 B | +16,813 B / +3,665 B |
| `/company/9433`（サステナビリティ） | 171,000 B / 23,974 B | 175,728 B / 25,148 B | +4,728 B / +1,174 B |
| `/company/4452`（空） | 164,707 B / 22,391 B | 164,760 B / 22,417 B | +53 B / +26 B |
| `/company/9501`（空） | 168,734 B / 22,855 B | 168,787 B / 22,881 B | +53 B / +26 B |
| `/company/6861`（改正前の様式） | 163,950 B / 21,924 B | 164,003 B / 21,950 B | +53 B / +26 B |
| `/`（`wrangler dev` の応答） | 247,098 B | 247,098 B | ±0 |

**節の無い会社の +53 B は空のスロットの器**（`<template data-astro-template="payPolicy"></template>`）。Astro は `{cond && <X slot="…"/>}` が偽でもスロットの名前を島に渡し、React の側で描かれなかったスロットを空の `template` として書く。島を2通りに書き分ければ消せるが、53 B のために同じ島の呼び出しを2つ持つことはしない。

節の高さ（`wrangler dev` に対して測った）。

| | 1280×800 | 390×844 |
| --- | --- | --- |
| 7203（1段落） | 249px | 319px |
| 9433（サステナビリティ） | 561px | 933px |
| 3032（畳む。開いているのは先頭） | 710px | 981px |
| 8058（図を含む） | 809px | 1,207px |
| 4956（6列の表を2つ） | 930px | 1,328px |

**「このページの出典」は7区分の会社で PC 290px・390px 488px。** C12 の E2E が見ている線（作り替える前の3ステップ。PC 260px・モバイル 580px）を PC では超える。区分を1つ足したぶんで、区分ごとの行は変えていない。E2E の線はキーエンス（6区分）で見ている。

## 固定しているもの

- **Unit テスト**
  - `pipeline/scripts/lib/payPolicy.test.ts`——文を変えずに画面が使う鍵だけにすること、画像の代替テキストを落とすこと、本文の無い会社が `null`、崩れた形で落ちること
  - `pipeline/scripts/build-data.test.ts`——`pay-policies.json` が本文のある会社ちょうどを持ち、塊が C18 の成果物と一致すること。トヨタの記録全体・KDDI の出どころ・東電と花王が無いこと
  - `web/features/company/lib/payPolicy.test.ts`——トヨタの見せ方全体、畳む規則（1,000字・400字・小見出しで終わらない・畳む部分が空なら畳まない）、**全社で開く部分と畳む部分をつなぐと元の塊に戻り、畳むのがちょうど80社**。**全社の表（71個）で、結合を入れると各行が同じ列数を占める**（結合を読まないと8社の表でそろわない）
  - `web/features/company/lib/sources.test.ts`——区分「原文」が本文のある会社でだけ先頭に来ること
- **E2E**（`e2e/company-pay-policy.spec.ts`）——AC-36
  - トヨタ: 要約と Q&A の間に節があり、会社の小見出し・原文・出どころの節の名前・`/about#pay-policy` への導線がある。決算期・「推定」・「生成AI」が無い。帯と `cite` が Q&A の帯と同じ書類
  - 6501・4956・6758・8058: 塊の並びと文字列と結合がデータと一致する（本文を書き写さず `/data/pay-policies.json` と突き合わせる）。図は省いたと断る
  - 6758: 結合したセルのある表で、どの行も最後のセルが表の右端まで届く。**結合を外すと 225px のずれで落ちることを確かめた**
  - 4956: 390px で字のある表のセルが3字幅以上ある（1字幅に潰れない）。**最小幅を外すと落ちることを確かめた**
  - 9433: 出どころがサステナビリティの節になる
  - 4452・9501: 節も見出しも帯も無い
  - 表示基準と年齢を切り替えても節の文字が変わらない
  - 出典の一覧の先頭が「原文」で、生成AIが範囲を判定したことが読める
  - 3032: `details` が1つで閉じており、残りの字数を添える。開くと畳んだ塊が見える。JS を止めても全文が HTML にある
- **E2E**（既存のループと配列に足した）——横スクロール（`company-refresh.spec.ts` の AC-15 の 375px に 7203・3032・4956）、JS 実行前の HTML と `/` に入らないこと（`company-page.spec.ts` の AC-10）、`/about` の抜き出し方の節（同）
