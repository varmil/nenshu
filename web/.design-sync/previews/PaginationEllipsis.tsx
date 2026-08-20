import { PaginationEllipsis, PaginationItem } from "design-system";

// A bare icon glyph on transparent background is inherently a tiny render —
// shown inside its real container (PaginationItem, as used in
// Pagination's own preview) with a visible border so the card isn't blank.
export function InContext() {
  return (
    <div className="flex w-fit items-center rounded-lg border border-border p-1">
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
    </div>
  );
}
