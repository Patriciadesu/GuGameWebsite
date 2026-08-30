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

## Current assessment

The automatic coloured-pixel trace was rejected for the Game Icons artwork because it selected a narrow connected fragment rather than a visually balanced route. Production positions remain on the reviewed hand-arranged layout. Route fallback lines are suppressed outside SVG guides, and every topic star now carries a sequence badge so the learning order remains clear.
