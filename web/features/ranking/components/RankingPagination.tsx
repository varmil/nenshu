"use client";

import { useTransition } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/design-system/ui/pagination";
import { buildSearchParams } from "../lib/urlState";
import { scrollToPageTop } from "../lib/scroll";
import { getPaginationRange } from "../lib/pagination";
import { PAGE_SIZE } from "../types";
import type { RankingState } from "../types";

/**
 * ページ送りはクライアント側で完結させる（ネットワーク非発生）。
 * `<PaginationLink>`の`href`は現在のフィルタを保持した完全なクエリ文字列にしており、
 * クロールされれば直接そのURLがSSRで正しく返る。クリック時だけpreventDefaultして
 * pushState経路（`useRankingState`のstate更新）に乗せる。
 *
 * 「読み込み中」の表現は`useTransition`のisPendingを使う。ページ内の再描画は
 * 通常一瞬で終わるため、実際に目に見える保留状態にならないことが多い
 * （`docs/ranking/ranking-pagination/design.md`参照）。
 */
export function RankingPagination({
  state,
  totalCount,
  onPageChange,
}: {
  state: RankingState;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (totalPages <= 1) return null;

  /**
   * 範囲外の `page` は総ページ数に丸める。行の描画（`buildRankedCompanies`）と
   * 件数表示（`pageRange`）は既に丸めているので、ここだけ生の `state.page` を
   * 使っていると表示と番号がずれる。
   *
   * **丸めないと無限のクロール空間になる。** `?page=999` は200で最終ページの
   * 7社を返しつつ `?page=998` と `?page=1000` へのリンクを出しており、
   * クローラが `?page=1001`・`?page=1002`… とどこまでも歩いてしまう（実測）。
   */
  const current = Math.min(Math.max(1, state.page), totalPages);

  const hrefFor = (page: number) => {
    const qs = buildSearchParams({ ...state, page }).toString();
    return qs ? `?${qs}` : "/";
  };

  /**
   * 端では自分自身に向ける。`aria-disabled` と `pointer-events-none` は
   * **クローラには効かない**——`href` があれば辿るので、`?page=0` や
   * `?page={totalPages + 1}` を出さないこと自体で防ぐ。
   */
  const prevHref = current <= 1 ? hrefFor(current) : hrefFor(current - 1);
  const nextHref = current >= totalPages ? hrefFor(current) : hrefFor(current + 1);

  const goTo = (page: number) => {
    if (page < 1 || page > totalPages || page === current) return;
    startTransition(() => onPageChange(page));
    // 押した位置は表の下（1ページぶん下）なので、そのままだと入れ替わった行が
    // 視界に入らない。ページが実際に変わるときだけ最上部へ戻す（Issue #96）。
    scrollToPageTop();
  };

  return (
    <nav aria-label="ページネーション" className="flex flex-col items-center gap-1">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text="前へ"
              aria-label="前のページへ"
              href={prevHref}
              aria-disabled={current <= 1}
              className={current <= 1 ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => {
                e.preventDefault();
                goTo(current - 1);
              }}
            />
          </PaginationItem>
          {getPaginationRange(current, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  href={hrefFor(item)}
                  isActive={item === current}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(item);
                  }}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <PaginationNext
              text="次へ"
              aria-label="次のページへ"
              href={nextHref}
              aria-disabled={current >= totalPages}
              className={current >= totalPages ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => {
                e.preventDefault();
                goTo(current + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      {isPending && (
        <span role="status" className="text-muted-foreground text-xs">
          読み込み中…
        </span>
      )}
    </nav>
  );
}
