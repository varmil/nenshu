export type PaginationItem = number | "ellipsis";

/**
 * ページネーションUIに表示するページ番号の並びを計算する。
 * 先頭・末尾・現在ページの前後1ページを表示し、間が空く箇所は"ellipsis"にする。
 */
export function getPaginationRange(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 0) return [];

  const SIBLING_COUNT = 1;
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let i = currentPage - SIBLING_COUNT; i <= currentPage + SIBLING_COUNT; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PaginationItem[] = [];
  let prev: number | null = null;
  for (const page of sorted) {
    if (prev !== null && page - prev > 1) result.push("ellipsis");
    result.push(page);
    prev = page;
  }
  return result;
}

/**
 * 「2,961社 中 1〜30社目」の数字（spec.md 1B）。
 *
 * ページ番号は `buildRankedCompanies` と同じ規則で総ページ数にクランプする——
 * 範囲外のページを直接開いても、件数表示だけが空ページを指す状態にしない。
 */
export function pageRange(
  page: number,
  totalCount: number,
  pageSize: number
): { from: number; to: number; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  if (totalCount === 0) return { from: 0, to: 0, page: current, totalPages };
  return {
    from: (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, totalCount),
    page: current,
    totalPages,
  };
}
