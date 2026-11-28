# React Renderer Catalog

`react_catalog.json` is the A2UI v0.8 component catalog subset that `@a2ui/react` currently registers in `renderMap`.

Component schemas are copied from [`../../standard_catalog_definition.json`](../../standard_catalog_definition.json). Only types with a working React renderer are kept. `Button.action` adds a **localUpdate** extension (not part of the stock 0.8 wire format).

## Supported (15)

| Component | Notes |
| --- | --- |
| `Text` | Bound `text` + `usageHint` |
| `Image` | Bound `url` / `altText` |
| `Icon` | Bound `name` |
| `Video` | Bound `url` |
| `AudioPlayer` | Bound `url` / `description` |
| `Column` | `explicitList` or `template` children |
| `List` | `explicitList` or `template` children; `direction` / `alignment` |
| `Card` | Single `child` reference |
| `Button` | `child` + `action`; see localUpdate below |
| `Divider` | `axis` |
| `CheckBox` | Bound `label` / `value` |
| `TextField` | Bound `label` / `text` |
| `DateTimeInput` | Bound `value` |
| `MultipleChoice` | Bound `selections` + `options` |
| `Slider` | Bound `label` / `value` |

## Button `action` extension

Stock A2UI 0.8 only supports click → `userAction` → server → `dataModelUpdate`. Local model writes are not on the wire.

React catalog extends `Button.action`:

| Field | Meaning |
| --- | --- |
| `type` | `server` (default) or `localUpdate` |
| `dataModelUpdate` | When `type` is `localUpdate`: `{ path?, contents }` — same shape as server→client `dataModelUpdate` **without** `surfaceId` |

On click, `@a2ui/react` calls `applyDataModelUpdate(surfaceId, path, contents)` and does **not** emit `userAction`. `type: "server"` is reserved; not wired in this phase.

## Not yet supported

These remain in the standard catalog but are not registered in `@a2ui/react` `renderMap`:

- `Row`
- `Tabs`
- `Modal`

## Usage

Point `beginRendering.catalogId` at:

```text
https://a2ui.org/specification/v0_8/catalogs/react/react_catalog.json
```
