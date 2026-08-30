# Game Art & System constellation guide redesign

This redesign gives every topic in the **Game Art** and **System** skies its own
SVG guide.  A guide is meaningful artwork, not a card decoration: the authored,
ordered `data-star` markers sit on its opaque silhouette and define the star layout
used by the Player and Editor.

## Layout contract

- Stars follow the existing quest sequence (`position`, then id).  The migration
  changes only their visual coordinates; it does not reorder quests or alter their
  prerequisites/connections.
- Each guide has a transparent canvas and a coloured silhouette.  The constellation
  boundary is baked from that silhouette with the existing 30px breathing room.
- Every multi-star guide contains a complete, hidden `data-star-markers="curated"`
  sequence.  Auto Layout therefore uses the approved learning route instead of
  guessing from decorative SVG paths.
- Topics with no active stars still receive their artwork and baked silhouette so
  they are ready when stars are added.

## Guide assignments

| Sky | Topic | Guide | Visual idea |
| --- | --- | --- | --- |
| Game Art | Blender | `game-art-blender.svg` | Blender mark, looping from basics to UV |
| Game Art | Shader Graph | `game-art-shader-graph.svg` | Networked shader nodes |
| Game Art | UI | `game-art-ui.svg` | Window grid, read left-to-right then lower row |
| Game Art | Animation | `game-art-animation.svg` | Film spool, chronological arc |
| Game Art | Basic Particle System | `game-art-basic-particle.svg` | Sparkle field, staged outward progression |
| Game Art | Advance Particle System | `game-art-advance-particle.svg` | Rocket trail, launch-to-impact route |
| Game Art | Advance Blender | `game-art-advance-blender.svg` | Cube workspace |
| Game Art | Sound | `game-art-sound.svg` | Sound-wave progression |
| Game Art | Light | `game-art-light.svg` | Light bulb |
| Game Art | GodRay | `game-art-godray.svg` | Sun beams |
| System | C# Nard | `system-csharp-nard.svg` | Processor foundations |
| System | C# Dev L1 | `system-csharp-dev-l1.svg` | CPU learning circuit |
| System | Dev L2 | `system-dev-l2.svg` | Interlocking production gears |
| System | Lv.2 C# For Nerd | `system-csharp-nerd-l2.svg` | Brain / deeper programming |
| System | Lv.2 C# For Unity Dev | `system-csharp-unity-l2.svg` | Data stack |
| System | Lv.3 C# For Unity Dev | `system-csharp-unity-l3.svg` | Event bell |
| System | Lv.3 C# For Nerd | `system-csharp-nerd-l3.svg` | Array hierarchy |
| System | Lv.4 C# For Unity Dev | `system-csharp-unity-l4.svg` | Scriptable-object cube |
| System | Dev L3 | `system-dev-l3.svg` | Tooling gear route |
| System | Dev L4 | `system-dev-l4.svg` | Pathfinding journey |
| System | Dev L5 | `system-dev-l5.svg` | Inventory backpack |

All source artwork is from Game-icons.net under CC BY 3.0; full creator credits are
kept beside the assets in `frontend/public/constellation-guides/NOTICE.md`.
