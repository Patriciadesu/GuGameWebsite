# Constellation Performance Optimization — v1.0.31

Date: 2026-08-30

## Goal

Remove real-time SVG boundary rasterization from constellation editing. The editor must keep a smooth drag interaction while preserving the same unique, image-following boundary in both the player and editor.

## Performance target

The 30-pointer-step embedded-constellation drag benchmark must meet all of these conditions:

- Canvas `getImageData` calls during drag: **0**
- Browser long tasks during drag: **0**
- Interaction duration: **less than 1,000 ms**

## Performance matrix

| Metric | Before | Target | After |
| --- | ---: | ---: | ---: |
| `getImageData` calls during drag | 60 | 0 | 0 |
| Long tasks | 60 | 0 | 0 |
| Total long-task time | 11,185 ms | 0 ms | 0 ms |
| 30-step drag duration | 12,301.5 ms | < 1,000 ms | 660.7 ms average |
| Repeated-run maximum | — | < 1,000 ms | 743.2 ms |
| Repeated-run best | — | — | 599.9 ms |

The average measured interaction time is 94.6% lower than the original baseline. Five repeated optimized runs were 681.7, 623.4, 599.9, 743.2, and 655.4 ms.

## Architecture change

- SVG alpha/color analysis now runs only when Auto Layout creates or updates the guide.
- The resulting smooth boundary path, source bounds, asset URL, and generation timestamp are saved in `visualTheme.bakedBoundary`.
- Player and editor render the saved path with a transform; dragging no longer reads or analyzes image pixels.
- Existing SVG images use an in-memory image promise cache.
- Embedded group drag state remains local during pointer movement. Child and gateway positions are committed to the parent once on pointer release instead of once per pointer event.
- A guarded migration command bakes existing constellation maps and writes a backup before applying changes.

## Existing-data migration

Three existing SVG constellation maps were baked. The pre-migration data backup is stored at:

`backend/migration/checkpoints/20260830-boundaries-before-bake.json`

Migration command:

```bash
npm run migrate:baked-boundaries -- --input=/absolute/path/to/baked-boundaries.json --apply --confirm=APPLY_BAKED_CONSTELLATION_BOUNDARIES --backup=/absolute/path/to/backup.json
```

Without `--apply` and the exact confirmation token, the command is a dry run.

## Verification

- TypeScript checks for frontend and backend
- Focused Playwright regression coverage for SVG Auto Layout, editor position persistence, player rendering, reduced motion, and the performance budget
- The performance test fails if rasterization or long tasks return, or if the interaction exceeds 1,000 ms
