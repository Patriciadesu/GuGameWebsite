# GuGame Constellation System: Final UX Audit

วันที่ตรวจ: 2026-08-08

Baseline commit: `f1a1aa34542fb34a181ca0f7b530aec8d16c3c89`

ขอบเขต: Main Menu, Constellation Overview, Discipline, Preview, Topic, Quest Detail และ Constellation Admin Editor

## Executive Verdict

**BLOCK RELEASE**

ระบบเดิน core journey ได้ใน Chromium แต่ยังไม่ผ่าน release gates ของ Constellation UX Rubric เพราะมีการสูญเสีย draft ใน Editor, mobile journey ที่บังหรือขวาง interaction หลัก, progression grammar ที่ทำให้สถานะตีความผิด, failure state ที่แอบสลับไปหน้า legacy และ keyboard journey ที่ไม่เทียบเท่า pointer journey

ผลรวมหลัง deduplicate:

- P0: 1 Verified
- P1: 6 Verified
- P2: 9 Verified
- P3: 1 Verified และ 1 design-system recommendation
- Needs targeted reproduction: 4 กลุ่ม

## วิธีตรวจ

- ใช้ rubric กลาง: `docs/constellation-ux-audit-rubric.md`
- Baseline Playwright Chromium: `6/6` ผ่าน
- Final Chromium suite: `18/18` ผ่าน หมายถึง test harness ทำงานครบ ไม่ได้หมายถึง UX ผ่านทุก gate
- Firefox targeted audit: `11/12` ผ่าน โดยเคสที่ fail เปิดเผย defect จริง คือ preview panel intercept click บน mobile
- WebKit: รันไม่ได้เพราะ host ขาด GTK 4, GStreamer และ WebKit runtime libraries จึงจัดเป็น environment coverage gap
- ตรวจ runtime/computed style, focus, accessible semantics, bounding box, API failure, slow API, broken image, long label และ fixture 6 disciplines
- ผู้ตรวจแยก 4 ด้าน: Constellation Display, Website UI, Layout/UX/Accessibility และ Motion/Interaction
- QA adjudication ตัดสินจาก impact, reach, recoverability และหลักฐาน ไม่ใช้เสียงข้างมาก

## P0

### 1. Draft layout หายเมื่อออกจาก Constellation Editor

สถานะ: **Verified, high confidence**

วิธีทำซ้ำ: ลาก node ให้ขึ้น `1 unsaved` -> กด `Legacy Quest Tree` -> กลับ `Constellation Layout`

ผลจริง:

- ไม่มี Save/Discard/Cancel confirmation
- หน้า Legacy เปิดได้ทันที
- เมื่อกลับมา status เป็น `Saved`
- ตำแหน่ง draft ไม่ถูกเก็บ
- เกิดซ้ำทั้ง Chromium และ Firefox

หลักฐาน: `/tmp/constellation-audit/chromium-admin-work-protection.json`, `/tmp/constellation-audit/firefox-admin-work-protection.json`, `frontend/src/pages/AdminPage.tsx:2791`, `frontend/src/pages/AdminPage.tsx:2827`, `frontend/src/components/ConstellationAdmin.tsx:244`

ผลกระทบ: งานจัด constellation ซึ่งเป็นงานละเอียดสูญหายจากการสลับ tab ปกติ และ UI รายงานกลับว่า Saved ทั้งที่ไม่ได้บันทึก

เกณฑ์ผ่าน: ทุก dirty exit รวม mode tab, admin section, route, browser back, reload และ logout ต้องมี Save/Discard/Cancel หรือเก็บ restorable draft; Cancel ต้องคง draft; save failure ห้ามล้าง draft

## P1

### 2. Mobile preview บัง spatial context และขวาง click ใน Firefox

สถานะ: **Verified, high confidence**

