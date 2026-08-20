import { ToggleGroup, ToggleGroupItem } from "design-system";
// The shadcn default selected state (`data-[state=on]:bg-muted`) is a barely
// visible grey — every real call site in this app overrides it with Primary
// via this shared class (see design-system/design-system.md "Primaryの役割").
// Ported here rather than reinvented so the preview shows what selection
// actually looks like in production, not the primitive's undercooked default.
import { TAB_TOGGLE_SELECTED_CLASS } from "@/features/ranking/components/tabToggleClass";

// Real usage (age switch): single-select tabs, one age highlighted.
export function AgeSwitch() {
  const ages = [25, 30, 35, 40, 45, 50, 55, 60];
  return (
    <ToggleGroup aria-label="目標年齢" value={["35"]}>
      {ages.map((age) => (
        <ToggleGroupItem
          key={age}
          value={String(age)}
          aria-label={`${age}歳`}
          className={TAB_TOGGLE_SELECTED_CLASS}
        >
          {age}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// Real usage (実測値/年齢そろえ switch): a two-option toggle.
export function TwoOption() {
  return (
    <ToggleGroup aria-label="表示基準" value={["age"]}>
      <ToggleGroupItem value="raw" className={TAB_TOGGLE_SELECTED_CLASS}>
        実測値
      </ToggleGroupItem>
      <ToggleGroupItem value="age" className={TAB_TOGGLE_SELECTED_CLASS}>
        年齢そろえ
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
