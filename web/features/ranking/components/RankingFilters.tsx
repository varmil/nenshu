"use client";

import { AVG_AGE_OPTIONS, EMPLOYEE_SIZE_OPTIONS, TENURE_OPTIONS } from "../lib/filterOptions";
import type {
  AvgAgeBucket,
  EmployeeSizeBucket,
  RankingState,
  TenureBucket,
} from "../types";
import { FilterSelect } from "./FilterSelect";
import { FilterToggleGroup } from "./FilterToggleGroup";

export interface FilterPanelProps {
  state: RankingState;
  /** 変更ぶんだけを渡す。ページを1に戻すのは受け取り側の責務。 */
  onChange: (patch: Partial<RankingState>) => void;
  industries: string[];
}

/**
 * 絞り込み4種の中身（spec.md 1.5）。**PCのサイドバーとモバイルのシートで同じものを使う。**
 *
 * 幅の狭い場所に縦積みで入る前提で、`FilterSelect` / `FilterToggleGroup` を
 * そのまま縦に並べているだけにしてある。器（サイドバーかシートか）は外側が決める。
 *
 * **並びは 業種 → 従業員数 → 平均年齢 → 在籍年数**（U13、アートボード 5a）。
 * 会社を思い浮かべるときに先に出てくる順（何をしている会社か → どれくらいの
 * 規模か → どんな人が居るか）に合わせてある。
 */
export function RankingFilters({ state, onChange, industries }: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <FilterSelect
        label="業種"
        value={state.industry}
        onChange={(industry) => onChange({ industry })}
        options={industries.map((industry) => ({ value: industry, label: industry }))}
      />
      <FilterToggleGroup
        label="従業員数"
        value={state.employeeSize}
        onChange={(employeeSize) =>
          onChange({ employeeSize: employeeSize as EmployeeSizeBucket | null })
        }
        options={EMPLOYEE_SIZE_OPTIONS}
      />
      <FilterToggleGroup
        label="平均年齢"
        value={state.avgAgeBucket}
        onChange={(avgAgeBucket) =>
          onChange({ avgAgeBucket: avgAgeBucket as AvgAgeBucket | null })
        }
        options={AVG_AGE_OPTIONS}
      />
      <FilterToggleGroup
        label="在籍年数"
        value={state.tenure}
        onChange={(tenure) => onChange({ tenure: tenure as TenureBucket | null })}
        options={TENURE_OPTIONS}
      />
    </div>
  );
}
