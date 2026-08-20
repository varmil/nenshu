import { Toggle } from "design-system";
import { Star } from "lucide-react";

// No standalone Toggle exists anywhere in this app yet (only ToggleGroup is
// used, for tab-style single-select). This is a plausible generic use — a
// bookmark/favorite toggle — composed from the primitive's own API, not
// ported from a real call site.
export function PressedStates() {
  return (
    <div className="flex items-center gap-2">
      <Toggle aria-label="お気に入りに追加" defaultPressed={false}>
        <Star />
      </Toggle>
      <Toggle aria-label="お気に入りに追加" defaultPressed>
        <Star />
      </Toggle>
    </div>
  );
}

export function Variants() {
  return (
    <div className="flex items-center gap-2">
      <Toggle variant="default" defaultPressed>
        default
      </Toggle>
      <Toggle variant="outline" defaultPressed>
        outline
      </Toggle>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex items-center gap-2">
      <Toggle size="sm" defaultPressed>
        sm
      </Toggle>
      <Toggle size="default" defaultPressed>
        default
      </Toggle>
      <Toggle size="lg" defaultPressed>
        lg
      </Toggle>
    </div>
  );
}
