# Main Quest UX/UI/Motion Improvement Plan

วันที่: 2026-08-14
สถานะ: Proposed implementation plan
Research input: `main-quest-user-experience-research-2026-08-14.md`
Design input: `main-quest-designer-critique-2026-08-14.md`

## Outcome

ปรับ Main Quest ให้เป็น Level-up journey ที่ผู้เล่นเข้าใจได้ทันที ใช้งานสอดคล้องกันบน pointer/touch/keyboard มี Light/Dark parity, responsive presentation ที่เหมาะกับอุปกรณ์, motion ที่อธิบาย state และ authoring flow ที่ป้องกันข้อมูลเสียหาย

แผนนี้ยังไม่ลงมือแก้โค้ด แต่กำหนด dependency, deliverable, acceptance criteria และ verification gate สำหรับการนำไป implement

## Product contract ที่ใช้เป็นฐาน

อ้างอิงคำตัดสินของเจ้าของผลิตภัณฑ์ในงานก่อนหน้า:

- Main Quest ไม่ใช่ Constellation และไม่มี Topic
- หนึ่ง Main Quest ต่อหนึ่ง Level
- Requirement เป็นข้อมูลให้ผู้เล่นอ่านและ Admin ใช้ตรวจ ไม่ใช่ step ที่ผู้เล่นกด Complete ทีละข้อ
- Player flow: เปิด Current Quest → อ่าน Requirement → Submit → Pending Review → Admin Approve/Reject
- Approval ของ Main Quest ไม่หัก AP และเพิ่ม `User.level` หนึ่งระดับแบบ atomic
- Player ส่งได้เฉพาะ Quest ที่ตรงกับ Level ปัจจุบัน
- Quest ที่ Publish ต้องมี Requirement ที่ valid อย่างน้อยหนึ่งรายการ
- Rejected request ต้องกลับมา Submit ใหม่ได้โดยไม่ทำลาย progression
- Pending request ต้องไม่เปลี่ยนเป็น Completed จนกว่า Admin จะ Approve

## North-star experience

ภายใน 5 วินาทีหลังเปิด Main Menu ผู้เล่นควรตอบได้ว่า:

1. ตอนนี้อยู่ Level ไหน
2. Main Quest ปัจจุบันชื่ออะไร
3. Quest นี้พาไป Level ไหน
4. สถานะคือ Current, Pending, Completed หรือ Future
5. ต้องทำ action อะไรต่อ

หน้า Main Quest ต้องมี primary action ที่มองเห็นได้เพียงหนึ่งจุดต่อสถานะ

## Approved design principles

1. Progression before visualization
2. One current state, one primary action
3. One active detail context
4. One interaction/layer owner
5. Status is shared data, not decoration
6. Status never depends on color alone
7. Desktop inspector; mobile bottom sheet
8. Theme parity through semantic tokens
9. Motion explains causality and is interruptible
10. Draft/Archive before Publish/Delete

## Corrected priority model

### P1 — Must fix before visual polish

- Current/Pending/Completed status precedence
- Publish readiness: Requirement อย่างน้อยหนึ่งรายการ
- Star Lens/Skill modal detail-context conflict
- Escape top-layer ownership
- Mobile Current Quest discovery
- Dark Mode Light islands และ unreadable Future Quest
- Stale Main Constellation Playwright coverage

### P2 — Required quality and scalability

- Outside-interaction classification
- Focus transfer/restoration และ concise announcements
- Semantic token migration/design-system debt
- Same-node Dock toggle
- Browser Back product decision
- Typography consistency
- Dirty state, inline Level conflict, Archive impact preview และ import preflight
- JavaScript reduced-motion parity

### P3 — Polish after lifecycle is correct

- Exit/replacement/minimize choreography
- Drag elevation feedback
- Advanced roving focus when Quest count grows
- Decorative visual refinements

## Target interaction model

### Persistent Star Lens state

```text
Closed
Open
├── Expanded
└── Minimized
```

### Transient interaction mode

```text
Idle
Dragging
Exiting
```

### Independent state

- `selectedQuestId`
- `inputModality`: pointer | touch | keyboard
- `focusOrigin`
- `overlayStack`
- `viewportMode`: desktop | tablet | mobile

### Interaction classification

