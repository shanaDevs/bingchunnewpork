# Delivery feature history

This folder records **delivery only**: the delivery service, the delivery ops frontend, and the paths that open them from the main app or core backend.

Menu, stock, promos, storefront checkout, and the rest of the main admin stay in the numbered docs under `docs/`. They are not copied here.

## Files

| File | Role |
|------|------|
| [2026-10-16-baseline.md](2026-10-16-baseline.md) | Full delivery feature list as of 2026-10-16 |
| `YYYY-MM-DD-short-slug.md` | One later update. Added, changed, and removed only |

The baseline is the inventory. Do not edit it to absorb later work. Compare files in date order to see the history.

## When to add a file

Add a new file when a delivery feature is added, changed, or removed, or when a link between the main app and delivery changes. The project rule [`.cursor/rules/delivery-history.mdc`](../../.cursor/rules/delivery-history.mdc) requires that file in the same change. Do not edit the baseline or older records.

Name: `docs/delivery/YYYY-MM-DD-short-slug.md`

If two updates land on the same day, the slug keeps them separate.

## Template

```markdown
# YYYY-MM-DD — short title

**Date:** YYYY-MM-DD

## Added

-

## Changed

-

## Removed

-

## Links

| From | Opens |
|------|--------|
| | |
```

Leave a section out when it has nothing to say. Under **Links**, record only paths that changed: a main-app route, a delivery-console route, or a core `/api/delivery` path.
