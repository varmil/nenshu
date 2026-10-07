# CLAUDE.md

年齢補正した年収ランキングを公開する静的サイト。AI-DLC に沿って開発する。

## 会話の言語

**ユーザーとの会話は必ず日本語で書く。** ユーザーが英語で書いてきたときも、英語のエラー・ログ・ドキュメントを読んだ直後も、地の文は日本語のまま。応答だけでなく、コミットメッセージ・PR 本文・Issue・`docs/` 以下の文書もすべて日本語（既存のものが全部そうなっている）。

**訳さないものがある。** コード・識別子・ファイルパス・コマンド・ライブラリ名・エラーメッセージの引用は原文のまま置く。訳すと検索できなくなり、コピーしても動かない。

**この規則は `.claude/hooks/language-reminder.sh`（`UserPromptSubmit` フック）が毎ターン再掲する。** CLAUDE.md はセッションの先頭で一度読まれるきりで、会話が伸びると英語へ流れることが実際にあったため——「書いてあるから守られる」と当てにしない。フックを消すとこの担保も消える。

AI-DLC のフェーズ定義・ドキュメント種別（spec / overview / plan / design の違い）・承認ゲートは `docs/AI-DLC実践リファレンス_v10.pdf` が正。plan.md や design.md を書く前、Unit に着手する前は必ずこれを読み、記載されている型に従う。

**PDF はテキスト抽出できる。** `npm run pdftext -- docs/AI-DLC実践リファレンス_v10.pdf [開始頁] [終了頁]`（全13頁。**型の定義は p.13**、スコープ構造は p.3、実践例は p.7〜8）。**素の正規表現でパースしようとしない**——このPDFはフォントがサブセット化されており、ToUnicode を自前で辿ると文字化けする（実際に一度やって読めなかった）。`tools/pdftext.mjs`。

### 型の要点（PDF p.13 の表そのまま。迷ったら PDF を読む）

| ファイル | 単位 | 役割 | 書くこと | 書かないこと |
| --- | --- | --- | --- | --- |
| `spec.md` | Intentに1つ | 仕様 | 何を作るか（WHAT）・なぜ（WHY）・受け入れ基準 | 実装方法（How） |
| `overview.md` | 施策に1つ | 分解マップ | Unit一覧・依存・実施順序・共有コンポーネント | Unitの中身 |
| `plan.md` | Unitに1つ | 実行プラン | **着手前の段取り。作業手順と検証の順序（動詞的）** | 使用技術（→ADR）・クラス構造やファイル一覧（→design） |
| `design.md` | Unitに1つ | 設計 | **出来上がりの内部構造（名詞的）。コンポーネント・データモデル・API・シーケンス・ディレクトリ構成** | 施策を跨ぐ決定（→ADR） |

**plan.md は動詞、design.md は名詞。** plan に「変更するファイル一覧」を書くと design の仕事を先取りすることになる。

## このリポジトリの読み方

決定はすべて `docs/` にある。セッションをまたぐ前提はここから読む。

| 知りたいこと | 読む場所 |
| --- | --- |
| 開発の進め方（フェーズ・ドキュメント種別・承認ゲート） | `docs/AI-DLC実践リファレンス_v10.pdf` |
| 各領域の現在の仕様・数値・踏みやすい罠（旧「現在地」） | `docs/status/`（索引はこのファイルの最後の「現在地」） |
| プロダクト全体の面・アクター・施策一覧 | `docs/product/product.md` |
| 用語の定義 | `docs/product/glossary.md` |
| なぜ作るか・成功指標 | `docs/ranking/intent.md` |
| 何を作るか・受け入れ基準 | `docs/ranking/spec.md` |
| Unit の分解と順序 | `docs/ranking/overview.md` |
| 不可逆な技術決定 | `docs/adr/NNNN-*.md` |
| Unit の起票からマージまでの手順 | この CLAUDE.md の「Unit の起票（着手前）」「Unit完了後の運用」／`.github/ISSUE_TEMPLATE/`・`.github/pull_request_template.md` |

Unit ごとの `plan.md` / `design.md` は、その Unit に着手する時点で書く。事前に埋めない。

## 採用スタック

Astro、React、TypeScript、Tailwind CSS、shadcn/ui、Cloudflare Workers。
**Astro（`@astrojs/cloudflare`）で、`/` 以外はすべてビルド時に生成して静的アセットとして返す（ADR-0014）。** Worker が起きるのは `/` とそのファセット42件だけ。API もデータベースも持たない点は最初から変わらない（DBもAPIコールも無く、ビルド時に確定済みの静的データをリクエスト時にフィルタして返すだけ）。