| Event | Expected result |
|---|---|
| Select Main Quest while closed | Open selected Quest |
| Select same Main Quest | Keep current Dock state |
| Select another Main Quest | Replace content; keep shell and position |
| Click/tap inside Dock | Keep open |
| Scroll page, rail, or Requirements | Keep open |
| Toggle Theme | Keep open, state/focus/position unchanged |
| Resize desktop viewport | Keep open and clamp controls into viewport |
| Click neutral page content that changes context | Close |
| Open Skill detail/modal/drawer | Close Dock before opening new layer |
| Navigate to Admin, Inventory, Shop, or another route | Close and clear selection |
| Submit | Close Dock, then open confirmation layer |
| Escape | Close only topmost overlay/Dock layer |
| Browser Back | Default: route navigation owns Back; do not add Dock history until deep-linking is approved |

### Input-specific focus

- Keyboard opening: focus heading or first meaningful Dock control
- Pointer desktop opening: preserve node focus unless user tabs into Dock
- Mobile bottom sheet: focus inside sheet, trap focus, background inert
- X/Escape dismissal after keyboard opening: restore Quest trigger
- Navigation/outside-control dismissal: do not steal focus back from the new target
- Quest replacement: keep focus; announce concise Quest name/status change

## Delivery roadmap

## Phase 0 — Specification and test baseline

Goal: ทำให้ทุกทีมทดสอบ state ชุดเดียวกันก่อนแก้ UI

### Work

- เขียน canonical Main Quest lifecycle และ vocabulary:
  - Draft
  - Published/Current
  - Submitted/Pending
  - Approved/Completed
  - Rejected/Resubmittable
  - Future/Locked
  - Archived
- กำหนด status precedence และ fixture matrix สำหรับ Level 1, กลาง, สูง, legacy unlock และ pending
- อัปเดต Playwright selector/fixture จาก Main Constellation overview เป็น direct Main Quest rail
- เพิ่ม baseline scenarios สำหรับ Light/Dark, desktop/mobile และ Star Lens
- บันทึก current screenshots ก่อนแก้เพื่อใช้ regression comparison
- ตัดสิน Browser Back: รอบแรกใช้ route ownership และไม่เพิ่ม history entry ให้ modeless Dock

### Acceptance

- Test fixture มี Current Quest ได้ไม่เกินหนึ่งรายการ
- Pending ไม่แสดงเป็น Completed
- Existing Main Quest scenario ไปถึง Star Lens assertion ได้
- Browser matrix ระบุ browser-verified/source-inferred แยกชัด

### Primary files

- `frontend/tests/constellation.visual.spec.ts`
- `frontend/src/components/ConstellationTree.tsx`
- Test fixture helpers

## Phase 1 — Status correctness and publishing safety

Goal: แก้ data/state semantics ก่อนออกแบบภาพ

### Work

- สร้าง canonical Main Quest status resolver ที่ Rail, Dock, Approval และ test ใช้ร่วมกัน
- กำหนด precedence โดยประมาณ:
  1. Pending request
  2. Current Level available
  3. Past Level approved/completed
  4. Future Level locked
  5. Invalid/legacy state with explicit fallback
- แยก `unlocked` ออกจาก `completed` สำหรับ Main Quest legacy data
- Backend ปฏิเสธการ Publish/Activate Main Quest ที่ไม่มี valid Requirement
- Frontend แสดง readiness checklist และ disable Publish พร้อม inline reason
- กำหนด rejection/resubmit behavior และ status copy ให้ตรง Player/Admin
- ป้องกัน double submit และแสดง submitting/pending state

### Acceptance

- Rail, Star Lens และ Approval แสดง status เดียวกันจาก fixture เดียวกัน
- Current Quest ไม่มีทางใช้ Completed visual state โดยไม่ได้ Approved
- Active Main Quest ที่ Requirement = 0 ถูก API ปฏิเสธด้วย code เฉพาะ
- Submit ซ้ำส่ง network request ได้ครั้งเดียว
- Rejected request ส่งใหม่ได้ตาม contract

### Primary files

- `frontend/src/components/ConstellationTree.tsx`
- `frontend/src/components/StarLensDock.tsx`
- `frontend/src/pages/MainMenu.tsx`
- `frontend/src/pages/AdminPage.tsx`
- `backend/src/server.ts`
- `backend/src/services/constellationService.ts`
- New shared status module and tests

## Phase 2 — Interaction, overlay, and accessibility foundation

Goal: ให้ Star Lens, Modal, Drawer และ Navigation ใช้กติกาเดียวกัน

### Work

