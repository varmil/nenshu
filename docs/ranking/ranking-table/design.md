# U2 ランキング表と年齢スイッチ — design.md

## ファイル構成

```
web/features/ranking/
  types.ts                    # RankingState, RankedCompany, CompaniesData, CurvesData, バケット型
  lib/
    curve.ts                  # interpolate（pipeline/scripts/lib/curve.ts と同じアルゴリズム。ブラウザ側の別実装）
    curve.test.ts
    salary.ts                 # estimateSalary
    salary.test.ts            # AC-1 / AC-2 をここで固定
    rank.ts                   # buildRankedCompanies
    rank.test.ts              # AC-2後半（60歳top50 ⊇ 35歳top50 の40社以上）をここで固定
    format.ts                 # formatManYen, formatDecimal1, formatInt
    format.test.ts
  hooks/
    useRankingState.ts
  components/
    AgeSwitch.tsx              # ToggleGroupベース
    RankingTable.tsx           # デスクトップ表。hidden md:block
    RankingCardList.tsx        # モバイルカード。md:hidden
    RankingApp.tsx             # "use client"。useRankingStateを持ち、AgeSwitch+Table+CardListを束ねる
app/page.tsx                   # Server Component。companies.json/curves.jsonをimportし<RankingApp>に渡す
```

`pipeline/scripts/lib/curve.ts`（Node、ビルド時専用）と `web/features/ranking/lib/curve.ts`（ブラウザ、実行時）は別実装になる。共有パッケージ化はしない。理由: 2つは別npmプロジェクト（`docs/ranking/project-foundation/design.md` の決定）であり、10行程度の純関数のために共有パッケージ境界を作るコストのほうが高い。同じアルゴリズムであることは、両方が同じ実データ（`web/public/data/curves.json`）に対して同じ結果を出すことをテストで固定することで担保する。

## 型

```ts
export type TargetAge = 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;
export const TARGET_AGES: readonly TargetAge[] = [25, 30, 35, 40, 45, 50, 55, 60];

export type EmployeeSizeBucket = "under300" | "300to1000" | "1000plus";
export type TenureBucket = "under13" | "13to17" | "17plus";
export type AvgAgeBucket = "under40" | "40to43" | "43plus";

export type CompanyRow = [
  id: string, name: string, tse33Idx: number, curveIdx: number,
  avgAge: number, avgTenure: number, avgSalary: number, employees: number, badge: 0 | 1,
];

export interface CompaniesData {
  meta: { version: string; count: number; generatedAt: string };
  industries: string[];
  curveKeys: string[];
  rows: CompanyRow[];
}

export interface CurvesData {
  agePoints: number[];
  curves: Record<string, number[]>;
}

export interface RankingState {
  targetAge: TargetAge;
  industry: string | null;
  employeeSize: EmployeeSizeBucket | null;
  tenure: TenureBucket | null;
  avgAgeBucket: AvgAgeBucket | null;
  query: string;
  visibleCount: number;
}

export interface RankedCompany {
  id: string;
  name: string;
  tse33: string;
  hasBadge: boolean;
  avgAge: number;
  avgTenure: number;
  avgSalary: number; // 円、補正前
  employees: number;
  estimatedSalary: number; // 円、目標年齢時点の推定
  rank: number;
}
```

plan.md の確定事項と同一。バケット型は判定ロジックを持たない（U3の担当）。

## 計算ロジック

`lib/curve.ts` の `interpolate(points, values, x)` は `pipeline/salary35/curves.py` の `_interp` と同じ（区分線形補間、範囲外は端の値で頭打ち）。`pipeline/scripts/lib/curve.ts` と同一アルゴリズムをそのまま複製する。

`lib/salary.ts`:

```ts
export function estimateSalary(
  avgSalary: number,
  avgAge: number,
  curveValues: number[],
  agePoints: number[],
  targetAge: number
): number {
  const factor =
    interpolate(agePoints, curveValues, targetAge) /
    interpolate(agePoints, curveValues, avgAge);
  return Math.round(avgSalary * factor);
}
```

`lib/rank.ts` の `buildRankedCompanies(companies, curves, state)`:

1. 各行に対して `curveIdx` → `curveKeys[curveIdx]` → `curves.curves[curveKey]` を引き、`estimateSalary` で目標年齢時点の推定年収を計算する。
2. （U3/U4がここに絞り込みステップを追加する。U2では `state.industry` 等が常に `null`/`""` なので何もしない。）
3. `estimatedSalary` の降順でソートする。
4. 1位から順に `rank` を振る。
5. `state.visibleCount` で切り出す。

