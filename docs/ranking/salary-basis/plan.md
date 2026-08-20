# U11 実測値モードと既定化 — plan.md

参照: Issue #71（親: #21）, `docs/ranking/spec.md` AC-1・AC-2・AC-7・AC-9・AC-11, `docs/company/spec.md` AC-1〜AC-3, ADR-0007（この Unit で追加）
依存: #6（U5）, #52（C1）

## Context

クエリ無しで `/` を開くと、いま出るのは **35歳に補正した推定年収**である。初見の読者にとってこれは「有報に載っている数字」と区別が付きにくい。バッジと注記で推定であることは書いてあるが、**既定で推定値を見せている**という構図そのものが、`docs/product/product.md` の「根拠を隠した推定値を表示しない」という立て方と噛み合っていない。

既定を**有報の平均年間給与そのまま（実測値）**に倒す。年齢補正は「年齢そろえ」として読者が明示的に選ぶモードにする。ランキングと企業詳細の両方を同時に変える。

Claude Design `改善案.dc.html` のアートボード 5a / 5b / 5c。レイアウトの刷新は U12・C2 に分けてある。

## 状態モデル — `basis` を作らず `targetAge: TargetAge | null` にする

モードを表す方法は2つあった。

| 案 | URL | 状態 |
| --- | --- | --- |
| 別フィールド | `?basis=age&age=35` | `basis: "raw" \| "age"` と `targetAge: TargetAge` |
| **採用** | `?age=35` | `targetAge: TargetAge \| null`（`null` = 実測値） |

採用案は**矛盾した状態を型の上で作れない**。別フィールド案だと `basis=raw` なのに `age=35` が付いた URL、`basis=age` なのに `age` が無い URL が表現でき、そのたびにどちらを優先するか決める分岐が要る。パラメータも1つ減る。

ADR-0006 が決めた `?age=` 8件の自己canonical・sitemap 登録はそのまま使える。既定が `/`（実測値・フィルタ無し）になることで、Google のファセットナビゲーション指針が薦める「個別アイテムのページ＋フィルタ無しの一覧1枚」により素直に合う。

## 変更するもの

### web（型と純粋関数）

- `features/ranking/types.ts` — `RankingState.targetAge: TargetAge | null`、`RankedCompany.estimatedSalary: number | null`
- `features/ranking/lib/urlState.ts` — `INITIAL_STATE.targetAge = null`。`buildSearchParams` は非 null のときだけ `age` を出す（35 を既定として省く扱いをやめる）。`parseSearchParams` は未知・不正な値を `null` に倒す
- `features/ranking/lib/rank.ts` — `targetAge === null` なら `estimateSalary` を呼ばない。ソートキーは `estimatedSalary ?? avgSalary`
- `features/company/types.ts` — `CompanyAgeStats.targetAge: TargetAge | null`、`CompanyStatsData` を後述の並びに
- `features/company/lib/view.ts` — 実測値ぶんを含めて `byBasis` を組み立てる
- `features/company/lib/stats.ts` — `statsForAge` を `targetAge: TargetAge | null` で引けるようにする

### pipeline

- `scripts/build-data.ts` の `buildStats` — `bases: (number | null)[] = [null, ...TARGET_AGES]` を新設し、`population` / `rankAll` / `rankIndustry` をこの並び（**先頭が実測値**）で持つ。実測値の列は `estimateSalary` を通さず `avgSalary` をそのまま使う。`rankWithin` はそのまま再利用する

**行と列がずれると別の会社・別の年齢の順位を出す。** `build-data.test.ts` で実測値ぶんを固定する。

### web（UI）

- `features/ranking/components/BasisSwitch.tsx` — 新規。`design-system/ui/toggle-group` と `tabToggleClass.ts` の `TAB_TOGGLE_SELECTED_CLASS` を使う（`AgeSwitch` と同じ作り）。**新しいプリミティブは足さない**。「年齢そろえ」を選んだら 35 にする
- `features/ranking/components/AgeSwitch.tsx` — `disabled` を受け取れるようにする。実測値のときも**描画したまま無効にする**（デザイン 5a。消すと切替後に何が増えるか分からない）
- `features/ranking/components/RankingApp.tsx` — `BasisSwitch`、h1 の出し分け（`平均年収ランキング` / `{age}歳年収ランキング`）
- `features/ranking/components/RankingTable.tsx` / `RankingCardList.tsx` — 列見出しと金額の出し分け。**実測値では「推定」バッジと「推定」の語を出さない**（AC-9）
- `features/company/components/CompanyDetail.tsx` — 「見せ方」の `BasisSwitch`、金額・ラベル・注記の出し分け
- `app/page.tsx` / `app/company/[id]/page.tsx` — `generateMetadata` をモードで分岐

### 再利用するもの（新しく作らない）

`ToggleGroup`（`design-system/ui/`）、`TAB_TOGGLE_SELECTED_CLASS`、`formatManYen` ほか `features/ranking/lib/format.ts`、`estimateSalary`（`salary.ts`）、`rankWithin`（`build-data.ts`）。

### ドキュメント

- `docs/adr/0007-default-salary-basis-raw.md` — 新規。既定を実測値にする決定と、`age` の有無でモードを表す URL 設計
- `docs/adr/0006-public-url-strategy.md` — ADR-0007 への参照を1行
- `docs/ranking/spec.md` — AC-1・AC-2・AC-7・AC-9 を改訂、AC-11 を追加
- `docs/company/spec.md` — AC-1〜AC-3 を改訂
- `docs/company/overview.md` — C1 への追記1行
- `docs/product/glossary.md` — 「実測値」「年齢そろえ」「表示基準」
- `app/about/page.tsx` — 2つのモードと、既定が実測値であること
- CLAUDE.md の「現在地」

## テスト

- 単体: `urlState.test.ts`（`age` 無し＝実測値、往復、不正値）、`rank.test.ts`（実測値のソートと `estimatedSalary === null`）、`view.test.ts` / `stats.test.ts`（実測値の順位・偏差値）、`build-data.test.ts`（実測値の母集団統計）
- E2E: `e2e/ranking-basis.spec.ts` を新規（既定が実測値・切替で `age=35` が出る・実測値では年齢スイッチが無効・戻るで実測値に戻る）。`ranking-url-sync.spec.ts` と `company-page.spec.ts` は既定の変更に合わせて更新

## 検証

1. `cd pipeline && npm run build:data -- --out ../web/public/data && npm test`
2. `cd web && npm run lint && npm run typecheck && npm test && npm run build`
3. `npm run test:e2e`
4. dev server で実際に触る（`/` が実測値・`?age=35` で年齢そろえ・戻る/進む・モバイル幅で横スクロールしないこと）
5. PR（`Closes #71`）→ 問題が無ければマージ

## リスク

- **`estimatedSalary` を `null` 許容にすると呼び出し側が広く当たる。** 型で全部出るので、`npm run typecheck` を先に通してから見た目を直す
- **`stats.json` の配列の並びが変わる。** 添字を1つずらす形なので、テストが無いと静かに壊れる。`build-data.test.ts` で実測値と35歳の両方を固定してから実装する
- **既定が変わることで既存の E2E が広く落ちる。** 落ちるのは期待どおりなので、1本ずつ「新しい既定で正しいか」を見て直す。惰性で期待値を書き換えない
- **`/?age=35` は U5 以前に共有された URL と意味が変わらない**（45歳の共有 URL は45歳のまま）。意味が変わるのは「クエリ無しの `/`」だけである点を design.md に残す