- สร้าง single interaction/layer owner สำหรับ overlay stack และ selected Main Quest
- เพิ่ม reusable primitives ตามสถาปัตยกรรมที่เหมาะสม:
  - Dismissible layer
  - Focus scope/origin
  - Top-layer Escape handling
  - Live announcer
- ปิด Star Lens ก่อนเปิด Skill modal หรือ detail context อื่น
- Implement interaction classification table
- กด Main Quest เดิมไม่ปิด; Quest อื่น replace content
- เพิ่ม stable Dock ID และ `aria-expanded`/`aria-controls` จาก selected Node
- ถอด `role="application"` จาก rail หากยังไม่มี complete application keyboard model
- แยก concise lifecycle live region ออกจาก `aria-live` ที่ครอบทั้ง Dock
- กำหนด z-index tokens และ background inert สำหรับ modal/mobile sheet
- Device-specific position persistence; อย่าใช้ desktop coordinate บน mobile
- Resize/orientation clamp ให้ Close และ CTA อยู่ใน viewport

### Acceptance

- Star Lens และ Skill detail active พร้อมกันไม่ได้
- Escape หนึ่งครั้งปิดเพียง layer บนสุด 100% ของ matrix
- Same-node click ไม่ปิด Dock
- Other-Quest click เปลี่ยน content โดย shell ไม่ remount
- Keyboard opening/closing ผ่าน focus transfer/restoration
- Pointer openingไม่เกิด focus jump
- Modal background inert และไม่รับ pointer/keyboard
- Axe ไม่มี serious/critical issueใน scope

### Primary files

- `frontend/src/pages/MainMenu.tsx`
- `frontend/src/components/StarLensDock.tsx`
- `frontend/src/components/ConstellationTree.tsx`
- New overlay/focus/announcer primitives

## Phase 3 — Semantic visual system and Dark Mode

Goal: หยุดการแก้ Dark Mode ด้วย selector patch ราย Component

### Token layers

1. Primitive palette/scale
2. Semantic role
3. Component mapping

### Minimum semantic tokens

```css
/* Typography */
--font-ui;
--font-display;
--font-size-label;
--font-size-body;
--line-height-body;

/* Surfaces */
--surface-canvas;
--surface-base;
--surface-raised;
--surface-floating;
--surface-interactive;
--surface-overlay;

/* Content */
--text-primary;
--text-secondary;
--text-muted;
--text-inverse;
--border-subtle;
--border-strong;
--focus-ring;

/* Action */
--accent;
--accent-hover;
--accent-contrast;
--danger;

/* Quest status sets */
--status-current-bg;
--status-current-border;
--status-current-text;
--status-current-icon;
--status-completed-bg;
--status-completed-border;
--status-completed-text;
--status-completed-icon;
--status-pending-bg;
--status-pending-border;
--status-pending-text;
--status-pending-icon;
--status-locked-bg;
--status-locked-border;
--status-locked-text;
--status-locked-icon;

/* Structure/effects */
--space-1;
--space-2;
--space-3;
--space-4;
--space-6;
--space-8;
--radius-sm;
--radius-md;
--radius-lg;
--shadow-raised;
--shadow-floating;
--layer-dock;
--layer-modal;
--layer-toast;
```

### Work

- วาง Light/Dark values ใน token layer เดียว
- Migrate Main Quest rail, current-Level summary, Star Lens, Main Quest Editor และ Approval ก่อน
- ห้ามลด opacity ของ Quest title/Level; ลดเฉพาะ decoration
- กำหนด icon grammar: Target/Current, Clock/Pending, Check/Completed, Lock/Future
- ใช้ Noto Sans Thai เป็น functional UI family สำหรับไทย/Latin
- ข้อมูล progression ต้องไม่เล็กกว่า 12px; body target ≥14px, line-height ≥1.45
- ลด Level ที่ซ้ำและทำชื่อ Current Quest เป็นข้อความเด่นที่สุดใน section
- ตรวจ/ป้องกัน theme flash ก่อน React mount
- เริ่มแยก legacy CSS selectors ที่ชนกัน และเพิ่ม lint policy สำหรับ raw semantic colors

### Acceptance

- Main Quest, Star Lens และ Editor ไม่มี Light island ใน Dark snapshots
- Text ปกติ contrast ≥4.5:1
- Large text, essential icons, boundaries และ focus ≥3:1
- Status ทุกชนิดแยกได้โดยไม่ใช้สี
- Future Quest title/Level opacity = 1
- Component ที่ migrate แล้วไม่มี raw semantic hex/rgba นอก token definitions
- Functional UI ใช้ Thai/Latin family เดียว
- ผ่าน Light/Dark snapshots ที่ 390px และ 1440px

