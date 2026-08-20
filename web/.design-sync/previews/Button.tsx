import { Button } from "design-system";
import { Moon, Sun, Search } from "lucide-react";

// Real usage in this app: an icon-only ghost button (theme toggle), and a
// search-triggering default button. Both icon + sr-only text, no bare icon
// buttons without an accessible name.
export function InContext() {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" aria-label="ダークモードに切り替える">
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </Button>
      <Button variant="default" size="default">
        <Search />
        検索
      </Button>
    </div>
  );
}

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="default">default</Button>
      <Button variant="secondary">secondary</Button>
      <Button variant="outline">outline</Button>
      <Button variant="ghost">ghost</Button>
      <Button variant="destructive">destructive</Button>
      <Button variant="link">link</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">xs</Button>
      <Button size="sm">sm</Button>
      <Button size="default">default</Button>
      <Button size="lg">lg</Button>
      <Button size="icon" aria-label="検索">
        <Search />
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled>default</Button>
      <Button variant="outline" disabled>
        outline
      </Button>
    </div>
  );
}
