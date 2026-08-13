# GuGame Full-System UI and Functional Audit

Date: 2026-08-12  
Mode: Read-only audit of the current worktree and mocked browser flows. No production data was mutated.

## Goals

1. Preserve the current UX/UI direction while identifying usability regressions.
2. Verify functional correctness across player and administrator workflows.
3. Separate confirmed defects, security risks, test instability, and missing coverage.

## Review Teams

| Team | Scope | Quality control |
| --- | --- | --- |
| UX/UI | Visual hierarchy, responsive layouts, theme consistency, editor complexity | Repro steps plus rendered or source evidence |
| Functional QA | Authorization, progression, graph CRUD, quest editing, shop and inventory | Expected-versus-actual behavior and code-path evidence |
| Accessibility | Keyboard, focus, dialogs, zoom, motion, touch, assistive semantics | Runtime probes plus standards-based interaction checks |
| Governance | Secrets, data integrity, deployment, CI and release risk | Independent cross-review and false-positive screening |

## Release Decision

**Blocked until the P0 security issue is remediated.** The application is already deployed, so credential rotation and production test-login shutdown are urgent.

## Confirmed Findings

### P0 - Immediate

- A populated `backend/.env` is tracked in Git history and includes production-shaped credentials. Rotate and revoke all affected credentials, remove the file from history, and provision secrets outside Git.
- The test-login route can create a session for an arbitrary existing user when its key is known. Disable the route structurally in production; do not rely on key secrecy or URL query parameters.

### P1 - High

- Player mutation endpoints do not consistently enforce active-map visibility and exact topic-level eligibility. Unlock, step completion, and approval requests can bypass the restrictions used by read endpoints.
- Cookie-authenticated mutations have no CSRF token or strict mutation-level Origin validation while production cookies use `SameSite=None`.
- Revoked Discord administrators may retain cached database privileges for the session lifetime.
- Remote item grants are not idempotent. A successful remote grant followed by a timeout can be retried and duplicated after local rollback.
- Changing a discipline constellation type can leave child topics with a conflicting type.
- Dark-theme Inspector surfaces remain light while inheriting light text, making labels and empty states unreadable.
- The mobile Inspector opens expanded over the canvas and can obscure more than half of the editing area.
- Several legacy Admin overlays are generic containers rather than accessible modal dialogs: focus is not moved or trapped, Escape is unsupported, and focus is not restored.
- The repository deployment script replaces the live frontend in place, performs a shallow health check, and has no automatic rollback.

### P2 - Medium

- Connection CRUD accepts self-links, nonexistent targets, and cross-map links, allowing invalid progression graphs.
- Shop item deletion can orphan purchase and fiction records.
- Newly created quest steps use index-based fallback identities; deleting or reordering steps can transfer completion state to another step.
- Saving quest details and topic level uses separate requests and can leave a partial save.
- Keyboard-opened star context menus do not receive focus or support standard arrow-key navigation.
- At minimum zoom, constellation wheel handlers still cancel scrolling and trap the page.
- Constellation dialogs trap keyboard focus but do not make background content inert for assistive navigation.
- The global theme toggle renders above modal backdrops and remains interactive while dialogs are open.
- The normal frontend visual-test command excludes inventory and shop test files.
- High-risk backend routes and external inventory behavior are not part of a mandatory test or CI gate.

### P3 - Low / Clarify

- Mobile utility typography reaches 8-9 px in inventory, player dock, and shop metadata.
- Any authenticated user can switch guild directly. Confirm whether this is intended beyond initial onboarding.
- Topic visibility filtering happens after pagination and can produce sparse pages.
- The browser suite is order-sensitive: two full-suite timeouts passed on isolated repeated runs.

## Verified Behavior

- Player constellation hierarchy, role geometry, arrows, progression states, locked explanations, and media fallbacks passed mocked browser checks.
- Current and next-topic presentation, Main/Skill separation, selection, grouped movement, layout save, import, edit, render, and cascade-delete UI paths are covered.
- Keyboard activation, focus restoration for newer dialogs, `Ctrl+S`, `Ctrl+B`, undo, Tab/Shift+Tab editing, reduced motion, touch pan, zoom anchoring, reset, and camera restoration passed.
- Login, player constellation, shop, inventory, HamsterLink, and StarMaster import render coherently in both themes, except the Admin Inspector issue above.
- No document-level horizontal overflow was reproduced on player routes at 320 px and 390 px.
- Backend unit tests: 27 passed. The destructive Mongo transaction suite was not run without an isolated database.
- Full frontend Playwright run: 47 passed and 2 timed out. Both timed-out cases passed twice when rerun in isolation.
- Frontend and backend TypeScript checks passed.

## Required Regression Gates

1. Add an HTTP authorization matrix for every player/admin mutation route.
2. Add CSRF, role-revocation, topic-level mutation, graph-integrity, and quest-step identity tests.
3. Test real map/skill/connection CRUD against an isolated database.
4. Add purchase idempotency and external-service timeout/reconciliation tests.
5. Make one CI command run unit, integration, API, all Playwright specs, and production builds.
6. Add dark Inspector, mobile bottom-sheet, modal isolation, context-menu keyboard, and wheel-boundary regression checks.

## Recommended Fix Order

1. Rotate secrets and remove production test-login access.
2. Close authorization and CSRF gaps.
3. Protect purchase idempotency and graph/data integrity.
4. Repair Admin modal behavior, dark Inspector, and mobile Inspector.
5. Stabilize and enforce the complete automated test suite.
6. Replace the repository deployment script with atomic release switching, deep health checks, and rollback.

## Remediation Update - 2026-08-13

Scope: Desktop only. Mobile-specific Inspector and responsive behavior were explicitly excluded.

### Fixed In The Worktree

- Production no longer registers test-login. Development test-login is POST-only and reads its key from a header, not a URL.
- Cookie-authenticated mutations validate Origin/Referer against an allowed origin.
- Player constellation mutations enforce active skill maps and exact topic/user level.
- Individual and bulk connection writes reject self-links, duplicates, missing targets, and cross-map targets.
- Privileged routes revalidate Discord roles through a five-minute cache and fail closed when production verification is unavailable.
- Quest steps receive immutable UUID-backed external IDs and preserve identities during editing and reordering.
- Parent/child constellation type integrity has a reusable validation guard.
- External purchases use a durable operation ledger, browser-persisted operation keys, non-repeating pending behavior, and Super Admin reconciliation endpoints.
- Shop item deletion now retires the item while preserving purchase and fiction history.
- Dark desktop Inspector contrast, legacy Admin modal behavior, theme isolation, keyboard context menus, and wheel-boundary scrolling are fixed.
- The frontend default test command runs every Playwright spec.
- The deployment script now stages atomic releases, performs deeper checks, and rolls back failed activation.
- `backend/.env` was removed from the Git index while the local ignored file was preserved.

### Verification

- Backend unit tests: 43 passed.
- Mongo integration tests: 14 passed.
- Full frontend Playwright suite: 53 passed.
- Independent desktop UX verification: 26 focused runs passed at 1440x1000 and 1024x768.
- Backend and frontend production builds passed.
- Shell syntax and `git diff --check` passed.

### External Actions Still Required

- Rotate and revoke every credential that was previously committed.
- Rewrite or purge the secret-bearing file from Git history, then coordinate a forced update for every clone and deployment source.
- Add true idempotency enforcement to the HamsterQuest inventory grant endpoint. GuGame currently avoids automatic retries and exposes reconciliation because the remote endpoint does not enforce the forwarded key.