## フォーマット（`lib/format.ts`）

- `formatManYen(yen)`: `Math.round(yen / 10000)` を `toLocaleString("ja-JP")` でカンマ区切りにし、「万円」を付ける（例: `21783259` → `"2,178万円"`）。
- `formatDecimal1(n)`: `n.toFixed(1)`。
- `formatInt(n)`: `Math.round(n).toLocaleString("ja-JP")`。

## `useRankingState`

plan.md の確定事項のとおり。`setState` はReactの `Dispatch<SetStateAction<RankingState>>` をそのまま返す（個別setterを増やさない。U5のURL同期が1箇所から書き換えられるようにするため）。`rankedCompanies` は `useMemo` で導出する。

## UI

**年齢スイッチ**: `design-system/ui/toggle-group.tsx`（`ToggleGroup`/`ToggleGroupItem`、`@base-ui/react/toggle-group` ラッパー）を使う。`value` は `string[]`（単一選択でも配列）。空配列になる更新（同じ項目を再クリックして選択解除しようとする操作）は無視し、常に1つ選択されている状態を保つ。矢印キーでのロービングフォーカスはプリミティブ側の標準機能。

**表（デスクトップ）**: `design-system/ui/table.tsx`。列は spec.md §1.3 のとおり: 順位・会社名(+「本社のみ」バッジ)・業種・推定年収・平均年齢・平均年収・在籍年数・従業員数。

- 推定年収セルは `text-2xl font-bold text-primary`（トークン経由）で最も強く。列見出しは「{targetAge}歳時点の推定年収」＋常時表示の「推定」バッジ。
- 平均年収セルは `text-sm text-muted-foreground`。列見出しは「平均年収（実績）」。書式・色ともに推定年収と明確に分ける（AC-9）。
- 会社名に `hasBadge` が真なら `Badge variant="secondary"` で「本社のみ」を添える。

**カード（モバイル）**: `md:hidden` で表と切り替える。1社1カード。カード上部に順位・会社名・バッジ・業種、中央に推定年収を最大の文字サイズで、下部に平均年齢・平均年収・在籍年数・従業員数を小さく並べる。

**推定である旨の常時表記**: 列見出しの「推定」バッジに加え、表の直下（`TableCaption`または同等のテキスト）に「年齢補正後の推定値です。実際の年収を保証するものではありません。」を常時表示する。

**初期表示件数**: `visibleCount` の初期値100（AC-1）。追加読み込みUIはU6の担当なので、このUnitでは作らない。

## データの取り込み

`app/page.tsx`（Server Component）で `import companiesData from "../public/data/companies.json"` と `import curvesData from "../public/data/curves.json"` を行い、`<RankingApp companies={companiesData as CompaniesData} curves={curvesData as CurvesData} />` を返す。`tsconfig.json` の `resolveJsonModule: true`（既存）でそのままimportできる。`output: 'export'` はClient Componentの初回レンダーも静的HTMLに焼き込むため、`RankingApp` 内の `useRankingState` の初期状態（35歳・絞り込みなし・上位100件）がそのままSSGされる。

## テスト方針

Vitestを `web/` に追加する（ルートと同じ選定）。React コンポーネントの単体テスト（jsdom・Testing Library）は今回追加しない。理由: このUnitの完了条件は「データの正しさ」（AC-1・AC-2）と「見た目・操作性」（視覚的な強弱・キーボード操作・モバイル切替）に分かれ、前者は純関数テストで、後者は実ブラウザでのスクリーンショット確認（U1で使ったPlaywright手順を再利用）で検証するほうが実効性が高い。

- `lib/curve.test.ts`: 代表年齢の範囲外（22歳未満・67歳超）で端の値に頭打ちになること。
- `lib/salary.test.ts`: `web/public/data/companies.json`・`curves.json` の実データを使い、キーエンス（id `6861`）の35歳時点推定年収が2,178万円、25歳時点が1,642万円になること（AC-1・AC-2）。
- `lib/rank.test.ts`: 実データに対し、35歳・絞り込みなしで1位がキーエンスであること（AC-1）。60歳時点の上位50社に35歳時点の上位50社が40社以上含まれること（AC-2後半）。
- `lib/format.test.ts`: `formatManYen`・`formatDecimal1`・`formatInt` の丸めとカンマ区切り。

## Cloudflare Pagesビルド設定への影響

無し。`web/` 配下の追加のみで、ビルドコマンド・出力ディレクトリは `docs/ranking/project-foundation/design.md` のまま。
