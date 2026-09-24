# C13 有報への直リンク — design.md

参照: Issue [#814](https://github.com/varmil/nenshu/issues/814), `docs/company/spec.md` 1.20・AC-31・1.15, `docs/site-chrome/spec.md` 5.1

## 出来上がり

`/company/[id]` の「有価証券報告書の実測値」の4項目の表の下辺に、その会社の有報を EDINET で開く
帯が付く（Claude Design の案 D）。「このページの出典」の実測値の行の「有価証券報告書」も同じ書類への
リンクになる。

```
有価証券報告書の実測値（2026年3月期）                                    h2
有価証券報告書によると、株式会社キーエンスの平均年収は…です。
提出会社（単体）のもので、連結子会社の従業員は入りません。
┌──────────┬──────────┬──────────┬──────────┐
│ 平均年収   │ 平均年齢   │ 在籍年数   │ 従業員数   │   ← 下の角を丸めない
│ 2,178万円  │ 35.0歳    │ 11.3年    │ 3,306人   │
├──────────┴──────────┴──────────┴──────────┤
│ [書類] この会社の有価証券報告書          EDINETで開く [外部] │   ← 帯全体が1つの a 要素・bg-muted
└──────────────────────────────────────┘      min-h-11（44px）・別タブ
```

モバイル（本文 358px）でも帯は1行のまま。表は2列×2段になる。

## データの流れ

```
pipeline/data/ranking_unified_2026.csv の doc_id（平均年間給与を取った書類）
  └ pipeline/scripts/build-data.ts  buildFilings()
       → web/public/data/filings.json   {"byId": {"6861": "S100YAHE", …}}   2,961社・gzip 16.6KB
            └ web/features/company/lib/pageData.ts  requireFilingDocId(id)
                 → CompanyPageData.filingDocId（8文字）
                      ├ 島の props → CompanyDetail → FilingLink（帯）
                      └ [id].astro → buildSourceRows({ …, filingDocId }) → SourcesSection（出典の行）
                                         URL にするのは web/lib/data/sources.ts の edinetDocumentUrl() だけ
```

| 場所 | 役割 |
| --- | --- |
| `pipeline/scripts/build-data.ts` の `buildFilings` | CSV の `doc_id` を ID の辞書にして `filings.json` に書く。**全社にあり、書類管理番号の形（`S` ＋英数字7桁）であることを確かめて、外れたらビルドを落とす** |
| `web/public/data/filings.json` | `{"byId": {id: 書類ID}}`。**URL は持たない** |
| `web/lib/data/sources.ts` の `edinetDocumentUrl` | 書類 ID → 書類閲覧ページの URL（`https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?{書類ID},,`）。組み立てはここ1か所 |
| `web/features/company/lib/pageData.ts` | `filings.json` を import する唯一の場所。無い会社はビルドを落とす（`requireCompanyView` と同じ扱い） |
| `web/features/company/components/FilingLink.tsx` | 帯。状態を持たない |
| `web/features/company/lib/sources.ts` | 実測値の行の出典を `["金融庁 EDINET の", {text: "有価証券報告書", url}, "（単体）"]` にする。切れ端に `{text, url}`（会社ごとのリンク）の形を足した |

## 決めたこと

- **データには書類 ID だけを持ち、URL は描画時に1か所で組み立てる。** 書類閲覧ページの URL は公開
  API ではなく EDINET の画面の URL で、システムの更新で変わりうる。変わったときに直すのが関数1つで
  済み、データを作り直さなくてよい
- **`filings.json` は `/company/[id]` だけが読む。** `src/pages/index.astro` からは読まない
  （トップページの HTML を増やさない）。`dist/server` を grep して書類 ID は0件——Worker バンドルにも
  入らない
- **書類 ID は島の props に載せる。** 実測値の節は島の中にあるため。載るのは8文字だけで、URL の
  文字列も固定の文言も props に入れない（W2・C7 で踏んだ「同じ文が props と本文の2か所に出る」形）
- **帯全体を1つのリンクにする。** 案 D の見た目はそのままで、押せる範囲を帯全体に広げた。高さは
  PC・モバイルとも 44px
- **帯に決算期も社名も書かない。** 決算期は企業詳細で2か所と決まっていて（真上の見出しと要約の説明）、
  書くと3回目になる。社名は真上に並んでいるうえ、長い社名だとモバイルで1行に収まらない
- **別タブで開き、`nofollow` は付けない。** 公的な一次情報で、「このページの出典」の他のリンクと同じ扱い
- **見出しの隣には置かない。** モバイルでは見出し（「有価証券報告書の実測値（2026年3月期）」）だけで
  本文の幅 358px を使い切っていて、隣に置くと行が折れる（運営者の指摘）

## 実測

変更前は main（`cb77b99`）を別の作業ツリーでビルドした値。

| | 変更前 | 変更後 |
| --- | --- | --- |
| `/company/6861` の HTML（raw / gzip） | 145,371 B / 20,401 B | 146,895 B / 20,950 B |
| `/company/8306` の HTML（raw / gzip） | 147,966 B / 20,889 B | 149,490 B / 21,263 B |
| 帯の寸法（PC / モバイル） | — | 652×44px / 358×44px |
| `filings.json` | — | 2,961社・gzip 16.6KB（上限 20KB） |

**増えたのは1社あたり 1,524 B で、会社によらず同じ。** 大半はアイコン2つの SVG。

## 固定しているもの

- **帯のリンク先がキーエンスの書類（`S100YAHE`）の閲覧ページで、別タブで開く。** 決算期を書かない。
  表の下辺に接し、左右がそろう（`e2e/company-filing.spec.ts`）
- **JS 実行前の HTML に帯があり、`/` の HTML に書類 ID が無い**
- **390px でも1行に収まり、押せる高さが 44px ある**
- **出典の節の実測値の行も同じ書類へのリンク**（同上・`e2e/company-refresh.spec.ts` の AC-16）
- **全社に書類 ID があり、CSV の `doc_id` と行ごとに一致する**（`pipeline/scripts/build-data.test.ts`）。
  行がずれると別の会社の有報へ飛ばすので、並びまで見る
- **URL の組み立て**（`features/company/lib/sources.test.ts`）

## 入れなかったもの

- **10年ぶんの有報へのリンク。** 書類 ID は `salary_history.csv` の全 26,865行にあり、キーエンスは
  2017年の書類まで開くことを確かめた。**平均年収推移の表から張るのはつながりが弱い**（運営者の判断）
  ので、見せ方を決めてから別の Unit にする