- ที่ `390x844` preview ขนาดประมาณ `328x446px` บัง selected node `100%`
- ไม่มี close control, camera controls ถูกซ่อน และ label บน map สูงเพียง `6-7px` ใน Chromium
- Back/zoom target มีขนาด `40x40px`
- Firefox เกิด race จาก pointer-move preview: panel เปิดก่อน click เสร็จแล้ว intercept pointer จน test timeout 30 วินาที

หลักฐาน: `/tmp/constellation-audit/chromium-mobile-spatial-context.json`, `/tmp/constellation-audit/chromium-mobile-spatial-context.png`, `/tmp/constellation-visual/player-mobile.png`, `frontend/src/components/ConstellationTree.tsx:259`, `frontend/src/components/ConstellationTree.tsx:498`, `frontend/src/components/ConstellationTree.css:519`

ผลกระทบ: mobile user มองไม่เห็น node/path ที่กำลังตัดสินใจ และบางครั้งเปิด preview ด้วย click ไม่สำเร็จใน Firefox

เกณฑ์ผ่าน: ที่ `390x844` และ `320x568` selected node กับอย่างน้อยหนึ่ง connection ต้องยังเห็น, มี close target อย่างน้อย `44x44px`, dismiss ด้วย close/backdrop/swipe ได้ และ click/tap flow ผ่าน Chromium/Firefox/WebKit

### 3. Role, progression และ dependency grammar ให้ข้อมูลผิดหรือไม่ครบ

สถานะ: **Verified, high confidence**

- locked lesson เป็นเทา แต่ locked boss เป็นแดง และ locked capstone เป็นม่วง
- lesson, boss และ capstone ใช้ star geometry เดียวกัน
- pending `Blender Basic` มี class และ accessible name เป็น `locked`
- accessible name ไม่ระบุ role
- connection 11 เส้นไม่มี `marker-end`, ไม่มี state/type class และใช้ stroke เดียวทั้งหมด แม้ schema มี `hasArrowhead` และ `connectionType`
- locked `Animation` ไม่บอก unmet prerequisite และยังเปิด `View Path` ได้

หลักฐาน: `/tmp/constellation-audit/chromium-role-and-path-semantics.json`, `/tmp/constellation-audit/chromium-progression-explainability.json`, `/tmp/constellation-audit/chromium-role-and-path-semantics.png`, `frontend/src/components/ConstellationTree.tsx:212`, `frontend/src/components/ConstellationTree.css:261`, `frontend/src/components/ConstellationNodeGlyph.tsx:22`, `frontend/src/components/constellationTypes.ts:63`

ผลกระทบ: ผู้ใช้อาจคิดว่า boss/capstone ที่ยัง locked เป็น actionable, ไม่รู้ว่า request อยู่ระหว่าง approval และต้องเดา split/merge/prerequisite direction จากตำแหน่ง node

เกณฑ์ผ่าน: fixture role x state ต้องแยก `lesson/boss/capstone` ออกจาก `locked/available/unlocked/pending` ด้วย geometry/ring/pattern/label ที่ไม่พึ่งสีอย่างเดียว; accessible name ต้องมี title + role + state จริง; locked preview ต้องบอก prerequisite และไม่เสนอ action ที่ทำไม่สำเร็จ; edge ต้อง render direction/type/progression ตามข้อมูล

### 4. Six-discipline navigation ไม่ discoverable บน tablet/mobile

สถานะ: **Verified สำหรับ 6 disciplines, high confidence**

- `768x1024`: container `710px`, scroll content `4260px`, ไม่มี position indicator
- `320x568`: container `278px`, scroll content `1668px`, ไม่มี position indicator
- UI ใช้ horizontal scroll snap อย่างเดียว ไม่มี previous/next หรือ current/total

หลักฐาน: `/tmp/constellation-audit/chromium-discipline-scale.json`, `/tmp/constellation-audit/chromium-six-disciplines-768x1024.png`, `/tmp/constellation-audit/chromium-six-disciplines-320x568.png`, `frontend/src/components/ConstellationTree.css:527`

ผลกระทบ: ผู้ใช้อาจเข้าใจว่ามีเพียง Programming และไม่รู้ว่าต้อง swipe เพื่อหาอีกห้าชุด

