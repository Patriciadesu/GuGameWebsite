# Main Quest User Experience Research

Date: 2026-08-14
Status: Research record — no implementation decisions in this document

## Purpose

This document preserves two rounds of read-only user-simulation research for GuGame. Eleven subagents reviewed the Main Quest experience from the perspectives of first-time players, mobile users, Thai readers, users with mild low vision or reduced attention, keyboard and screen-reader users, visually demanding users, power users, and admin/content authors.

The audit covered:

- UX/UI layout, reading order, information focus, comprehension, and usability
- Styling, especially Dark Mode and cross-component visual consistency
- Motion, transitions, feedback, and reduced-motion behavior
- Interaction rules, especially the Star Lens Floating Dock
- Main Quest authoring, requirements, publishing, import, approval, and destructive actions

## Evidence and limitations

- Production responded successfully through nginx.
- Selected Main Menu scenarios were browser-tested with Playwright using authenticated API fixtures at desktop and `390×844` mobile viewports.
- The production Main Menu was not tested through a real Discord player account.
- Findings labelled **browser-verified** were observed in the fixture-driven browser flow.
- Findings labelled **source-confirmed** follow directly from current handlers, state, validation, or CSS.
- Findings labelled **source-inferred** require a dedicated fixture or real-device test before being treated as a confirmed defect.
- No production data or application source was changed during either research round.
- No P0 issue was found.

## Executive findings

### P1 — Interaction and focus

1. **Star Lens has no centralized dismissal and layering contract** — source-confirmed.
   - Outside clicks on non-Main-Quest content do not consistently close the Dock.
   - A Skill Quest modal can open without clearing the Main Quest Dock, creating two detail contexts.
   - The Dock and modal both register document-level Escape handlers, so one key can close multiple layers.
   - Browser Back has no Dock state and competes with legacy Constellation history handling.
   - Relevant code: `frontend/src/pages/MainMenu.tsx`, `frontend/src/components/StarLensDock.tsx`, `frontend/src/components/ConstellationTree.tsx`.

2. **Star Lens has no complete keyboard-focus contract** — keyboard opening browser-verified; remaining behavior source-confirmed.
   - Enter opens a Main Quest node successfully.
   - Focus does not move into the Dock and is not restored to the trigger when the Dock closes.
   - Nodes do not expose a stable `aria-controls`/`aria-expanded` relationship to the Dock.
   - Multiple Quest nodes become separate tab stops; a long path will create a long keyboard journey.
   - Important lifecycle changes such as submitted, pending, completed, and level-up lack a dedicated announcement contract.

3. **Clicking the selected Main Quest toggles the Dock closed** — source-confirmed.
   - This conflicts with the proposed outside-click model. Selecting the same Quest should keep it open.
   - Selecting another Main Quest already replaces Dock content and is mostly correct.

### P1 — Mobile and layout

4. **The mobile Main Quest path does not reveal its navigation model** — browser-verified at `390×844`.
   - The rail starts at the first Quest instead of the current Quest.
   - The canvas is at least 760px wide.
   - There is no swipe cue, edge gradient, pager, or scroll indicator.
   - The legend is hidden on mobile.
   - A higher-Level player must manually search for the current Quest.
   - Relevant code: `frontend/src/components/ConstellationTree.tsx` and `.css`.

5. **Star Lens reuses a desktop floating/draggable layout on mobile** — source-confirmed.
   - There is no mobile-specific breakpoint or bottom-sheet presentation.
   - The desktop image/content grid and horizontal footer increase cognitive load.
   - Requirements are expanded by default.
   - Saved desktop coordinates can influence small-screen placement.
   - The Dock can compete with horizontal rail gestures and bottom navigation.

6. **The current Quest is not the single visual focus** — browser-verified.
   - Level appears in the top bar, profile, Main Quest header, node, and current-Level badge.
   - The current Quest title is less prominent than repeated Level information.

### P1 — Status clarity and readability

7. **A current Quest can be rendered as Completed** — browser-verified with fixture data.
   - Direct-map status checks past Level or `unlockedSkillIds` before clearly resolving current/pending state.
   - Legacy or inconsistent progress can therefore contradict the header’s current Level.
   - Relevant code: `frontend/src/components/ConstellationTree.tsx`.

8. **Future Quest text is dimmed with the decorative node** — source-confirmed.
   - `.is-level-gated` applies grayscale and `opacity: 0.42` to star, core, label, and kicker.
   - Locked state should be conveyed through surface, border, icon, or label while preserving readable Quest name and Level.
   - This is a contrast risk, not a measured WCAG failure.

9. **Quest state relies too heavily on color and a distant legend** — source-inferred.
   - Completed, current, pending, and future states need local text or icons.
   - The legend is hidden on mobile, increasing dependence on color and opacity.

10. **Thai/English typography is visually inconsistent** — source-confirmed.
    - Main Quest and Star Lens mix Georgia, Times New Roman, Trebuchet, system fonts, and Noto Sans Thai.
    - Mixed Thai/Latin lines can use glyphs with different weight, baseline, and x-height.
    - Utility text as small as 10px carries progression information.

### P1 — Styling and Dark Mode

11. **Dark Mode is implemented as selector patches rather than a semantic theme system** — source-confirmed.
    - Components frequently hard-code Light Mode colors.
    - `ThemeToggle.css` overrides an expanding list of component selectors.
    - New components can easily fall through to Light Mode.
    - Relevant code: `frontend/src/components/ThemeToggle.css`.

