## Setup

No provider/wrapper needed — these are self-contained Base UI primitives
(`@base-ui/react`), not a themed component kit. Just load `styles.css` +
`_ds_bundle.js` and use components directly.

**Dark mode is a class on `<html>`, not a runtime provider or prop.** Add
`class="dark"` to `<html>` to switch — every component reads color via CSS
variables that flip under `.dark`. There is no `theme="dark"` prop anywhere.

**`Select`: always pass `items`.** `<Select items={[{value,label}, ...]}>`
lets the trigger show the correct label immediately. Omit it and a closed
select with a pre-selected value shows the raw `value` string instead of
the label until the popup has opened once — a real bug this sync found
live in production (see `.design-sync/NOTES.md`). Never compose `Select`
without `items`.

## Styling idiom: Tailwind utility classes over CSS-variable tokens

No CSS-in-JS, no theme object — plain Tailwind classes that resolve to
`var(--token)`. Never write a raw hex or oklch value; use the class family:

| Purpose | Classes |
|---|---|
| Primary action / brand | `bg-primary text-primary-foreground` |
| Secondary surface | `bg-secondary text-secondary-foreground` |
| Neutral/hover surface | `bg-muted text-muted-foreground` |
| Card surface | `bg-card text-card-foreground` |
| Destructive | `bg-destructive text-destructive-foreground` (also `bg-destructive/10 text-destructive` for a soft tint, used by `Badge`/`Button` destructive variants) |
| Borders / focus ring | `border-border`, `ring-ring` |
| Corners | `rounded-lg` (default), `rounded-md`, `rounded-xl`, `rounded-4xl` (`Badge` pill shape) |
| Type scale | `text-xs` … `text-4xl` (custom scale, not Tailwind's default) |
| Font stacks | `font-sans` (Japanese-first OS stack — see below), `font-mono` |

**Primary is reserved for navigation, never for data.** This DS's own rule
(`design-system/design-system.md`): `bg-primary`/`text-primary` marks
things a user can click or the currently-selected tab/filter — links,
buttons, `ToggleGroupItem`'s selected state. It is never used to emphasize
a data value (a number, a metric) — size/weight carry that instead. Compose
accordingly: don't reach for `text-primary` to make a number "pop."

**Selected-state toggles need an explicit override.** `Toggle`/
`ToggleGroupItem`'s built-in selected look (`data-[state=on]:bg-muted`) is
a barely-visible grey by design (it's meant to be themed by the consuming
app). For a clearly-selected tab/filter, add all four of:
`data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground`
(both `data-[state=on]` and `aria-pressed` variants, and their `hover:`
pairs — this DS's primitive sets the same default on both attributes, and
without the `hover:` override a selected tab flashes back to grey on
mouseover).

**Fonts are OS-only, by design — never add a webfont.** `font-sans`
resolves to a Japanese-first system stack (Hiragino/Meiryo/Noto Sans CJK
JP/Arial). This is deliberate (zero webfont requests); do not introduce
`next/font` or any `@font-face`.

**Spacing:** arbitrary `gap-(--space-md)`/`p-(--space-lg)` syntax only —
`--space-*` tokens (`xs`/`sm`/`md`/`lg`/`xl`/`2xl`) are intentionally kept
out of Tailwind's `--spacing-*` scale (adding them there previously broke
unrelated utilities like `max-w-md`), so classes like `gap-md` do **not**
exist. Use Tailwind's ordinary numeric spacing (`gap-2`, `p-4`) for
everything else.

## Where the truth lives

All token/utility CSS lives in the bound `_ds_bundle.css` (reachable via
`styles.css`'s `@import` chain) — read it before styling anything ambiguous.
Per-component `components/<group>/<Name>/<Name>.prompt.md` has real usage
examples ported from this app's actual pages.

## Example

```jsx
const { Card, CardHeader, CardContent, Badge } = window.OpenReportDS;

<Card className="max-w-sm">
  <CardHeader>
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground">平均年収</span>
      <Badge variant="secondary">推定</Badge>
    </div>
    <p className="text-4xl font-bold">1,642万円</p>
  </CardHeader>
  <CardContent>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">全体順位</dt><dd className="font-medium">3位</dd></div>
    </dl>
  </CardContent>
</Card>
```
