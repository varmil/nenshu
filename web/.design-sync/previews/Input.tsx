import { Input } from "design-system";

// Real usage (free-word company search): type="search", a short realistic
// placeholder, an explicit aria-label since the visible label is a separate
// element next to it.
export function InContext() {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden className="text-sm text-muted-foreground">
        会社名で検索
      </span>
      <Input
        type="search"
        aria-label="会社名で検索"
        placeholder="例: 商船三井"
        defaultValue=""
        className="w-40"
      />
    </div>
  );
}

export function Disabled() {
  return <Input placeholder="例: 商船三井" disabled className="w-40" />;
}