12. **Dark Mode surface hierarchy is flat, while isolated Light surfaces remain** — browser-verified on Main Menu.
    - Canvas, sections, and page surfaces use similar navy values and visually merge.
    - The current-Level badge remains a bright Light Mode island.
    - The badge’s important secondary copy is only about 10px.

13. **Main Quest Editor remains a Light Mode island** — source-confirmed.
    - `.main-quest-editor*` uses hard-coded light background and text values.
    - Relevant code: `frontend/src/components/ConstellationAdmin.css`.

14. **Star Lens has a hard-coded navy/teal visual system** — source-confirmed.
    - It looks like a Dark Mode window in Light Mode and like a separate product in Dark Mode.
    - It does not consume shared semantic surface, text, border, focus, or status tokens.

15. **Status colors have no cross-product semantic contract** — source-inferred.
    - Main Quest, Star Lens, approval cards, and Dark Mode overrides define status presentation separately.

### P1 — Main Quest authoring and safety

16. **A Main Quest can be published with no Requirement** — source-confirmed from validation flow.
    - Main Quest requirements are display-only, so an empty published Quest can be submitted for Level Up.
    - Publishing should require at least one valid Requirement and show a readiness checklist.

17. **Deleting a Main Quest lacks an impact preview** — source-inferred destructive risk.
    - The editor confirms deletion but does not present pending approvals, completed progress, or player-history impact.
    - Archive/Unpublish should be the default action; destructive deletion should be exceptional.

### P2 — Authoring feedback and validation

18. **Duplicate Level validation arrives only after Save** — source-confirmed.
    - The backend correctly returns a conflict, but the editor should identify the conflicting Quest inline and suggest the next free Level.

19. **Requirement editing lacks an explicit unsaved-change contract** — source-inferred.
    - Adding, editing, removing, or reordering should expose Saving/Saved/Unsaved state.
    - Navigation should warn before discarding changes.
    - Editing published Requirements should explain player-impact or use content versioning.

20. **Import lacks a confirmed preflight experience** — source-inferred.
    - A preflight should show Create, Update, Skip, and Conflict outcomes before writing.
    - Partial-failure and rollback behavior require fixture testing.

21. **Approval feedback should emphasize the Level result** — backend-confirmed, UI partially confirmed.
    - Before approval: show `Player Level N → N+1`.
    - After approval: clearly announce the resulting Level to both admin and player.

### P2/P3 — Motion and automated coverage

22. **The Dock has an enter animation but no exit lifecycle** — source-confirmed.
    - Conditional unmount removes it before an exit transition can complete.
    - Replacing one Main Quest with another should not replay a full close/open animation.

23. **Reduced-motion support is partial rather than a shared policy** — source-confirmed.
    - Dock entrance and some tree transitions have local reduced-motion rules.
    - Smooth scrolling and other transitions are not governed by one motion token/policy.

24. **State changes rely on color more than semantic feedback** — source-confirmed.
    - Current → Pending → Completed needs restrained visual feedback and a status announcement.
    - Continuous pulsing or zooming is not recommended.

25. **The Main Quest Playwright scenario targets the removed Constellation structure** — browser-verified.
    - It still expects `.constellation-overview-item` and stops before current Star Lens interaction assertions.
    - Relevant test: `frontend/tests/constellation.visual.spec.ts`.

## Desired Star Lens interaction contract

### Keep the Dock open

- Scroll the page, Main Quest rail, or Requirements
- Drag or minimize the Dock
- Interact inside the Dock
- Select the currently selected Main Quest
- Select another Main Quest; replace content without closing and reopening
- Toggle Light/Dark Theme; retain selection, position, and focus while updating tokens

### Close the Dock

- Click or tap outside the Dock on anything that is not a Main Quest node
- Activate navigation or a control that changes application context
- Open a Skill Quest, modal, drawer, or other detail experience
- Press Escape when the Dock is the topmost layer
- Press Browser Back when opening the Dock was the latest interaction
- Leave Main Menu

### Proposed state model

- `Closed`
- `OpenExpanded`
- `OpenMinimized`
- `Dragging` (temporary, returning to the prior open state)
- `OtherOverlayActive` (Dock closed)
- `ContextExited` (Dock closed and selection cleared)

A single owner should manage selection, open state, minimized state, outside interaction, Escape priority, focus restoration, and history. Individual components should dispatch actions rather than independently mutating Dock state.

## Candidate semantic design tokens from user research

```css
/* Surfaces */
--color-canvas;
--color-surface-1;
--color-surface-2;
--color-surface-floating;
--color-surface-interactive;

/* Content */
--color-text-primary;
--color-text-secondary;
--color-text-muted;
--color-text-inverse;
--color-border-subtle;
--color-border-strong;
--color-focus-ring;

/* Brand and action */
--color-accent;
--color-accent-hover;
--color-accent-content;

/* Quest status */
--color-status-current;
--color-status-completed;
--color-status-pending;
--color-status-locked;
--color-status-danger;

/* Effects */
--color-overlay;
--shadow-raised;
--shadow-floating;
```

These are research inputs, not an approved design-system specification.

## Existing strengths

- Main Quest nodes can be opened with Enter.
- Selecting a different Main Quest replaces Dock content.
- Escape closes the Dock correctly when no higher-priority overlay is active.
- Submit closes the Dock before opening its confirmation modal.
- Scrolling does not close the Dock.
- Backend progression already prevents duplicate Main Quest Levels, restricts submission to the player’s current Level, and increments Level atomically on approval.
