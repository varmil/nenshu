import { Badge } from "design-system";

// Real usage in this app: only "outline" (本社のみ = "head office only") and
// "secondary" (推定 = "estimated") appear, always short Japanese labels next
// to a company name or salary figure. The other variants exist in the
// primitive's CVA but aren't used yet — shown here so the full API is visible.
export function InContext() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">本社のみ</Badge>
      <Badge variant="secondary">推定</Badge>
    </div>
  );
}

export function AllVariants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="outline">outline</Badge>
      <Badge variant="ghost">ghost</Badge>
      <Badge variant="link">link</Badge>
    </div>
  );
}