เกณฑ์ผ่าน: fixture 4, 5 และ 6 disciplines ต้องมี previous/next หรือ layout ที่ discoverable เทียบเท่า, แสดง current/total, sync กับ swipe/scroll และใช้ keyboard ได้

### 5. Constellation API error ถูกแสดงเป็น Legacy Quest Tree แบบเงียบๆ

สถานะ: **Verified, high confidence**

เมื่อ `/api/constellation-maps` ตอบ 503 ระบบไม่มี constellation shell, ไม่มี error/status, ไม่มี retry และเปิด legacy tree แทน

หลักฐาน: `/tmp/constellation-audit/chromium-failure-recovery.json`, `/tmp/constellation-audit/chromium-failure-recovery.png`, `frontend/src/pages/MainMenu.tsx:239`, `frontend/src/pages/MainMenu.tsx:1168`

ผลกระทบ: ผู้ใช้แยก service failure ออกจาก empty/legacy product ไม่ได้ และแก้ด้วย retry ไม่ได้

เกณฑ์ผ่าน: แยก loading, successful-empty และ error state; error ต้องคง constellation region/selection, อธิบายปัญหา และมี retry ที่ทำงานจริง

### 6. Shop และ Admin เป็น pointer-only destination

สถานะ: **Verified, high confidence**

- Shop/Admin เป็น clickable `DIV`, ไม่มี role, `tabIndex=-1`

หลักฐาน: `/tmp/constellation-audit/chromium-keyboard-and-semantics.json`, `frontend/src/pages/MainMenu.tsx:1143`

ผลกระทบ: keyboard users เข้า Shop/Admin ซึ่งเป็น main destinations ไม่ได้

เกณฑ์ผ่าน: navigation เป็น native link/button, มี visible focus และ Enter/Space ทำงานเทียบเท่า click

### 7. Mobile Admin Editor ใช้งานจัด layout จริงได้ยาก

สถานะ: **Verified, medium confidence**

ที่ `390x844` canvas และ node labels ถูกย่อเป็น thumbnail เล็กมากในหน้าฟอร์มที่ยาว ขณะที่ controls สำคัญแยกห่างจาก context ที่แก้

หลักฐาน: `/tmp/constellation-visual/admin-layout-mobile.png`, `/tmp/constellation-visual/admin-layout-editor.png`

ผลกระทบ: งานเลือกและวาง node ซึ่งเป็น core Admin task ใช้งานจริงบน required mobile viewport ไม่ได้อย่างน่าเชื่อถือ

เกณฑ์ผ่าน: ที่ `320x568` และ `390x844` node/label ต้องอ่านและเลือกได้, drag placement ใช้งานได้, inspector ไม่ดัน canvas เป็น thumbnail และ core controls มีขนาดอย่างน้อย `44x44px` ตาม project spec

## P2

### 8. Camera/direct manipulation ไม่รักษา spatial continuity

หลัง wheel zoom node ใต้ pointer drift `60.52px` ใน Chromium และ `51.05px` ใน Firefox; ระหว่าง drag กล้องยังใช้ `380ms cubic-bezier(0.22, 1, 0.36, 1)`; Back reset modified camera เป็น identity

หลักฐาน: `/tmp/constellation-audit/chromium-camera-and-motion.json`, `frontend/src/components/ConstellationTree.tsx:427`, `frontend/src/components/ConstellationTree.css:250`

เกณฑ์ผ่าน: pointer-anchored zoom, direct manipulation ไม่มี easing และ Back คืน exact per-map camera; ค่า tolerance ยังเป็น diagnostic จนกว่า product owner จะรับรอง

### 9. Topic ใช้ Discipline viewport และ hard-coded scale

Fixture topic `900x1400` ยัง render ใน canvas `1600x900` ด้วย `translate(106 -114) scale(0.72)` ทำให้ topic เล็กและเหลือพื้นที่ว่างมาก

