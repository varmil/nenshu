import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "design-system";

// Real usage (industry filter): a trigger with a placeholder, an "all"
// option first, then domain options (TSE33 industry sector names).
//
// IMPORTANT: pass `items` to Select — without it, base-ui can't resolve a
// value to its label until the popup has mounted at least once, so a
// closed select showing a pre-selected value renders the raw value string
// instead of its label. This app's own FilterSelect omits `items` and hits
// exactly that bug in production (industry filter shows "__all__" instead
// of "すべて" until opened) — see .design-sync/NOTES.md.
const items = [
  { value: "all", label: "すべて" },
  { value: "electric", label: "電気機器" },
  { value: "bank", label: "銀行業" },
  { value: "retail", label: "小売業" },
];

export function Closed() {
  return (
    <Select items={items} defaultValue="all">
      <SelectTrigger aria-label="業種">
        <SelectValue placeholder="すべて" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Popup content only renders while open — shown open (defaultOpen) so the
// list styling (selected check, hover) is visible in a static preview.
export function Open() {
  return (
    <Select items={items} defaultValue="electric" defaultOpen>
      <SelectTrigger aria-label="業種">
        <SelectValue placeholder="すべて" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
