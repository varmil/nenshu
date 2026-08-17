import type { AvgAgeBucket, EmployeeSizeBucket, TenureBucket } from "../types";

export const EMPLOYEE_SIZE_OPTIONS: { value: EmployeeSizeBucket; label: string }[] = [
  { value: "under300", label: "〜300人" },
  { value: "300to1000", label: "300〜1,000人" },
  { value: "1000plus", label: "1,000人以上" },
];

export const TENURE_OPTIONS: { value: TenureBucket; label: string }[] = [
  { value: "under13", label: "〜13年" },
  { value: "13to17", label: "13〜17年" },
  { value: "17plus", label: "17年以上" },
];

export const AVG_AGE_OPTIONS: { value: AvgAgeBucket; label: string }[] = [
  { value: "under40", label: "〜40歳" },
  { value: "40to43", label: "40〜43歳" },
  { value: "43plus", label: "43歳以上" },
];