หลักฐาน: `/tmp/constellation-audit/chromium-topic-viewport-ownership.json`, `/tmp/constellation-audit/chromium-topic-viewport-ownership.png`, `frontend/src/components/ConstellationTree.tsx:355`, `frontend/src/components/ConstellationTree.tsx:482`

เกณฑ์ผ่าน: คำนวณ fit-content จาก topic viewport + label bounds, ใช้ topic min/max zoom และรักษา gateway anchor โดยไม่มี fixed scale

### 10. Quest modal ไม่มี keyboard/dialog lifecycle

Quest modal ไม่มี `role=dialog`, `aria-modal`, accessible title, initial focus, focus trap และ Escape close; หลังปิด focus ไม่คืน origin node

หลักฐาน: `/tmp/constellation-audit/chromium-quest-modal-accessibility.json`, `frontend/src/pages/MainMenu.tsx:1540`

เกณฑ์ผ่าน: named modal dialog, focus trap, background inert, Escape close และ focus คืน quest node; การไม่มี entry motion เพียงอย่างเดียวไม่ใช่ severity gate

### 11. Admin map modal ไม่มี focus management

Admin modal มี `role=dialog` และ `aria-modal=true` แต่ focus ไม่เข้า dialog และ Escape ไม่ปิด

หลักฐาน: `/tmp/constellation-audit/chromium-admin-work-protection.json`, `frontend/src/components/ConstellationAdmin.tsx:402`

เกณฑ์ผ่าน: initial focus, focus trap, Escape close และคืน focus ไปปุ่ม New/Edit Map

### 12. Input ยัง active ระหว่างเปิด Topic

ระหว่าง mocked API delay `700ms`, zoom controls ยังเห็นและเปลี่ยน scale จาก `1` เป็น `1.2` ก่อนถูก async reframe ทับ

หลักฐาน: `/tmp/constellation-audit/chromium-loading-input-safety.json`, `frontend/src/components/ConstellationTree.tsx:415`

เกณฑ์ผ่าน: pending transition ต้อง reject/queue/cancel conflicting input อย่าง deterministic และมี busy feedback

### 13. Reduced motion ยังมี delay

duration ลดเหลือ `1ms` แต่ delay ยัง `160ms, 120ms`

หลักฐาน: `/tmp/constellation-audit/chromium-camera-and-motion.json`, `frontend/src/components/ConstellationTree.css:317`, `frontend/src/components/ConstellationTree.css:558`

เกณฑ์ผ่าน: reduced motion ต้องไม่มี spatial travel และ computed delay เป็น `0s`

### 14. Broken preview image ไม่มี fallback

404 image มี `naturalWidth=0`, ไม่มี fallback text/label และยังคง broken image element

หลักฐาน: `/tmp/constellation-audit/chromium-preview-media-failure.json`, `/tmp/constellation-audit/chromium-preview-media-failure.png`, `frontend/src/components/ConstellationTree.tsx:510`

เกณฑ์ผ่าน: `onError` เปลี่ยนเป็น stable labelled fallback โดยไม่เกิด layout shift

### 15. Back ไม่คืน focus ไป origin gateway

หลังกลับจาก Topic focus ค้างที่ปุ่ม Back แทน `3D Modeling` ทั้ง Chromium และ Firefox

หลักฐาน: `/tmp/constellation-audit/chromium-keyboard-and-semantics.json`, `frontend/src/components/ConstellationTree.tsx:83`

เกณฑ์ผ่าน: reverse navigation คืน focus ไป gateway และ overview card ที่เป็น origin

### 16. Mobile status/touch, long-title และ fallback polish

mobile ซ่อน status legend ทั้งที่ state ยังพึ่งสี, Back/zoom เป็น `40x40px` เทียบกับ project spec `44x44px`, และ long discipline title ชน progress

ที่ desktop long title สูง `58-60px` แต่ progress ถูก fix ที่ `top:48px` จึงซ้อนกัน; ที่ `320px` title สูง `72-75px`

