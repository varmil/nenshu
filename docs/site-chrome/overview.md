# overview.md — サイト共通の外装の分解マップ

`docs/site-chrome/spec.md` を Unit に割る。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| S1 | 共通ヘッダとライト/ダーク切替 | なし | AC-1〜AC-9 | サイト名の変更を含む。design-system のダークトークン修正も含む |
| S2 | OGPと構造化データ | S1, ranking施策のU8（#53）, S4（#163） | AC-10〜AC-16 | `og:` 一式・静的OG画像1枚・`BreadcrumbList`。実装は `web/lib/seo/` に置く |
| S3 | データの時点（決算期）の明示 | S1, ranking施策のU8（#53） | AC-17〜AC-20 | 「いつの有報か」を全ページに出す（親 Issue #104）。ranking・company の画面と `web/lib/seo/`・パイプラインの `meta` に触る。※共有: `companies.meta` |
| S4 | サイトロゴとファビコン | S1 | AC-21〜AC-28 | `create-next-app` 既定のファビコンを差し替える。ヘッダは文字のまま。**S2 の OG画像が使う素材になる** |

## 実施順序

```
S1 ─→ S2（ranking施策の U8 の後）
   ├→ S3（同上。S2 とは独立に進められる）
   └→ S4 ─→（S2 の OG画像はこれを使う）
```

**S4 は S2 より先に出す。** S2 の OG画像（spec 4.3）は「ブランドが読める図」なので、ロゴが決まっていないと作れない。逆に S4 は S2 を待たない。

フッタの共通化・ナビゲーションの階層化は spec.md の対象外。

## S2 OGPと構造化データ

spec.md の 4. すべて。**U8（#53）が canonical を決めたあとでないと `og:url` が決まらない**ので、順序はその後になる。**実装済み**（`social-preview/`）。

- 実装は **`web/lib/seo/`**（U8 が作った場所）に置く。OGP は ranking と company の両方にかかる横断の関心で、`features/<施策>/` には属さない
- **`og:url` は canonical と同じ文字列にする。** 別々に組み立てると、非正規URLで canonical だけが寄せ先を指し `og:url` が自分自身を指す、という食い違いが起きる
- OG画像は **v1は静的1枚**（spec 4.3）。会社ごとに数字を焼く案は Workers の CPU 予算に踏み込むので、効果を見てから。**ブランドの図は S4（#163）が用意した**ので、そこから起こす
- JSON-LD は **画面に既にある情報だけ**（spec 4.4）

実装は `og:` の入口を `toMetadata()`（`lib/seo/pageMeta.ts`）1つに閉じる形になった。**`og:title`・`og:description`・`og:url` は title・description・canonical と同じ値から出る**ので、新しい文言は1つも増えていない。`/about` だけ素の `Metadata` を直書きしていたので、文言を `lib/seo/about.ts` へ出して同じ経路に乗せた。OG画像の文字は**アウトラインで持つ**——`sharp` の `<text>` は実行環境の fontconfig を引き、日本語フォントの無い機械では豆腐が並んだ画像が焼けるのに寸法もバイト数も正しいまま通る。詳細は `social-preview/design.md`。

## S3 データの時点（決算期）の明示

spec.md の 5. すべて。**「有価証券報告書ベース」までは書いてあるのに、それが「いつ」の有報かがサイトのどこにも無い**（親 Issue #104）ので、決算期（`2026年3月期`）を title・description・画面の3方向に出す。

**site-chrome の Unit だが、ランキング（ranking）と企業詳細（company）の画面も同じ PR で変える。** 出すのは全ページに共通する1つの事実で、ページごとに別の時点を書くことがそもそもありえない。`docs/ranking/overview.md`・`docs/company/overview.md` にも追記する。

- **決算期はデータから導く。** `pipeline/scripts/build-data.ts` が CSV の `period_end` から最頻の決算期を出して `companies.meta` に載せ、web 側は `web/lib/data/period.ts` の1か所でそれを文字列にする。社数（`companies.meta.count`）と同じ扱いで、直書きは AC-20 で禁じる
- **文言は `2026年3月期`。`2026年度` とは書かない**（spec 5.3）。親 Issue のタイトルは「2026年度みたいなニュアンス」だが、年度で言うと 2026年3月期は 2025年度になり、読者によって1年ずれる
- **OGP（S2）とは独立。** S2 は `og:title`・`og:description` を title・description と同じ文字列にすると決めてあるので、S3 が先に入れば OGP にもそのまま乗る

## 他施策から触られる箇所

**共通ヘッダの会社名検索は ranking 施策の U12（Issue #80）が足した**（`features/navigation/components/HeaderSearch.tsx`）。ヘッダは全ページに出るのでこの施策の持ち物だが、中身の振る舞いはランキングの状態に属する——`/` の上では `pushState` ＋ 合図でランキングの状態を更新し、それ以外のページでは `/?q=` へ遷移する。仕組みは `docs/ranking/ranking-refresh/design.md`。

