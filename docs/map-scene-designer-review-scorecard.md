# Map & Scene Designer review scorecard

Every Map & Scene release must be assessed from Player and Editor screenshots at desktop 16:9 before publishing.

| Gate | Pass condition | Evidence |
| --- | --- | --- |
| Group layout | Topic titles do not overlap another group; each SVG has at least 48px visual breathing room. | Desktop Player + Editor screenshot |
| Star placement | Every star centre sits on the visible guide, with no clipped hit target. | SVG mask check + screenshot |
| Connection integrity | No connection may cross transparent space outside its own SVG. If an SVG has disconnected islands, hide the edge and retain the numbered sequence badge. | Route-mask check |
| SVG readability | Artwork has distinct colour, at least 0.65 display opacity, a subtle glow, and a boundary less prominent than the artwork. | Light/Dark screenshot |
| Immediate interaction | Drag, Auto Layout, and SVG upload update the canvas in the same UI state; save must not temporarily revert to old positions. | Playwright interaction test |
| Performance | A guide mask is rasterized once per asset URL; routing retains the original SVG aspect ratio. | Route-mask cache test/profile |

## Release review — Map & Scene lighting groups

| Review area | Target | Result | Decision |
| --- | --- | --- | --- |
| Layout | Four lighting groups retain at least 48px between their transformed SVG bounds. | Nearest horizontal gap is 140px; nearest vertical gap is 273px in the 2400×1400 Map & Scene board. | Pass |
| Artwork mapping | Each sequence point is painted pixel, not transparent canvas. | 28/28 curated `data-star` markers raster-check at alpha ≥100. | Pass |
| Sequence | A marker order is the source of truth; pixel tracing must not reorder a curated guide. | Complete marker sequences: Heart 10, Starfish 8, GI 7, Softbox 3. | Pass |
| Connections | No direct line may cut across transparent SVG space. | Player and Editor suppress an unrouteable edge and keep a numbered badge on every guide star. | Pass |
| Readability | Colour artwork remains dominant; boundary is restrained, with glow only as separation. | SVGs render at 0.72 opacity; boundary is 2px / 52% cyan with a 10px soft glow. | Pass |
| Immediate interaction | Drag, Auto Layout, upload and save show the current draft without refresh/revert. | Playwright confirms immediate embedded Auto Layout and saved drag layout. | Pass |
| Drag performance | No route-mask raster during drag; no long task; under 1 second in the 16:9 benchmark. | 0 `getImageData` calls, 0 long tasks, 595ms (latest run). | Pass |

### Review notes

The automatic coloured-pixel trace was rejected for Game Icons: it can choose a narrow connected fragment rather than the intended learning route. Each shipped lighting SVG now contains a curated `data-star-markers` sequence, so a complete authored sequence always wins; colour tracing is retained only for uploaded SVGs that do not provide markers.

The Editor now uses the same full-source SVG transform as the Player. Moving one Star cannot resize or re-anchor its image/boundary, whereas dragging the whole cluster moves all three together. Pathfinding is deferred until pointer motion settles, raster masks are cached per asset URL, and its search yields to the browser in large connected silhouettes.

Evidence: Playwright tests `admin visual editor drags nodes and saves a straight-line layout batch`, `SVG auto layout treats complete data-star markers as the authored quest sequence`, `curated Map & Scene SVG markers remain on visible artwork`, `embedded SVG auto layout immediately moves Topic stars in the Discipline editor`, and `@perf embedded SVG boundary drag benchmark`.