นอกจากนี้ primary navigation ใช้ platform emoji ซึ่ง render ต่างกันหรือเป็น missing glyph และ avatar fallback ของ fixture ID ที่ไม่ใช่ตัวเลขแสดงค่าเสีย/`NaN`

หลักฐาน: `/tmp/constellation-audit/chromium-mobile-spatial-context.json`, `/tmp/constellation-audit/chromium-six-disciplines-1440x900.png`, `/tmp/constellation-audit/chromium-discipline-scale.json`, `/tmp/constellation-visual/player-overview.png`, `frontend/src/components/ConstellationTree.css:133`, `frontend/src/pages/MainMenu.tsx:1143`

เกณฑ์ผ่าน: state สำคัญต้องมี non-color semantic cue; primary targets ผ่าน `44x44px`; title/progress อยู่ใน normal flow หรือ reserved region และ bounding boxes ไม่ intersect; primary icon ใช้ shared icon set และ avatar fallback ไม่ขึ้นกับ numeric ID

## P3 / Recommendation

### 17. หัวข้อ `Skill Constellations` ซ้ำสองระดับ

พบ heading ชื่อเดียวกัน 2 จุด ทำให้ hierarchy ซ้ำ โดยเฉพาะบน mobile ที่เกิด card-inside-card framing

หลักฐาน: `/tmp/constellation-audit/chromium-keyboard-and-semantics.json`, `/tmp/constellation-visual/player-overview.png`

### 18. Product shell ยังไม่เป็น clean/luxurious system เดียวกัน

Constellation canvas มีทิศทางเบาและเรียบ แต่ shell รอบนอกยังผสม serif title, playful rounded sans, uppercase microcopy, gradient stat tiles, platform emoji, shadow หนา และ rounded containers หลายชั้น

นี่เป็น design-system recommendation ไม่ใช่ functional defect: กำหนด shared typography roles, radius/elevation tokens, icon set และ action hierarchy แล้วลด decorative framing ที่ไม่ช่วย task

## สิ่งที่ Targeted Runtime ยืนยันเพิ่ม

ความเสี่ยงที่เคยเป็น source-only และถูกอัปเกรดเป็น Verified:

- wheel zoom ไม่ anchor pointer
- camera easing ระหว่าง drag
- Back ไม่คืน camera/focus
- reduced-motion delay
- input ระหว่าง loading
- pending state หาย
- topic ใช้ discipline viewport + `0.72`
- locked preview ไม่อธิบาย prerequisite
- API failure ไม่มี error/retry
- broken preview ไม่มี fallback
- quest/admin modal focus management
- dirty draft สูญหายเมื่อเปลี่ยน editor mode

## Coverage Gaps

ยังไม่ควรอ้างว่า production sign-off ครบในส่วนต่อไปนี้:

- WebKit/Safari: host ขาด dependency จึง launch ไม่ได้
- physical touch, pinch zoom และ screen reader จริง
- `1024x768` targeted visual assertions
- fixture discipline count 0, 1, 4 และ 5 แบบ dedicated
- empty topic และ unavailable topic reverse-keyboard recovery
- rapid repeated input/intermediate animation video
- editor save failure และ dirty exit ทุก route/reload/logout
- mobile admin computed label/touch metrics

## ลำดับแก้ที่เสนอ

1. ป้องกัน draft loss และสร้าง shared dirty-exit guard
2. แก้ mobile preview/click race และ 4-6 discipline paging
3. แยก role grammar ออกจาก progression grammar รวม pending/path semantics
4. แก้ explicit error/retry และ keyboard/dialog journey
5. สร้าง camera state machine: pointer anchor, direct-drag mode, topic fit, Back restore, loading lock, reduced motion
6. เก็บ responsive legibility, broken media, long labels และ product-shell polish

หลังแก้แต่ละกลุ่มต้องเพิ่ม regression assertion ใน Playwright และ rerun Chromium + Firefox + WebKit ก่อน production sign-off