### Primary files

- `frontend/src/index.css`
- `frontend/src/components/ThemeToggle.css`
- `frontend/src/components/ConstellationTree.css`
- `frontend/src/components/StarLensDock.css`
- `frontend/src/components/ConstellationAdmin.css`
- Approval styling currently embedded in `AdminPage.tsx`

## Phase 4 — Main Quest information architecture and responsive UX

Goal: Current Quest มาก่อน chronology และ mobile ไม่ใช่ desktop ที่ย่อขนาด

### Desktop

- Header แสดงชื่อ Current Quest + `Level N → N+1` เป็น primary progression statement
- History/Future Quest เป็นบริบทรอง
- Star Lens เป็น modeless contextual inspector; drag เป็น enhancement
- Requirements ใช้ progressive disclosure:
  - 1–3 รายการเปิดได้
  - มากกว่านั้น collapse พร้อมจำนวนและ clear affordance

### Tablet

- Horizontal rail + anchored panel
- ไม่ใช้พิกัด floating ที่บังเนื้อหาหลัก

### Mobile

- Current-centered stepper/rail
- Auto-position Current Quest ใน initial viewport
- Edge gradient, next/previous context และข้อความ swipe/pager
- Scroll snap แบบ restrained โดยไม่ล็อก vertical gesture
- Star Lens เป็น bottom sheet แบบคอลัมน์เดียว
- Sheet สูงไม่เกิน 85–90dvh, sticky CTA, safe-area padding
- Nested-scroll contract ระหว่าง sheet และ Requirements

### Acceptance

- Current Quest อยู่ใน initial viewport ที่ 320, 390, 768, 1024 และ 1440px
- ผู้ใช้ทดสอบ ≥90% ระบุ Current Quest/next action ได้ภายใน 5 วินาที
- ผู้ใช้ทดสอบ ≥90% เข้าใจว่าปัดได้โดยไม่รับคำแนะนำ
- ไม่มี page-level horizontal overflow
- Mobile เห็น Current Quest เต็มและเห็นบริบทก่อน/ถัดไปบางส่วน
- Touch target coarse pointer ≥44×44px
- CTA/Close ไม่ถูก browser chrome, keyboard หรือ safe area บัง
- ชื่อ Quest ภาษาไทยยาวสองบรรทัดไม่ทับ status/CTA

## Phase 5 — Motion and state feedback

Goal: Motion แสดงเหตุและผลหลัง lifecycle ถูกต้อง

### Motion tokens

```css
--motion-instant: 0ms;
--motion-fast: 120ms;
--motion-standard: 180ms;
--motion-emphasis: 240ms;
--motion-progression: 420ms;
--ease-enter: cubic-bezier(.2, 0, 0, 1);
--ease-exit: cubic-bezier(.4, 0, 1, 1);
--ease-standard: cubic-bezier(.2, 0, .2, 1);
```

### Choreography

- Desktop enter: opacity + translateY 8px, 180ms
- Exit: opacity + translateY 4px, 120–150ms แล้ว unmount
- Quest replace: content crossfade 100–140ms; shell/position ไม่ขยับ
- Mobile sheet enter: translateY 24px + fade, 200–220ms
- Minimize/expand: content reveal 140–160ms; header/position คงที่
- Drag: pointer 1:1 ไม่มี easing; elevation feedback ≤80ms
- Submit → Pending: status/text ≤180ms ไม่มี pulse
- Approved → Level Up: old Completed → connector → next Current ≤420ms หนึ่งครั้ง
- Error: focus/message ทันที, fade ≤120ms, ไม่ shake

### Reduced Motion

- ใช้ global fallback ที่มีอยู่เป็นฐาน
- JavaScript scroll ตรวจ `prefers-reduced-motion`
- ไม่มี spatial transform, smooth scroll, pulse หรือ animated progress width ที่ไม่จำเป็น
- Final state, focus destination และ announcement เหมือน standard mode

### Acceptance

- Visual response หลัง action ≤100ms
- Dock enter ≤200ms, exit ≤160ms, replace ≤180ms
- Context switch Dock → modal ≤220ms
- Level progression ≤450ms
- ไม่มี continuous animation ใน Pending/Current
- Rapid Quest switching ไม่ queue animation และไม่แสดง stale content
- Drag/rail scroll ไม่มี long task >50ms และ dropped-frame target <5% บนอุปกรณ์ทดสอบ
- Animation ใช้ transform/opacity เป็นหลักและไม่ทำให้ CTA/reading position shift