バージョンは全般的に、特筆した理由がない限り着手時点の最新安定版を使う。固定が必要になったらADRに理由を書く。

**Next.js から移った**（ADR-0014・`docs/framework/`・Issue #200。F0=#208 → **F1=#209 でカットオーバー済み** → F2=#210 が残り）。理由は ADR-0001・ADR-0002・ADR-0004・ADR-0012・ADR-0014 の順に積み上がっている——**ADR-0014 が ADR-0002 のフレームワーク選択と ADR-0004 の配り方を supersede する**（ADR-0012 の決定はそのままで、実現の手段だけが変わった。ADR-0006 は変わっていない）。

- **`src/` は Astro が見る場所。`features/`・`design-system/`・`lib/` は移動していない。** ルーティングと head と外装が `src/pages/`・`src/layouts/`・`src/components/` にあり、画面の中身は React のまま。`@/` は `web/` の直下を指す（`astro.config.mjs` の `vite.resolve.alias`）
- **`/` だけが `export const prerender = false`。** 他はビルド時に生成する。**ページ（ルート）を足したら `wrangler.jsonc` の `run_worker_first` も見ること**——載せると Worker が起きるので、載せる理由が無いなら載せない（載せ忘れではなく、載せすぎのほうが事故になる）
- **島（`client:load`）は画面ごとに1つに収める。** Astro は島ごとに props を HTML の属性へ直列化するので、分けると同じデータが2回入る（実測で `/` が 481,312 → 733,979 B）。境界は `RankingIsland`・`CompanyDetailIsland` にある
- **パスは `lib/history/` から取る。`window.location.pathname` を直接書かない。** `isRankingPath()`（即時読み）と `useIsRankingPath()`（レンダー用）。**購読はしない**——ページを移ると文書ごと入れ替わるので、文書が生きている間にパスは変わらない（F0 で入れた `history` の包みは F1 で外した）
- **ページ間の遷移は素の `a` 要素で書く。** 包みも lint の縛りも無い（F2・#210 で `NavLink` ごと消した）

**クエリ文字列を読みたいときは `src/pages/index.astro` の `Astro.url.searchParams` で読む。** 状態⇄URL の同期は `window.history.pushState`/`replaceState` を直接呼ぶ。**規則は `web/lib/history/useLocationSyncedState.ts` の1か所にあり、ランキングと企業詳細の両方がこれを使う——書き写さないこと**（U14・Issue #108。`docs/status/ranking.md` の「戻る/進む」参照）。**ページ間の遷移は素の `a`（実ナビゲーション）でよい**（`/` ⇄ `/about` がそう）。ただしページネーションは、**初回ロードの直後にクライアントが全件を持っている**ためリンクにする意味が無く使っていない（U6・Issue #22）。**全件はHTMLに埋めるのをやめ、静的アセットとして1回だけ配る**（E0・ADR-0013）——届くまでの操作は実ナビゲーションに倒れる。

## エージェントが従う優先順位

既存コードベース ＞ `web/design-system/` のレジストリ ＞ モック。

色は `design-system/tokens/tokens.css` の CSS 変数だけを使う。生の hex を書かない。
コンポーネントは `design-system/ui/`（shadcn プリミティブ）と `design-system/components/`（合成物）から取る。
在庫にないものが必要になったら、その場で作らず Issue を起票する。

## 開発上の約束

