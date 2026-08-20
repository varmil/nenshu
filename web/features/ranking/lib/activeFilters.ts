import { AVG_AGE_OPTIONS, EMPLOYEE_SIZE_OPTIONS, TENURE_OPTIONS } from "./filterOptions";
import type { RankingState } from "../types";

export interface ActiveFilter {
  /** 解除したときに `RankingState` へ当てる差分。 */
  patch: Partial<RankingState>;
  label: string;
  /** 「業種」「従業員数」など。読み上げ用の前置き。 */
  group: string;
}

const label = (options: { value: string; label: string }[], value: string | null) =>
  options.find((o) => o.value === value)?.label ?? null;

/**
 * いま効いている絞り込みの一覧（サイドバー上部の「適用中」チップ）。
 *
 * **表示基準（`targetAge`）・並び替え・ページは含めない。** これらは常にどれかの値を
 * 持っていて「解除する」という操作が無く、チップに混ぜると「すべて解除」の意味が
 * 曖昧になる。検索語は含める——絞り込みの一種で、解除もできる。
 */
export function activeFilters(state: RankingState): ActiveFilter[] {
  const filters: ActiveFilter[] = [];
  if (state.industry !== null) {
    filters.push({ patch: { industry: null }, label: state.industry, group: "業種" });
  }
  const emp = label(EMPLOYEE_SIZE_OPTIONS, state.employeeSize);
  if (emp) filters.push({ patch: { employeeSize: null }, label: emp, group: "従業員数" });
  const ten = label(TENURE_OPTIONS, state.tenure);
  if (ten) filters.push({ patch: { tenure: null }, label: ten, group: "在籍年数" });
  const aage = label(AVG_AGE_OPTIONS, state.avgAgeBucket);
  if (aage) filters.push({ patch: { avgAgeBucket: null }, label: aage, group: "平均年齢" });
  if (state.query !== "") {
    filters.push({ patch: { query: "" }, label: `「${state.query}」`, group: "検索" });
  }
  return filters;
}

/** 「すべて解除」で当てる差分。表示基準と並び替えは残す。 */
export const CLEAR_ALL_FILTERS: Partial<RankingState> = {
  industry: null,
  employeeSize: null,
  tenure: null,
  avgAgeBucket: null,
  query: "",
};
