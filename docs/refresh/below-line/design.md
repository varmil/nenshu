# design.md — D11 掲載の条件を割った会社をランキングから外し、ページを残す

Issue: [#903](https://github.com/varmil/nenshu/issues/903)
spec: `docs/refresh/spec.md` 1.3・1.16・AC-7 ／ 段取り: `plan.md` ／ ADR: `docs/adr/0018-universe-entry-exit.md`（2026-09-30 の追記） ／ 触る Unit: D4（差分更新）・D6（文章の差分生成）・D9（提出が途切れた会社のページ）

載っている会社の次の有報が、掲載の条件のうち**単体従業員の線（100人）**を割ったとき、その有報の数字で反映し、ランキングと母集団（順位・偏差値・母集団の統計）から外す。企業ページは残し、ランキングにいない理由を年収カードの直下で断る。次の有報で線に戻れば、ランキングに戻る。

**きっかけはサイバーステップＨＤ（#893）。** 2026年5月期に持株会社へ移り、単体の従業員が177人から40人（全員が管理部門）になった。平均年収は 401万 → 522万円（+30.1%）、平均年齢は 35.1 → 40.9歳。ゲーム事業の141人は子会社の側にいる（連結224人）。D11 の前は、前の期の数字でランキングに残り続け、最後に反映した提出から24か月で D9 の「提出が途切れた会社」になって、事実と違う断りが出るはずだった。

---

## 構成

```
pipeline/refresh/
  update_numbers.py        below_line・ineligible で、載っている会社が線だけを割ったら反映に回す。
                           line_crossing で線をまたいだ会社を報告する
  update_texts.py          applies が、線を割った会社の分析の工程を選ばない
pipeline/scripts/
  lib/ledger.ts            selectUniverse がランキングの外の会社を理由つきで返す（UnrankedReason）
  build-data.ts            unranked.json を書く（D9 の lapsed.json を改めた）
web/public/data/unranked.json   ランキングの外の会社の行・理由・提出日・連結の従業員数・働きやすさ
web/features/company/
  lib/unranked.ts          型・断り・カードの1文・メタを理由で出し分ける（D9 の lapsed.ts を改めた）
  lib/pageData.ts          isUnrankedCompany・unrankedPageData。掲載の条件の線も渡す
  components/UnrankedCompanyDetail.tsx   ランキングの外の会社の画面（D9 の LapsedCompanyDetail を改めた）
web/features/about/components/AboutPage.tsx   「対象範囲」に、線を割ったときの扱いを1文
tools/perturb/perturb.py   7つ目の揺らし方: 1社の単体従業員を40人にする
```

## どの条件を割ったら外すか

**単体従業員の線だけ。** 掲載の条件は3つある（`unified.ineligible_reason`）が、残りの2つは読み違いの検査として働いている。

| 条件 | 割ったとき | 理由 |
| --- | --- | --- |
| 単体従業員100人以上 | **反映して、ランキングの外へ**（D11） | 会社の形が変わった結果で、有報のとおり。持株会社への移行・事業の切り出しで起きる |
| 平均年齢20〜65歳 | 前の期の数字のまま待ち行列に残し、知らせる（D4 のまま） | 外れるのは読み違いのとき |
| 平均年間給与100万円超・読める | 同上 | 同上。#892（桁）・#895（表の列）はどちらも読み違いだった |

判定は `update_numbers.below_line(rec)`＝「条件を満たさないが、人数の条件を外せば満たす」。`ineligible(rec, listed)` が、載っている会社（台帳にある会社）に限って反映に回す。**載っていない会社が線を割っていても載せない**——全件の組み直しと同じ入る条件（ADR-0011）のまま。

## 状態の持ち方

**「線を割った」は台帳に持たない。ビルドが行の従業員数から決める。**

- 差分更新は、線を割った会社もふつうの会社と同じく反映する——ランキング CSV の行・10年推移・稼ぐ力・台帳の数字の書類と提出日を新しい有報に替え、待ち行列には残さない（知らせも立たない）。線 B（前の期から ±50%）の読み直しもふつうに掛かる
- ビルド（`selectUniverse`）が、行の `employeesNonConsolidated < minEmployees` でランキングの外へ振り分ける。線は `universe.json` の `minEmployees`（全件の組み直しと同じ値）
- **次の有報で線に戻れば、何も書き換えずにランキングへ戻る**（行の人数が線の上になるだけ）
- 台帳の提出日が進むので、24か月の出る条件（D9）とは別の理由のまま残る。**判定の順は「提出が途切れた」が先**——提出が途切れた会社の数字は古いので、その断りを出す

`apply` は、線をまたいだ会社（`line_crossing`: `out`・`back`）を標準出力に出す。定期実行の PR 本文に書くため。

## データ

### `unranked.json`（D9 の `lapsed.json` を改めた）

```jsonc
{
  "industries": ["情報・通信業"],               // このファイルの中の業種のプール
  "periods": ["2026-05"],                        // このファイルの中の決算期のプール
  "rows": [["3810", "サイバーステップ…", 0, 5, 40.9, 5, 5223089, 40, 0, 0]],  // companies.rows と同じ形
  "reasonById": { "3810": "belowLine" },         // "lapsed" | "belowLine"
  "filedById": { "3810": "2026-08-28" },         // 数字の有報の提出日（台帳の filed）
  "consolidatedById": { "3810": 224 },           // 連結の従業員数。単体より多い会社だけ
  "worklife": { … }                              // worklife.json と同じ形
}
```

- 行・プール・働きやすさの持ち方は D9 のまま（`docs/refresh/lapsed-pages/design.md`「データ」）。会社ごとのデータ（推移・説明文・給与の決定方針・書類・要約と分析）もランキングの外の会社のぶんを作り、業種の中央値と母集団の統計には数えない
- **`consolidatedById` は線を割った会社の断りのため。** 持株会社に移った会社では単体の平均がグループの社員の平均と別物になるので、連結の人数を並べて言う

### 名前を改めた範囲

D9 の「外れた会社」（`lapsed`）は、24か月の出る条件だけを指していた。同じ画面に2つ目の理由が入るので、**入れ物の名前を「ランキングの外の会社」（`unranked`）に改め、`lapsed` は理由の1つの名前に残した。**

| D9 | D11 |
| --- | --- |
| `lapsed.json` | `unranked.json` |
| `LapsedData`・`LapsedCompany`・`findLapsed` | `UnrankedData`・`UnrankedCompany`・`findUnranked` |
| `lapsedNotice`・`lapsedCardLead`・`lapsedCardFacts`・`lapsedPageMeta` | `unranked…`（理由で出し分ける） |
| `isLapsedCompany`・`lapsedPageData` | `isUnrankedCompany`・`unrankedPageData` |
| `LapsedCompanyDetail` | `UnrankedCompanyDetail` |
| `data-testid="company-lapsed-notice"` | `company-unranked-notice`（`data-reason` に理由） |
| `e2e/company-lapsed.spec.ts` | `e2e/company-unranked.spec.ts` |
| `realData.lapsed` | `realData.unranked`・`unrankedIdsOf(reason)` |

**変えていない名前**: `isLapsed`（24か月の判定）・`perturb.py` の `lapse`（6つ目の揺らし方）・`docs/refresh/lapsed-pages/`。

## 画面

D9 の画面（`UnrankedCompanyDetail`）をそのまま使う。**節の並びと、残す節・外す節は理由によらず同じ**（`docs/refresh/lapsed-pages/design.md`「残す節と外す節」）。理由で変わるのは次の3つだけ。

| | 提出が途切れた（`lapsed`） | 線を割った（`belowLine`） |
| --- | --- | --- |
| 断りの見出し | 有価証券報告書の提出が途切れています | 単体の従業員が100人を下回っています |
| 断りの本文 | 最後の有報の提出日と決算期・2年以上出ていない・数字はその最後の有報のもの | その期の有報で単体の従業員がN人・ランキングは100人以上で作っている・**数字は提出会社のN人の平均で、グループ全体（連結M人）の平均ではない**（連結の人数が無ければ「提出会社のN人の平均です」） |
| カードの1文 | 「最後の有価証券報告書に載っている」 | 「最新の有価証券報告書に基づく」（通常の企業詳細と同じ） |
| description | 有報の提出が途切れていること | 単体の従業員が100人を下回ったため、ランキングには載せていないこと・決算期 |

- **決算期を出すのは、どちらも断りと Q&A の説明の2か所**（`docs/site-chrome/spec.md` 5.1）
- **線の値（100）は `companies.meta.excluded.minEmployees` から引く。** 断りにもメタにも書き写さない
- 分析「現状と今後」と要約は、線を割った会社でも出さない。下の「文章」

## 文章

**線を割った会社は、分析と要約を書かない**（`update_texts.applies`）。画面に出さないので、書いても読まれない。説明文と給与の決定方針は書く（画面に出る）。

- 分析の原文の切り出し（`prepare` の分析の4節）もしない。マニフェストの書類を分析の記録と食い違わせないため
- 分析を選ばないのは「途中で止まった」ではない（`select_queue` の先に片付ける会社に入らない）
- **線に戻れば、台帳の分析の書類が数字の書類と食い違ったままなので、次の回で選ばれる**

画面に分析を出さないのは、提出が途切れた会社（D9）と揃えるため。線を割った会社の分析を書き直して出すなら、材料（同じページが表示している数値）に順位・偏差値が無い会社の書き方を生成の規格に足すことになる（非対象）。

## `/about`

「対象範囲」の単体従業員の行に1文足した——「一度載った会社が、次の有価証券報告書でこの線を下回ったときは、ランキングから外し、企業ページだけを残します」。

## 確かめ方

- **合成データのユニット**
  - `test_update_numbers.py`: `below_line`・`ineligible`（載っている会社・載っていない会社・ほかの条件も割った）、`line_crossing`、線を割った会社の `apply`（反映・待ち行列に残さない）
  - `test_update_texts.py`: 線を割った会社は分析を選ばず、「途中で止まった」にもならない
  - `ledger.test.ts`: 振り分けの理由・線ちょうど（100人は載る）・提出が途切れたほうが先
  - `unranked.test.ts`: 理由ごとの断り・カードの1文・メタ、連結の人数の有無、線を書き写さないこと
- **ビルド**（`build-data.test.ts`）: ランキングの外の会社が `unranked.json` にだけ行を持ち、理由・提出日・連結の人数を引けること。理由が「24か月たったか」と「線の下か」に合っていること
- **E2E**（`e2e/company-unranked.spec.ts`）: 理由ごとに1社で、200・断り（見出し・人数・線・連結・提出日）・決算期が2回・金額と Q&A がある・順位・偏差値・分布・レーダー・近い会社・年齢別・分析が無い・検索に出ない・sitemap に載る。横スクロールは `company-refresh.spec.ts` の AC-15 のループに理由ごとに1社
  - 線を割った会社は実データ（サイバーステップＨＤ）で走る。提出が途切れた会社は揺らしたデータでだけ走る
- **揺らし方の7つ目**（`perturb.py` の `below_line`）: 説明文と給与の決定方針を持ち、連結の従業員数が40人より多い会社を1社選び、単体従業員を40人にする。ほかの揺らし方が選んだ会社は避ける

## マージの後に直したもの

- **分析の材料の稼ぐ力を、`ranking_unified.csv` の行順で引いていた**（`pipeline/analysis/generate.py` の `build_figures`）。`performance.json` の `perEmployee` は `companies.rows` と同じ並びで、D11 まではランキング CSV の行順と一致していた。ランキングの外の会社は CSV にいて `companies.rows` にいないので、**その後ろの392社が隣の会社の稼ぐ力を材料にするところだった**（定期実行が分析を書く前に見つけた）。企業 ID（台帳）で引くように改め、働きやすさも証券コードではなく ID で引く（証券コードが `0000` の1社がずれていた）。`test_generate.py` の `ProfitPerEmployeeById`
- **断りを年収カードの直下へ移し、器を通常の企業詳細と同じ2カラムにした**（運営者の指示・2026-09-30）。D9 の初版は断りが社名の直下で、サイドバーを持たない1カラムだった——PC では本文だけが左に寄り、右が空いていた
  - **断りはカードと1つの塊**（間は `gap-4`）。金額を読んだ直後に、ランキングにいない理由とその金額が誰の平均かが続く。D9 の「金額より先に読ませる」は採らなかった
  - **サイドバーは同じ業種の実測値の上位10社**（`neighbors.ts` の `topOfIndustry`）。この会社は母集団にいないので「水準が近い」を母集団の中で測れず、便宜的に業種の1位から並べる（運営者の指示）。**見出しは「◯◯で平均年収が高い会社」**——中身が上位10社なのに「水準が近い会社」と名乗ると、読者は近い金額の会社が並んでいると読む。業界順位の振り方（同額は同順位）は `findNeighbors` と共有する。ロゴはその10社ぶんも `logoIds` に入れる
  - 分析「現状と今後」は出さないまま（運営者の判断）
  - E2E（`company-unranked.spec.ts`）: 1280px で断りが金額より下・Q&A より上、サイドバーが本文の右、見出しと1位の会社。`company-refresh.spec.ts` の 375px のループはランキングの外の会社でもサイドバーの位置を見る

