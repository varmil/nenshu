# U15 並び替えの向きの切替 — design.md

Issue: [#132](https://github.com/varmil/nenshu/issues/132)（親 [#106](https://github.com/varmil/nenshu/issues/106)）
仕様: `docs/ranking/spec.md` 1.10・AC-12 ／ 分解: `docs/ranking/overview.md` U15 ／ 段取り: `plan.md`

出来上がりの内部構造。**3つのチップで6通りの並びを操作する**——軸は増やさず、選択中のチップをもう一度押すと向きが反転する。

## 並びを表す値

並びは `RankingState.sort` の1つのフィールドで、中身が軸と向きの組になっている。

```ts
// features/ranking/types.ts
export interface SortSelection {
  key: SortKey;      // "salary" | "age" | "employees"
  order: SortOrder;  // "asc" | "desc"
}
```

**`sort` と `sortOrder` を並べたフィールドにはしない。** `RankingState` の更新はすべて `Partial<RankingState>` の差分で当たる（`RankingApp` の `applyFilter`）ので、2つに分けると `{ sort: "age" }` だけを当てられる。そのとき向きは前の軸のものが残り、「平均年齢を降順で」という誰も選んでいない並びになる。**実際に一度この形で書いて、既存のURLテストが `sort=age-desc` を吐いて落ちた。**

**軸に向きを混ぜた文字列（`SortKey` に `"age-desc"` を足す）にもしない。** 「同じ軸をもう一度押したか」の判定が毎回の文字列の切り出しになる。向きを綴りに混ぜるのはURLの都合なので、`lib/urlState.ts` の中だけに閉じる。

表示基準（`targetAge: TargetAge | null`）を1つの値にまとめてあるのと結論は同じだが、理由は逆向きである。表示基準は**分けると矛盾した状態が表現できる**から1つにした。並びは6通りのどれも矛盾しないが、**分けると片方だけ書ける**から1つにしてある。

## 軸ごとの既定の向き

| 軸 | 既定の向き | 逆向き | チップの文字（選択中） |
| --- | --- | --- | --- |
| `salary` | `desc` | `asc` | 平均年収 高い順 ／ 平均年収 低い順 |
| `age` | `asc` | `desc` | 平均年齢 若い順 ／ 平均年齢 高い順 |
| `employees` | `desc` | `asc` | 従業員数 多い順 ／ 従業員数 少ない順 |

`features/ranking/lib/sort.ts` の `SORT_DEFAULT_ORDER`・`SORT_AXIS_LABEL`・`SORT_DIRECTION_LABEL` が正。**既定の向きは U15 より前の3通りそのままで、「全部昇順に揃える」ような整理はしない**——読者が既に見ている並びと、外に出ている `?sort=age`・`?sort=emp` の意味を変えないため。

向きの言い方は軸ごとに違う（「昇順／降順」とは書かない）。**`age` の `desc` だけは「高い順」で、`salary` の `desc`（高い順）と字面が同じ**になるが、軸の名前と必ず並べて出すので取り違えようがない。

## 押したときの規則

```ts
// features/ranking/lib/sort.ts
nextSortSelection(current: SortSelection, axis: SortKey): SortSelection
```

- **別の軸** → その軸の既定の向きから始める（前の軸の向きを引き継がない）
- **同じ軸** → 向きだけ反転する

コンポーネントではなくここに置いてあるのは、**押した回数で結果が変わる唯一の規則**だからで、`sort.test.ts` が3軸ぶんの往復を固定している。向きを引き継がないのは、軸ごとに「まず見たい端」が違うため——従業員数を押した読者が見たいのは大きい会社であって、直前に年収を低い順で見ていたかどうかとは関係がない。

## URL

**`sort` の1つのパラメータのままで、`dir` のようなキーを増やさない。** 軸と向きは片方だけでは意味を成さない1つの選択なので、2つのキーに割ると `?dir=asc` だけが残ったURLという読めない状態が作れてしまう。

| 状態 | `sort` |
| --- | --- |
| 年収・高い順（既定） | 出さない |
| 年収・低い順 | `salary-asc` |
| 平均年齢・若い順 | `age` |
| 平均年齢・高い順 | `age-desc` |
| 従業員数・多い順 | `emp` |
| 従業員数・少ない順 | `emp-asc` |

**既定の向きなら軸の名前だけ、逆向きなら向きを足す。** 向きを必ず書く形（`age-asc`）にもできるが、それだと U15 より前に配ってある `?sort=age` が「正規形ではないURL」になり、同じ並びに2つの綴りが残り続ける。軸のトークン（`salary`・`age`・`emp`）に `-` は含まれないので、読む側は末尾だけ見れば割れる（`splitSortParam`）。

`age-zzz`・`zzz-asc` のような読めない値は**軸ごと落として既定に倒す**（`parseSearchParams` の「不正な値は既定に倒す」に合わせる。エラー画面は出さない）。

**canonical は変わらない。** `sort` が効いているURLは向きによらず `/` へ寄せる（ADR-0006）ので、インデックス対象の 1,910 URL は増えない。`lib/seo/ranking.ts` の判定は軸と向きの両方を見る——**`?sort=salary-asc` は軸が既定と同じなので、向きを見ないと「効いていない」と誤判定する。**

## 並べ替え

`features/ranking/lib/rank.ts` の `applySort`。

```ts
const SORT_COMPARATORS: Record<SortKey, (a, b) => number>  // どれも昇順で書く
applySort(companies, { key, order })  // order === "asc" ? +1 : -1 を掛ける
```

**比較は軸ごとに1本だけ持ち、向きは符号で反転させる。** 6通りぶんの比較関数を並べると、片方だけ直すという壊し方ができる。

**既定（年収・高い順）だけは並べ替えずにそのまま返す。** 渡ってくる配列は母集団の順位（`populationRank`）を振るために既に表示基準の金額の降順になっており、同じ並びを作り直す意味がない（Workers Free の CPU 10ms/リクエストに対して、1,867件のソート1回ぶんの節約）。

**向きは全件に対して効く。1ページ目の中で並べ替えるのではない。** 年収を低い順にした1ページ目は最下位の30社で、順位の列は `1,867` から下る（`rank` は書き換えない。spec.md 1.10）。

## チップ

`features/ranking/components/SortSwitch.tsx`。見た目は U13 のまま（軸だけを出し、選択中にだけ向きの語を添える。向きの語は `sm` 以上）。

- **「同じ軸をもう一度押した」の合図は、`ToggleGroup` が寄こす空配列。** 単一選択の `@base-ui/react` の `ToggleGroup` は、選択中の項目を押すと `onValueChange([])` を呼ぶ（`setGroupValue`）。U13 まではこれを捨てて「選択解除させない」ためだけに使っていた。**項目ごとの `onClick` で拾うと、同じクリックで状態が2回動く。**
- **矢印は向きを表す**（`ChevronDownIcon` = 大きい順、`ChevronUpIcon` = 小さい順）。U13 までは常に下向きで、「平均年齢が若い順」でも下を向いていた。**モバイルでは向きの語を出さないので、矢印が唯一の手がかりになる。**
- **`aria-label` は `${軸} ${向き}` のまま。** 見えている文字（軸だけ、または軸＋向き）は必ずその部分文字列になる（WCAG 2.5.3 Label in Name）。**未選択のチップはその軸の既定の向きを載せる**——押した結果と同じ文字列になるが、意味づけは「この軸はこう並ぶ」に置いている。

## 変えていないもの

- **軸は3つのまま。** spec.md 1.13 の「任意の列でのソート」は対象外のままで、列見出しを押しての並び替えも作らない
- **順位の列は振り直さない**（spec.md 1.10）。向きを反転しても `rank` は金額基準
- **「適用中」チップに並びは出ない**（`activeFilters`）。並びは常にどれかの値を持っていて「解除する」操作が無い
- **年収バーの基準**はページ内正規化のまま。向きを変えるとページの1位が入れ替わるので基準も取り直される（`pageMaxSalary` はページ切り出しの後に採る）
- **ページ番号は1に戻る**（軸・向きのどちらを変えても。`applyFilter` の1か所に閉じている）

## ページの重さ

トップページの HTML は raw 355,611 B → **355,640 B**（`next start` に対して同一手法で前後を測った。+29 B）。増えたのは選択中のチップの向きの語と、上向きの矢印1つぶんだけである。**送るデータは変わらない**——並びはクライアントが既に持っている全1,867社の配列を並べ替えるだけで、向きが増えても取りに行くものは無い（Issue #22 の全件embed）。

## テスト

| 何を | どこで |
| --- | --- |
| 押したときの規則（3軸の往復・向きを引き継がない） | `features/ranking/lib/sort.test.ts` |
| URLの綴り・往復・U15 前のURLの意味 | `features/ranking/lib/urlState.test.ts` |
| 6通りの並び・順位が振り直されないこと | `features/ranking/lib/rank.test.ts` |
| 向きだけ違うURLの canonical | `lib/seo/ranking.test.ts` |
| チップの表記・URL・行の並びが揃うこと・ネットワーク0件 | `e2e/ranking-refresh.spec.ts`（「AC-12 並び替え」に追記） |