- 数値の出典と計算方法は必ずユーザーから見える場所に置く。根拠を隠した推定値を表示しない。
- 推定値と実測値を同じ書式で並べない。年齢補正後の金額は推定であることが読んで分かる形にする。
- データの再生成は `pipeline/scripts/build-data.ts` に集約する。手作業で JSON を編集しない。
- `package.json`（ルート・`pipeline/`・`web/` それぞれ）を変更したら、その場で `npm install` を実行して対応する `package-lock.json` を更新し、同じコミット・同じPRに含める。ロックファイルが `package.json` とずれた状態でマージしない。
- **`web/` のロックファイルを更新したら、ローカルのnpmバージョンではなく `npx npm@10.9.2 ci`（Cloudflareのビルド環境が使うバージョン。変わっていたらビルドログの `Detected the following tools` 行で確認）で `npm ci` が通ることを確認する。** ローカルのnpmが新しいと、optionalDependencies（`@emnapi/*` 等）の解決がnpmバージョン間で微妙に異なり、ローカルでは通るのにCloudflareの `npm ci` だけ「lock fileとずれている」で失敗することがある（実際に2回発生した）。**このルールは `web/` に限る。** Cloudflareがビルドするのは `web/` だけで、ルートと `pipeline/` はCIの対象外のため、ローカルのnpmで `npm ci` が通ることの確認で足りる。
- **見た目（レイアウト・レスポンシブ・キーボード操作等）または機能に変更があるときは、Unitテスト（統合テスト含む）とE2Eテスト（`web/e2e/`, `npm run test:e2e`）の両方を書き、リポジトリに残す。** その場限りの動作確認で済ませない。ロジックの正しさはUnitテストで固定し、実際にブラウザでどう描画・動作するか（型チェック・Unitテストでは検出できない領域）はE2Eで固定する。U3でこの運用により実際にモバイル幅の横スクロールバグを検出できた（`docs/ranking/ranking-filters/design.md`参照）。既存のE2Eファイル（例: `web/e2e/ranking-filters.spec.ts`）に該当する変更なら新規ファイルを増やさずそこに追記してよい。
  - **テストは足す前に、同じ性質を見ているものが無いか探す**（2026-09-25 に E2E を約450件から171件に、web のユニットを約570件から447件に整理した。増えていたのはほとんどが重複と写しだった）。
    - **横断的な検査は既存の1本に足す。節ごと・画面ごとに書き足さない。** 横スクロール（ランキングは `e2e/ranking-refresh.spec.ts` の 390/360px のループ、企業詳細は `e2e/company-refresh.spec.ts` の AC-15 の 375px のループ）・操作でネットワークが起きないこと（`e2e/ranking-url-sync.spec.ts` の操作を続ける流れ）・JS 実行前の HTML（企業詳細は `e2e/company-page.spec.ts` の AC-10）・表示基準から独立な節（同 AC-3）は、**最悪ケースの会社・状態を配列に足す**
    - **E2E で状態遷移の組み合わせを網羅しない。** 規則はユニットで固定し、E2E は「操作が画面・URL に届く」流れを1本持てば足りる
    - **CSS の値を写さない**（font-size が 16px・バーが 3px・器が 68×48 等）。E2E が固定するのは実際の崩れ——横スクロール・切り詰め・折り返し・重なり・列のずれ・縦に潰れる——で、値の写しは意匠を変えるたびに落ちるだけで何も守らない
    - **外した機能が「出ないこと」だけを見るテストは書かない。** 不在が spec の規則であるもの（実測値で「推定」を出さない・決算期は1画面に1回 等）は別
  - **実データの値を書き写さない**（refresh の D0・#870）。毎日の更新で社数・金額・順位・偏差値・決算期の幅は日ごとに動くので、書き写した値はデータが1社ぶん動いただけで落ちる。期待値はデータから引くか、値どうしの関係で見る（全体順位は「自分より金額が高い会社の数＋1」）。表示の文字列は、データの値をアプリの整形関数・組み立て関数（`formatManYen`・`companyPageData` 等）に通して作る
    - **実データは `web/testing/realData.ts` から読む**（ユニットは `@/testing/realData`、E2E は `../testing/realData`）。**名指しは、その会社が「居る」ことだけを前提にするときに限る**（企業 ID は ADR-0017 で変わらない）。「給与の決定方針が無い」「平均年齢がちょうど35.0歳」「10年推移の途中が欠ける」のような**状態**を前提にするなら `pickCompany` でデータから選ぶ——状態はその会社の次の有報で変わる
    - **書いたら揺らしたデータで回す。** `tools/perturb/check.sh`（`--e2e` で E2E も）が、実測値の1位を消す・全社の平均年収を ±1〜9% 動かす・新しい会社を2社足す・決算期を1社新しくする・1社が翌年の有報を出す・1社の提出を25か月前で途切れさせる・1社の単体従業員を40人にする、をした上でビルドと全テストを回し、終わったら git でデータを戻す。値に縛られたテストはここで落ちる
    - **E2E から JSON を import するアプリのモジュールは `with { type: "json" }` が要る**（Playwright は Node の ESM で読む）。付けてあるのは `features/company/lib/pageData.ts`・`features/ranking/lib/pageData.ts`・`testing/realData.ts` だけ