ヘッダの構成を変えるときはこの検索欄も一緒に見ること。

**検索欄の見た目は ranking 施策の U13（Issue #88）が変える。** Claude Design のアートボード 5a では、ヘッダは `ブランド / 検索 / 表示モード＋計算方法` の3カラムで、検索欄は入力欄と虫めがねボタンが1つの丸い帯になっている（U12 が置いたのは右端に寄せた素の入力欄だった）。振る舞い（`/` では遷移しない・それ以外では `/?q=` へ遷移する）は変えない。

**検索語の履歴の積み方は ranking 施策の U14（Issue #121）で直した。** 打つそばから `pushState` していたため、**1文字＝履歴1件**になっていた（「トヨタ自動車」で6件。親 Issue #108）。いまは `q` が付く／外れる境目だけ `push` で、打ち替えは `replace`。判断は `features/ranking/lib/queryBroadcast.ts` の `buildQueryLocation` にある（`docs/ranking/back-navigation/design.md`）。

## S1 共通ヘッダとライト/ダーク切替

spec.md の 1〜3 すべて。**サイト名の変更・共通ヘッダの新設・表示モードの切替を1つの垂直スライスとして出す。**

3つを分けない理由は、**共通ヘッダを作らないとトグルの置き場所が無く、ヘッダを作るならサイト名がそこに出るため**。順番に出すと、途中の状態（ブランド名の無いバー、置き場所の無いトグル）がどれも読者に見せられる形になっていない。

### 先に直すもの: ダークの `--primary`

`.dark` の `--primary` は背景に対して **2.72:1** しかなく WCAG AA（4.5:1）を割っている（実測）。#65 で「Primary＝リンク・選択中のタブ・チャートの色」に振り直したため、**このままダークを出すと全リンクとチャートが読めない。**

プリセット `b1sAmVzuq` が `.dark` の sidebar 用に持っている明るいティールのペアをそのまま `--primary` / `--primary-foreground` に使う（プリセットの外の色を発明しない）。詳細と実測値は `site-header-theme/design.md`。

**この修正は S1 の中でやる。** 別 Unit に切らないのは、ダークが画面に出ない限りこの不足は誰にも影響しないため（単体では出す価値が無い）。

## S4 サイトロゴとファビコン

spec.md の 6. すべて（AC-21〜AC-28）。**いま公開されているファビコンは `create-next-app` の既定**（黒い円に白い三角。`web/app/favicon.ico` は雛形のまま 25,931 バイト・16/32/48/256px の4枚組）で、タブ・ブックマーク・ホーム画面ではこのサイトの顔が他所のマークになっている。

意匠は Claude Design の `OpenReport Logo & Favicon.dc.html`（プロジェクト `3edfdab4-552f-49d4-b9da-c4ab709decd7`）が正。**シンボル（開いたリング＋チェック）とワードマークの2つを持ち、ヘッダはワードマークのみ・ファビコンはシンボル単体で使う。**

- **色を増やさない。** デザイン案の `#007595` / `#00b8db` は `design-system/tokens/tokens.css` の `--primary`（`:root` / `.dark`）と一致することを変換して確認済み。**画面の中に出るものはトークン経由**にし、CSS 変数が届かない成果物（ファビコン等）だけが値を持つ——その値がトークンと一致していることはテストで固定する
- **ヘッダは文字のまま**（デザイン案も「ヘッダーはワードマークのみ」）。ワードマークを画像にすると、選択・検索・拡大のいずれも文字より劣り、`BrandLink` の振る舞い（`/` の上ではリセット）も変わらない
- **企業ロゴ（`logo` 施策）とは別物。** `--logo-surface` の器・`CompanyLogo`・`logos.json` には触らない。名前が近いので docs でも「サイトロゴ」と「企業ロゴ」を書き分ける

**S2（Issue #116）の OG画像がこの Unit の成果物を使う。** ただし OG画像そのものは S2 の担当で、S4 では作らない。

## 共有コンポーネント

**`ThemeToggle`** — `features/theme/components/` に置く。`design-system/components/` へ昇格させない。

`docs/AI-DLC実践リファレンス_v10.pdf` の運用ルール④（featureをまたぐUIは昇格）に照らすと、共通ヘッダから使われる以上「またいでいる」ように見える。だが**使う場所は共通ヘッダ1箇所だけ**で、複数の feature から使われるわけではない。`AgeSwitch` を昇格させなかったとき（`docs/company/overview.md`）と同じ基準で判断する。

**`SiteHeader`** — `features/navigation/components/` に置く。`NavLink`・`NavProgressBar` と同じ施策のもの。

## S1 の対象外

フッタの共通化、ナビゲーションの階層化（メニュー・ドロワー）、ロゴ画像（→ S4）、ドメインの取得。
