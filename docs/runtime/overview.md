# overview.md — Worker の実行予算の分解マップ

`docs/runtime/spec.md` を Unit に割る。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 備考 |
| --- | --- | --- | --- | --- |
| R0 | 画面が読むデータと、1リクエストの計算を減らす | なし | AC-1〜AC-10 | ranking・company の両ページ、`pipeline/scripts/build-data.ts`・`build-logos.ts`、`eslint.config.mjs` に触る。※共有: `companies.json` の生成物一式 |

## 実施順序

```
R0（単独）
```

R0 で足りなければ、次は spec 5. に挙げた静的生成の検討になる。**それは ADR になるので、この overview には先に書かない。**

## R0 画面が読むデータと、1リクエストの計算を減らす

spec.md の 2.・3. すべて。

**1つの Unit にまとめる理由は、どれも同じ1つの症状（`exceededCpu`）に対する処置で、別々に出しても途中の状態を誰も観測できないため。** データの分割だけ入れて計算の重複を残しても、「予算に収まったか」の判定は結局まとめてしかできない。

- **データの分割は生成側でやる**（spec 2.3）。`population.json` は `build-data.ts`、`logo-ids.json` は `build-logos.ts` が書く。**web 側で切り出さない**——それでは丸ごと読んだあとで捨てることになり、何も減らない
- **`logo-ids.json` は企業IDの配列にする。`companies.rows` と同じ並びのマスクにしない。** マスクにすると `build-logos.ts` が `companies.json` の行の並びに依存し、`build-data.ts` → `build-logos.ts` → `build-data.ts` の循環ができる（`build-logos.ts` は既に `companies.json` を読んでいる）
- **AC-1・AC-2 は `eslint.config.mjs` の `no-restricted-imports` で止める**（AC-3）。`next/link` を止めているのと同じ形。型もテストも通ってしまう類の間違いで、レビューでは見つからない
- **画面が変わらないことは既存の E2E が担保する。** この Unit で新しく足すのは「読んでいるファイル」と「計算の回数」を固定するテストで、見た目のテストは足さない（変わらないため）

## 他施策から触られる箇所

**`worklife.json`（491KB・parse 1.734ms）は W1（Issue #150）が `/company/[id]` に足す。** spec 2.1 の表はそれを見越して「W1 以降は読んでよい」と書いてある。**ただし当該1社ぶんしか使わないので、W1 は R0 と同じ問いを一度通ること**——1社ぶんのために全社ぶんを読むなら、`logo-ids.json` と同じ切り出しが要る。

**`/company/[id]` の説明文（C5〜C7・Issue #159〜#161）は新しいデータファイルを1つ増やす。** 同上。

## 共有コンポーネント

無し。R0 が触るのは既存のページとパイプラインだけで、新しい UI を作らない。

## R0 の対象外

spec 5. のとおり。とくに**静的生成への切り替えは R0 に含めない。**
