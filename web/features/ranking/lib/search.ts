const CORPORATE_FORM_PATTERN = /(株式会社|\(株\)|㈱|有限会社|合同会社)/g;

/**
 * NFKC正規化（全角英数→半角、半角カナ→全角カナを同時に満たす）→ 法人格除去 → 小文字化 → 空白除去。
 */
export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(CORPORATE_FORM_PATTERN, "")
    .toLowerCase()
    .replace(/\s/g, "");
}

export function matchesQuery(name: string, query: string): boolean {
  if (query === "") return true;
  return normalizeCompanyName(name).includes(normalizeCompanyName(query));
}
