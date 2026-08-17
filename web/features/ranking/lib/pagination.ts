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
