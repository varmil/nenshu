import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "design-system";

// Real usage (ranking table pagination): custom Japanese text on
// previous/next, an ellipsis for skipped page ranges, current page marked
// isActive. Links use plain hrefs (real app also wires onClick to avoid a
// full navigation — omitted here since it needs no static content change).
export function InContext() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious text="前へ" aria-label="前のページへ" href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">4</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            5
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">6</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">19</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext text="次へ" aria-label="次のページへ" href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