- **書式は prettier（ルートの `.prettierrc.json`・100桁）。コミット時に lint-staged が整形する**ので、手でそろえなくてよい。まとめて回すならルートで `npm run format`（確かめるだけなら `npm run format:check`）。**`web/` の中で `npx prettier` を回さない**——`@astrojs/check` の依存で入った別の版を拾う
  - **対象は JS/TS だけ。** Markdown・JSON・CSS・`.astro` と生成物は `.prettierignore` で外してある。**「手で編集しない」生成物（`outline.py` が書く `lettering.ts`・`build:brand` が書く `ogFacts.ts` のようなもの）を足したら `.prettierignore` にも足す**——書き出し元は整形しないので、整形すると書き出し直すたびに差分が出る
  - **整形だけのコミットは `.git-blame-ignore-revs` に載せる。** GitHub の blame はこれを読む。手元では `git config blame.ignoreRevsFile .git-blame-ignore-revs`
  - 2026-09-28 に入れた。それまで設定は無く、`web/node_modules` にあるものをセッションが `npx prettier --check` で回すと、既定値（80桁）で大半のファイルが引っかかっていた
- **PR ごとに GitHub Actions の CI（`.github/workflows/ci.yml`）が回る**（refresh の D1・#871・`docs/refresh/ci/`）。ジョブは `pipeline`（prettier・pipeline の vitest と Python・`check:data`）・`web`（npm 10.9.2 の `npm ci`・lint・typecheck・vitest・`astro build`）・`e2e`（dev サーバーに向けて全件）の3つで、待ち時間は約3分。**コミット前のフックと違い、ファイルの種類で絞らずに全部回す。** ジョブの名前は自動マージ（D8）が API で読むので変えない
  - **`check:data` は、コミットされた `web/public/data/` が `pipeline/data/` から作り直したものと一致するかを見る**（`companies.json` の `generatedAt` だけ除く）。`pipeline/data/` を直したら `build:data` を回してコミットする
- **Claude Code on the web のセッションは `.claude/hooks/session-start.sh` が整える。** コンテナは毎回まっさらでクローンされるので、これが無いと `node_modules` が無い状態から始まる。中身は3つのワークスペースの `npm ci` と、`PLAYWRIGHT_CHROMIUM_PATH` を `$CLAUDE_ENV_FILE` に書くこと。**`$CLAUDE_CODE_REMOTE` で囲ってあるのでローカルでは何もしない。** 依存を足したりコマンドを増やしたらこのフックも直す
  - **`npm install` ではなく `npm ci`。** lock を書き換えないので、セッション開始時点で作業ツリーが汚れない（上の2つの約束と同じ理由）
  - **ルートの `npm ci` が husky の `prepare` を走らせ、`.husky/pre-commit`（lint-staged → prettier・lint・typecheck・vitest）を有効にする。** これが無いと web セッションのコミットだけがゲートを素通りする（実際に素通りしていた）
  - **Playwright の Chromium はコンテナのものを使う。** Playwright 1.62 が同梱を期待するのは 151（rev 1234）だが、入っているのは 141（rev 1194）だけ。`playwright.config.ts` の `PLAYWRIGHT_CHROMIUM_PATH` に渡して通す。**取り直さない**——環境側が `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` で止めている

## Unit の起票（着手前）

**1 Unit = 1 Issue = 原則1 PR = `docs/<施策>/<unit>/` の plan.md・design.md。** AI-DLC リファレンスのスコープ構造どおり、**Issue が Unit の正**（契約書）で、完了条件はそこにある。

着手の順序は次のとおり。

1. **`docs/<施策>/overview.md` の Unit 一覧に載っていない Unit は着手しない。** 先に overview.md に行を足す（ID・依存・対応する受け入れ基準・共有コンポーネントに触るか）。ID は施策ごとの連番（ranking は `U`、company は `C`）。
2. **Issue を立てる。** タイトルは `[Unit] <ID> <名前>`、ラベルは `unit` と `bolt-N`。テンプレは `.github/ISSUE_TEMPLATE/unit.md` で、**参照（spec の節・ADR）／依存／完了条件／非対象は必須**。完了条件は spec.md の受け入れ基準に対応させ、チェックできる形で書く。**親 Issue から割った Unit なら、本文の `親:` 行に `#<番号>` を書く**（下の「親子の紐づけ」）。
3. **その Issue 番号を持って plan.md を書き、着手する。** plan.md・design.md の冒頭から Issue を参照する（Issue → spec → ADR がリンクで辿れる状態にする）。

