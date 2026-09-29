# design.md — D9 提出が途切れた会社のページ

Issue: [#879](https://github.com/varmil/nenshu/issues/879)
spec: `docs/refresh/spec.md` 1.3・1.16・AC-7（ページの側） ／ 段取り: `plan.md` ／ ADR: `docs/adr/0018-universe-entry-exit.md` ／ 触る Unit: C1〜C20（`docs/company/`）・U8（sitemap）

最後の有報から24か月を過ぎた会社（ADR-0018）は、ランキングと母集団（順位・偏差値・母集団の統計）から外れる。**企業ページ `/company/[id]` は残し**、最後の有報の決算期と、提出が途切れていることを社名の直下で断る。順位・偏差値は出さない。

**いまのデータに外れた会社はいない。** 台帳でいちばん古い提出日は 2025-08-26 で、最初に外れうるのは 2027-08-26。この画面を実際に描くのは揺らしたデータ（`tools/perturb/` の6つ目）だけになる。

---

## 構成

```
pipeline/scripts/
  lib/ledger.ts             selectUniverse が外れた会社の行と ID（lapsed・lapsedIds）を返す
  build-data.ts             lapsed.json を書く。会社ごとのデータを外れた会社のぶんも作る
web/public/data/lapsed.json 外れた会社の行・業種と決算期のプール・提出日・働きやすさ
web/features/company/
  lib/lapsed.ts             型（LapsedData・LapsedCompany）・断り・カードの1文・メタ
  lib/pageData.ts           isLapsedCompany・lapsedPageData。companyIds() が外れた会社を含む
  lib/sources.ts            出典の一覧が、無い節（順位・分布・年齢別の推定年収）を挙げない
  components/LapsedCompanyDetail.tsx   外れた会社の画面（島を持たない）
  components/CompanyBreadcrumbNav.tsx  ┐
  components/CompanySummaryText.tsx    │ CompanyDetail から切り出した節。2つの画面が同じ部品を使う
  components/SalaryHistorySection.tsx  │（切り出す前後で CompanyDetail の HTML が同じことを確かめた）
  components/CardFactList.tsx          ┘
web/src/pages/company/[id].astro       外れた会社なら LapsedCompanyDetail を描く
web/src/pages/sitemap.xml.ts           外れた会社のページも載せる
tools/perturb/perturb.py               6つ目の揺らし方: 1社の最後の提出日を25か月前にする
```

## データ

### 母集団と外れた会社の分け方

`selectUniverse`（D2）が台帳の提出日と `universe.json` の `filingWindow.to`（データを取った日）で振り分ける。**外れた会社の行は `companies.json` に入れず、`lapsed.json` に分けて書く。**

- `companies.json` は `/` が全件を読む（E0・ADR-0013）ので、混ぜるとトップページの読み込みに外れた会社が乗る
- 順位・偏差値・分布・業種の中央値・レーダーの軸・水準が近い会社は `companies.rows` を舐めて数える。混ぜると外れた会社が母集団の統計に紛れる。**分けておけば、全社を舐める計算は1つも直さずに済む**

### `lapsed.json`

```jsonc
{
  "industries": ["電気機器"],         // このファイルの中の業種のプール
  "periods": ["2024-06"],             // このファイルの中の決算期のプール
  "rows": [["E09999", "…", 0, 3, 40.1, 8.7, 18811567, 534, 0, 0]],  // companies.rows と同じ形
  "filedById": { "E09999": "2024-09-26" },  // 最後の有報の提出日（台帳の filed）
  "worklife": { "meta": {…}, "pool": […], "rows": […], "notes": […] }  // worklife.json と同じ形
}
```

- **行の形は `companies.rows` と同じ**（`companyRowOf` を共有する）。ただし**業種と決算期の添字はこのファイルの中のプールを指す**——`companies.json` の添字ではない。業種の中央値を引くときは添字ではなく業種名で引く（`pageData.ts` の `tenureHistoryFor`）
- **働きやすさは `lapsed.json` の中に持つ。** `worklife.json` は `companies.rows` と同じ並びの配列なので、外れた会社を足す場所が無い。`buildWorklife` は並びごとに1つずつ作り、「`worklife.csv` の全行がどこかの会社に当たる」の突合は母集団と外れた会社を合わせて見る
- いまは `rows` が空で、ファイルは1KB に満たない

### 会社ごとのデータ

**ID の辞書で持つファイルは、外れた会社のぶんも作る**（企業ページのある会社＝母集団＋外れた会社）。

| ファイル | 外れた会社 | 画面に出すか |
| --- | --- | --- |
| `history.json`（平均年収・平均年齢・在籍年数の推移） | 作る。**業種の中央値には数えない** | 出す |
| `profit-history.json`（稼ぐ力の推移） | 作る | 出す |
| `summaries.json`（説明文） | 作る | 出す |
| `pay-policies.json`（給与の決定方針） | 作る | 出す |
| `filings.json`（書類 ID） | 作る | 出す（Q&A の帯・出典） |
| `analyses.json`（要約と分析） | 作る | **出さない**（下の「外す節」） |
| `stats.json`・`radar.json`・`performance.json` | 作らない（母集団の統計） | — |

`analyses.json` に外れた会社の記録を残すのは、「`company_analysis.csv` の全行が掲載社に当たる」の突合（`buildAnalyses`）をそのまま使うため。記録はビルド時に読まれるだけで、画面にもクライアントにも届かない。

**推移の窓の右端の検め（`checkWindowEnds`・D5）も外れた会社を含めて回す。** 外れた会社の右端は最後の有報の年で、数字の書類の行と一致する。

## 画面

同じ URL（`/company/[id]`）で、`isLapsedCompany(id)` なら `LapsedCompanyDetail` を描く。

**島（JS）を持たない。** 母集団の会社の画面で操作するのは表示基準と年齢だけで、どちらもこの画面には無い。サーバーで描いた静的な HTML がそのまま届く（給与の決定方針・Q&A・出典は、母集団の会社と同じく名前付きスロットで差し込む）。

### 残す節と外す節

| 節 | 外れた会社 | 理由 |
| --- | --- | --- |
| パンくず・ロゴ・社名・業種・説明文（C7） | 残す | 業種の隣の「業界◯位」は出さない |
| **提出が途切れていることの断り** | 足す | 社名の直下（下の「断り」） |
| 平均年収カード（金額・平均年齢・従業員数） | 残す | 順位の段（全体順位・業界内順位）と、位置バー・分布は出さない |
| 分析「現状と今後」・要約 | **外す** | 書いた時点の見立てを、提出が途切れた後に「今後」として読ませない。要約は分析と対（C10 の決まり） |
| レーダー「公開資料による全体像」 | 外す | 位置は母集団の中の順位で決まる |
| 表示基準と年齢の切替・年齢別の推定年収 | 外す | 順位の無い推定値だけを残す理由が無い |
| 残業・有給・男女の賃金の差異 | 残す | 自己申告値で、母集団と関係ない |
| 平均年収・在籍年数・稼ぐ力の推移 | 残す | その会社の有報だけで決まる。在籍年数の業種の中央値は、いまの母集団の同業で数えた値 |
| 給与の決定方針・年収に関するQ&A | 残す | 最後の有報の原文と実測値 |
| 水準が近い会社・ランキングで比べる | 外す | 母集団の中の近傍と順位 |
| このページの出典 | 残す | 無い節は挙げない（下の「出典」） |

### 断り

```
有価証券報告書の提出が途切れています
{社名}の最後の有価証券報告書は、{提出日}に提出された{決算期}のものです。それから2年以上、
新しい有報が出ていないため、ランキングと順位・偏差値の計算から外しています。
このページの数字は、その最後の有報のものです。
```

- **社名の直下、金額より先に置く。** ページの数字が最後の有報のものであることと、ランキングにいない理由を先に読ませる
- `role="note"` の `div`。**`aside` にしない**——企業詳細の `aside` は「水準が近い会社」のサイドバーで、E2E もそれで引いている
- **決算期は断りと Q&A の説明の2か所だけ**（`docs/site-chrome/spec.md` 5.1）。カードの1文（`lapsedCardLead`）には書かない。「最新の」とも書かない（通常の `buildCardLead` との違い）

### メタ・sitemap・構造化データ

- **title・description に順位を出さない**（`lapsedPageMeta`）。description の中で「◯年◯月◯日に提出された◯月期の有価証券報告書を最後に、有報の提出が途切れています」と言う——検索結果の抜粋だけを読んだ人に、いまの数字だと思わせない
- canonical は自分自身（`/company/{id}`）。パンくずの構造化データは母集団の会社と同じ
- **sitemap に載せる。** ページは正規のページのまま残す（ADR-0018 の「ページが誤って消えるほうが痛手」）。ランキングからのリンクが無くなるので、クローラに届く経路は sitemap とほかのサイトからのリンクだけになる
- ランキングの検索（`/?q=`）には出てこない（`companies.json` にいないので）

### 出典

`buildSourceRows` に `ranked: false` と `profitHistory` を渡す。

- **推定値の行を出さない**（年齢別の推定年収も年齢そろえも無い）
- 計算値の行は、ページにあるもの（`稼ぐ力`・`業種の中央値`）だけを挙げる。どちらも無ければ行ごと出さない
- AIの評価の行は出ない（分析を出さないので `analysisDocId` が空）

## 確かめ方

- **合成データのユニット**: `lapsed.test.ts`（断り・カード・メタ）、`sources.test.ts`（`ranked: false`）、`ledger.test.ts`（振り分け）
- **ビルド**（`build-data.test.ts`）: 会社ごとのデータのキーが「母集団＋外れた会社」であること、外れた会社が `lapsed.json` にだけ行を持ち、業種・決算期・提出日を自分のプールから引けること
- **E2E**（`e2e/company-lapsed.spec.ts`）: 200 で返る・断りに決算期と提出日がある・金額と Q&A がある・順位・偏差値・分布・レーダー・近い会社・年齢別の推定年収・分析が無い・決算期が2回・ランキングの検索に出ない・sitemap に載る。横スクロールは `company-refresh.spec.ts` の AC-15 のループに外れた会社を1社足した。**いまのデータでは skip**（外れた会社がいない）で、`tools/perturb/check.sh --e2e` で走る
- **揺らし方の6つ目**（`perturb.py` の `lapse`）: 給与の決定方針と説明文のある会社を1社選び、台帳の最後の提出日を `filingWindow.to` の25か月前にする。ほかの揺らし方（決算期を新しくする・翌年の有報）が選んだ会社は避ける
