# overview.md — レーダーの6軸化の分解マップ

`docs/radar/spec.md` を Unit に割る。親 Issue: [#912](https://github.com/varmil/nenshu/issues/912)

**Unit の ID は `A`**（axis）。施策ごとの連番という規則は他の施策と同じ（ranking は `U`、company は `C`、site-chrome は `S`、timeseries は `T`、worklife は `W`、logo は `L`、performance は `P`、expansion は `E`、framework は `F`、runtime は `R`、refresh は `D`）。

## Unit 一覧

| ID | Unit | 依存 | 対応する受け入れ基準 | 共有コンポーネント |
| --- | --- | --- | --- | --- |
| A0 | レーダーに平均年収の伸びを足す（6軸） | #911 | AC-1〜AC-12 | `features/company/` に留める。※共有: `features/company/lib/radar.ts`（pipeline も import する）・`pipeline/scripts/build-data.ts` の `buildRadar()`・`features/company/lib/sources.ts`・`features/about/` |

**1 Unit にする。** 伸びは既に持っている10年推移と年次の従業員数から出すので、稼ぐ力の P0 のような取り込みの Unit が要らない。データだけを先に入れても読者に見えるものが無く、垂直スライスにならない。

## 実施順序

```
#911（稼ぐ力を240社で掲載しない・別セッションで実装中）─→ A0
```

**#911 を先に入れる。** A0 はコードの上では #911 に依存しないが、両方がレーダーと稼ぐ力のまわり（`radar.ts`・`build-data.ts`・`sources.ts`）を触るので、並べて進めると衝突する。**成功指標（2点以下の会社 72社 → 20社）も #911 の後の状態で測っている。**

## A0 レーダーに平均年収の伸びを足す（6軸）

spec.md のすべて。

### 着手前に見えている設計上の論点

- **伸びの値と判定を出す関数の置き場所。** 順位はビルド時に `radar.json` へ、値と年齢の差は表示時に `history.json` から出す。**両方が同じ関数を通る**ように、`features/company/lib/` に置いて pipeline から import する（`radar.ts` と同じ形。alias を使わない）
- **(b) の判定に要る年次の従業員数。** `performance_history.csv`（連結・単体、`back = 0` の行）と `salary_history.csv`（単体）にある。どちらを正にするか、片方が欠けた年をどう扱うかを design.md で決める。**判定はビルド時だけ**で、`web/` には判定の結果（順位が `-1`）だけが届く。表示側は (a) を窓の年から判定でき、(a) でなければ (b) と読める
- **6角形の寸法とラベルの置き場所**（spec 4.）。いまの viewBox（300×232・R=70）は5軸の配置で決めてある。**`<svg>` 自身に `@container` を付けない**（縦が潰れる。`docs/performance/company-radar/design.md`）
- **指標の一覧の並びと、2行の行の組み方。** 稼ぐ力の行は4巡目・5巡目で列のずれを直してある（grid・業種名の略称）。伸びの行も同じ grid に乗せ、2行目（期間と平均年齢の差）が1行に収まるかを 296px の器で測る
- **欠測の断りの文言**（spec 1.6・4.）。「公表の無い指標は…」は、#911 の後は稼ぐ力について事実と違う文になる

### モック

**要否は運営者が決める。** 起こすなら Claude Design の `改善案.dc.html` のアートボード 6a・6b の6軸版。起こさない場合は、いまの寸法と文字の大きさ（11 / 12 user unit・PC の器 340px・モバイル `max-w-[370px]`）の中で組み、E2E で重なりとはみ出しを見る。

### 書き換える docs

A0 の PR で一緒に直す。

- `docs/performance/spec.md` 2.1・AC-6（5軸 → 6軸。平均年収の伸びは radar 施策を指す）
- `docs/performance/intent.md`（「有報3本で最悪でも三角形」の前提が #911 で崩れ、この施策で補ったこと）
- `docs/performance/company-radar/design.md`（軸の表・母集団の表・`radar.json` の中身）
- `docs/product/glossary.md` の「計算値」（平均年収の伸びを足す）
- `docs/product/product.md` の施策マップの状態
- CLAUDE.md のレーダーの段落（5軸 → 6軸・並び・母集団）

## 共有コンポーネント

**design-system には触らない。** レーダーは企業詳細ページにしか無い。

## 対象外

`intent.md`「作らないもの」を参照。