Unit にしないもの——1コミットで終わる修正・ドキュメントのみの変更・依存更新——は Issue 無しで進めてよい。その場合は PR 本文の「対応 Issue」に理由を1行書く。**plan.md や design.md を書きたくなった時点でそれは Unit なので、先に Issue を立てる。**

まだ Unit に割れていない要望・課題は `.github/ISSUE_TEMPLATE/idea.md`（`【親】` 始まり、ラベル無し）で起票し、割った時点で `[Unit]` Issue を立てて、その本文の `親:` 行に元の Issue の番号を書く。

### 親子の紐づけ

**親 Issue と Unit の親子関係は、本文の `親: #<番号>` の1行だけが正。** `.github/workflows/link-sub-issue.yml` がこの行を読んで GitHub の sub-issue として紐づける（Issue の `opened`・`edited` で発火する。取りこぼしたときは Actions のページから手動実行でき、番号を空にすれば open な Issue を全件走査する）。

- **本文にリンクを書くだけでは紐づかない。** sub-issue は GitHub の別の関係で、これが無いと親の進捗バー（`2 / 3`）が埋まらず、どの親がどの Unit に割れたかを GitHub 上で辿れない。**手で付ける運用にしていた頃は26件が紐づかないまま残っていた**（2026-08-24 に一括で直した）
- **書くのは行頭の `親: #123`**（全角コロンも可）。本文の最初の1つだけを見るので、複数の親は持てない
- **番号を間違えるとワークフローが落ちる。** 赤くなったら Issue 本文を直す——ワークフロー側では直せない
- **Unit 以外の Issue（`【親】`・単発の修正）も同じ規則。** 親を持つなら書く、持たないなら行ごと省く。**親が親を持ってよい**（#74 → #54 → #30 のように三段になっている）
- **Issue 本文はセッションから直してよい**（2026-08-25 に方針を変えた）。以前は「画面から直す」決まりだった——`PATCH /issues/{n}` すると末尾に `_Generated by [Claude Code](https://claude.ai/code)_` のフッタが環境側で足され、こちらでは外せなかったため（2026-08-24 に #159 で実際に付けてしまった）。**#209 の本文を実際に更新して確かめたところ、いまはフッタが付かない。** 起票（`create`）でも付かない。**運営者に手作業を回す理由が無くなったので、番号・依存・完了条件の直しはセッションから当てる**
  - **ただしタグに見える文字列は落ちる。** `<html>` や `<a>` をそのまま書くと**消える**（#209 の AC-9 が `` `` `` になり、PR の本文からも `<a>`・`<workerd>` が消えた）。応答は引用符を `&#34;` に escape するのにタグは**消えている**ので、落としているのは書き込み側とみられる。**`html 要素`・`ルート要素`のように地の文で書くか、山括弧を避けて書く**
  - **本文を丸ごと差し替える形になる**ので、直す前に必ず現在の本文を読んでから当てる。部分置換ではない
- **GitHub Project のステータス（Backlog / Ready / In progress / Done）は自動化していない。運営者が手で動かす。** Claude のセッションからは Projects v2 の API（GraphQL のみ）に到達できないので、ステータスを触ろうとしない

**進めながら分かったことは Issue のコメントに書かない**（`docs/` の外に「AI が読めない決定」を作らないため）。行き先は決定の性質で分ける。

- **施策を跨ぐ／不可逆な決定** → `docs/adr/NNNN-*.md`
- **Unit の内部構造に関する決定** → その Unit の `design.md`。**決定の経緯を並べるのではなく、決まった構造として書く**（型は PDF p.13 が正）。選択の理由は構造の説明に添える短い根拠に留め、長い比較検討が要るなら ADR に切り出す
- **spec の受け入れ基準に関わる発見** → `spec.md` を改訂する

## Unit完了後の運用

Unit の実装を終えたら、次の順で進める。

1. **動作チェック**: ビルドとテストを実行する。見た目・機能に変更があるUnitは「開発上の約束」のとおりUnitテスト・E2Eテストを書いたうえで、UIを持つUnitはさらに dev server を起動して実際にブラウザで機能を触って確認する（型チェック・テストが通ることはコードの正しさの保証であって、機能の正しさの保証ではない）。**ブラウザ操作ツールがそのセッションで使えない場合は、E2Eテストの実行結果で代替してよい。** `package.json` に変更があるなら `package-lock.json` が更新・ステージされているかもここで確認する（「開発上の約束」参照）。
2. 対応する Issue に紐づけた PR を作成する（`Closes #<番号>`）。本文は `.github/pull_request_template.md` の節をそのまま埋める（動作チェックの結果と docs の更新をここで突き合わせる）。
3. **動作チェックに問題がなければ、承認を待たずにマージしてよい。** 問題が見つかった場合はマージせず、内容を報告する。

