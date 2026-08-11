# GuGame Constellation UX Remediation

วันที่แก้ไขและตรวจซ้ำ: 2026-08-08

เอกสารนี้บันทึกผลการแก้ไขจาก `constellation-ux-final-audit-2026-08-08.md` โดยเก็บ audit เดิมไว้เป็นหลักฐานก่อนแก้ไข

## แผนดำเนินการ

1. ป้องกันงาน Admin Editor: dirty-exit guard และ modal keyboard lifecycle
2. ทำ progression grammar ให้ตรง schema: role, state, prerequisite และ connection semantics
3. แก้ mobile journey: preview, touch targets, discipline paging และ editor readability
4. ทำ failure states ให้ชัดเจน: API error/retry, loading lock และ media fallback
5. รักษา spatial continuity: pointer-anchored zoom, camera restore และ topic viewport ownership
6. ตรวจ visual regression ทุก viewport และ browser ที่รองรับ
7. รัน frontend/backend tests และ production builds

## ผลการแก้ไข

### Admin safety

- การออกจาก Constellation Editor ขณะมี draft จะแสดง confirmation
- Cancel เก็บ draft และสถานะ unsaved ไว้
- map modal รองรับ initial focus, focus trap, Escape และ focus restoration

### Progression semantics

- lesson, boss และ capstone มีรูปทรงและวง role ที่แยกกัน
- unlocked, available, pending และ locked มี semantic class และ accessible name ตรงสถานะ
- connection แสดง progression/type/direction จาก schema
- locked และ pending gateway อธิบายเหตุผล พร้อมปิด action ที่ยังทำไม่ได้

### Responsive interaction

- mobile preview เป็น bottom sheet ที่ปิดได้และยังเห็น selected node กับ connection
- camera controls และ interactive targets มีขนาดอย่างน้อย 44px
- overview รองรับ previous/next, current/total และ sync กับ swipe
- mobile editor เพิ่มพื้นที่ canvas, label readability และ control sizing

### Reliability and accessibility

- Constellation API แยก loading, error และ retry โดยไม่ fallback ไป Legacy แบบเงียบ
- Shop/Admin ใช้ native buttons พร้อม visible focus และ shared icon set
- quest modal รองรับ dialog semantics, focus trap, Escape และ focus restoration
- broken preview image แสดง labelled fallback
- loading state ปิด conflicting camera input

### Camera and motion

- wheel zoom ยึด pointer ด้วย SVG coordinate transform; measured drift ต่ำกว่า 1px
- drag/pan ไม่มี easing ระหว่าง direct manipulation
- Back คืน exact camera และ focus ไป origin
- Topic ใช้ viewport และ zoom limits ของตัวเอง โดยไม่ใช้ fixed `scale(0.72)`
- reduced motion ไม่มี transition delay หรือ spatial travel

### Visual regression

- overview header ใช้ overlay region ที่สงวนพื้นที่ชัดเจน
- ชื่อ discipline ยาว wrap ได้โดยไม่ชน progress หรือ node
- ตรวจซ้ำที่ 1440x900, 768x1024, 390x844 และ 320x568

## Verification

- Chromium Playwright: 18/18 ผ่าน
- Firefox Playwright: 18/18 ผ่าน
- Frontend production build: ผ่าน
- Backend unit tests: 21/21 ผ่าน, 1 integration transaction test skip ตามค่าเริ่มต้น
- Backend TypeScript build: ผ่าน
- WebKit: ยังไม่รัน เพราะเครื่อง host ขาด GTK 4, GStreamer และ WebKit runtime libraries

## Release assessment

รายการ P0/P1/P2 ที่ audit ระบุและอยู่ในขอบเขตชุดทดสอบนี้ได้รับการแก้ไขและตรวจซ้ำแล้ว การปล่อยจริงยังควรรัน WebKit ใน CI image ที่มี dependency ครบ และทำ smoke test กับข้อมูล production หลัง deploy