## Phase 6 — Admin authoring safety

Goal: ป้องกัน Quest ว่าง, ข้อมูลหาย และการแก้ Published content แบบไม่รู้ผลกระทบ

### Work

- Readiness checklist ก่อน Publish
- Inline duplicate-Level validation พร้อมชื่อ Quest ที่ชนและ Level ว่างถัดไป
- Unsaved/Saving/Saved/Failed state สำหรับ Requirement editor
- Navigation dirty guard ครอบคลุม Add/Edit/Delete/Reorder
- Archive/Unpublish เป็น default; restore ได้
- Hard Delete ต้องเรียก impact preview API:
  - Pending approvals
  - Completed/affected players
  - Progress/history references
- Published Requirement change warning และ versioning/impact strategy
- Import preflight: Create/Update/Skip/Conflict ก่อน commit
- Import idempotency/partial-failure test
- Approval confirmation เน้น `Player Level N → N+1`
- Approval success และ Player return state ประกาศ Level ใหม่ชัดเจน

### Acceptance

- Publish disabled/blocked เมื่อ Requirement = 0 พร้อม reason ที่อ่านได้
- Duplicate Level แสดง inline ก่อน request
- ออกจาก dirty editor ต้องเตือน 100% ของเส้นทาง
- Delete ไม่เป็น primary actionและแสดง impact count
- Quest ที่มี active references Hard Delete ไม่ได้หากไม่ผ่าน exceptional policy
- Archived Quest restore ได้
- Import เขียนข้อมูลไม่ได้ก่อน preflight confirmation
- Approval แสดง before/after Level ทั้งก่อนและหลังสำเร็จ

## Phase 7 — Verification, governance, and rollout

### Automated matrix

- Open, same Quest, replace Quest และ outside classification
- Dock → Skill modal, Submit modal และ Escape layering
- Focus entry/restoration by input modality
- Minimize/expand/drag/resize/orientation
- Mobile bottom sheet and safe area
- Current Quest auto-position and swipe affordance
- Current → Pending → Approved → next Current
- Rejected → resubmit
- Light/Dark and Forced Colors
- Reduced Motion including JavaScript scroll
- Browser zoom/reflow and Thai content stress fixtures
- Requirement 0/1/3/10/30
- Archive/delete impact and import preflight

### Required gates

- Playwright interaction and visual snapshots
- Axe serious/critical = 0 in changed flows
- Keyboard-only pass
- Light/Dark × desktop/tablet/mobile snapshots
- iOS Safari and Android Chrome real-device smoke test
- Performance trace for drag/rail/sheet
- Product, Design, Accessibility and Engineering sign-off on one interaction contract

### Governance

- Semantic-token lint rule for migrated components
- No component-local document Escape listener when layer owner exists
- New overlay must register in central layer stack
- New Main Quest status must come from canonical resolver
- Destructive action requires impact/recovery design
- New component Definition of Done includes Light/Dark, responsive, keyboard and reduced motion

## Suggested implementation slices

These slices are designed to be independently reviewable and reduce regression risk:

1. Status resolver + readiness validation + tests
2. Overlay/focus owner + Star Lens behavior tests
3. Semantic token foundation + Main Quest/Dock migration
4. Current-centered rail + mobile sheet
5. Motion presence/replacement/progression
6. Editor dirty/readiness/Archive/impact/preflight
7. Cross-route Dark Mode and accessibility QA

Do not combine all slices into one release. Deploy behind focused test gates and preserve rollback at each slice.

## Definition of Done

Main Quest UX/UI/Motion remediation is complete only when:

- Canonical status is correct and shared across Player/Admin surfaces
- Player identifies Current Quest and next action within the comprehension target
- Star Lens and other overlays pass the complete interaction/focus matrix
- Mobile uses a dedicated bottom-sheet presentation
- Main Quest, Dock, Editor and Approval use semantic Light/Dark tokens
- Status is understandable without color
- Motion follows the approved lifecycle and Reduced Motion has equal information
- Publish/Delete/Import paths meet authoring safety gates
- Playwright, visual, Axe, keyboard, responsive and real-device checks pass
- No required work remains hidden behind legacy Main Constellation assumptions