この許可は Unit の実装フロー（ビルド・テスト・PR・マージ）に限る。破壊的な操作（force push・履歴の書き換え等）や、この運用の対象外の判断が要る場面は都度確認する。

### 定期実行のデータ更新（refresh の D8・`docs/refresh/routine/design.md`）

**毎日の定期実行が立てる PR（ラベル `refresh`）は、CI（`ci.yml`）が通れば GitHub Actions（`refresh-automerge.yml`）が運営者を待たずにマージする。** セッションはマージしない。手順は `.claude/skills/refresh-daily/SKILL.md`。

- **通る基準のファイル（`pipeline/refresh/criteria.txt`。テスト・止める線の閾値 `pipeline/refresh/thresholds.json`・生成の規格 `pipeline/*/prompts/`・手順の `.claude/` ほか）に触れる PR は、自動ではマージしない。** `refresh-criteria` のラベルで止まり、Issue で知らせる。運営者が見てマージする
- **更新できなかったものは、1件につき Issue 1つ**（ラベル `refresh-alert`・本文の1行目が鍵）。解消すると自動で閉じる（`pipeline/refresh/alerts.py`）
- **Unit の PR にはラベル `refresh` を付けない。** Unit の PR は上の1〜3のとおりセッションがマージする

## 現在地

**Bolt 1（ランキング1ページ＋計算方法ページ）・Bolt 2（企業詳細ページと公開URL戦略）のほか、site-chrome・runtime・worklife・performance・timeseries・logo・expansion・framework（Astro への移行）の各施策は実装済みで、毎日の定期実行（`refresh`）が回っている。** 各領域の現在の仕様・数値・踏みやすい罠は `docs/status/` にある。**その領域のコードやデータを触る前に、下の表の該当ファイルを読む。**

| 触る領域 | 読むファイル |
| --- | --- |
| 全体の経緯・Unit の順序 | `docs/status/overview.md` |
| デプロイ・キャッシュ・Workers の CPU・`wrangler.jsonc`・`astro.config.mjs`・アクセス解析 | `docs/status/deploy-runtime.md` |
| ランキング（`/`）・表示基準・推定式・URL 同期・戻る/進む・偏差値 | `docs/status/ranking.md` |
| 企業詳細ページ（`/company/[id]`）の画面・説明文・要約・給与の決定方針・Q&A・出典・ランキング導線 | `docs/status/company.md` |
| `<title>`・description・OGP・canonical・sitemap・ロゴ/ファビコン・決算期の出し方・共通ヘッダ・ダークモード | `docs/status/site-chrome-seo.md` |
| 働きやすさ指標（残業・有給・男女の賃金の差異） | `docs/status/worklife.md` |
| 稼ぐ力・レーダーチャート・稼ぐ力の推移 | `docs/status/performance.md` |
| 平均年収・在籍年数の10年推移 | `docs/status/timeseries.md` |
| 企業ロゴ（調達・表示） | `docs/status/logo.md` |
| 掲載企業数・母集団・データの時点（幅） | `docs/status/expansion.md` |
| 毎日のデータ更新・台帳・定期実行・ランキングの外の会社 | `docs/status/refresh.md`（手順は `.claude/skills/refresh-daily/`。トークン消費の計測と削減は `docs/refresh/token-cost.md`） |
| Claude Design のモックとの合わせ直し | `docs/status/mock-alignment.md` |
| テスト（E2E の書き方・`e2e/appTest.ts`） | `docs/status/testing.md` |
| 未解決の課題・保留中の Issue（#22・#55・#214 ほか） | `docs/status/open-issues.md` |

**ここに現在地を書き足さない。** 新しく分かったことは該当する `docs/status/` のファイルに書く。CLAUDE.md は全セッション・全サブエージェントが毎回読むので、伸ばしたぶんがそのまま消費量になる（2026-10-07 の計測で、236KB（11.4万字）あった CLAUDE.md が、サブエージェントの最初の文脈 約13.5万トークンの大半を占めていた。うち「現在地」が89%で、ここへ移して28KB（1.4万字）にした）。**PR の「docs」欄にある「現在地を実態に合わせた」は、該当する `docs/status/` のファイルを直すこと。**
