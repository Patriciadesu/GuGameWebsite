# Main Quest Designer Critique

วันที่: 2026-08-14
ต้นทาง: `main-quest-user-experience-research-2026-08-14.md`
ผู้รีวิวจำลอง: Lead UX/Product, UI/Visual, Motion, Interaction และ Design Systems/Accessibility

## ขอบเขต

นักออกแบบทั้งห้าสาขาอ่านรายงานผู้ใช้จำลองสองรอบและตรวจ source ที่เกี่ยวข้องแบบ read-only ไม่มีการแก้โค้ดหรือข้อมูล Production เอกสารนี้เก็บข้อคิดเห็นที่ผ่านการเทียบข้ามสาขาแล้ว ไม่ใช่ transcript รายคน

## ข้อสรุปร่วม

ทุกสาขาเห็นตรงกันว่า Main Quest ไม่ควรถูกแก้ด้วยการเพิ่ม CSS override หรือ animation รายจุด ปัญหาหลักคือขาด contract กลางสำหรับ:

- Quest status และ progression vocabulary
- Star Lens/overlay ownership
- Focus, Escape และ context dismissal
- Responsive presentation
- Semantic Light/Dark theme
- Authoring readiness และ destructive safety
- Motion lifecycle และ reduced-motion parity

ลำดับที่ถูกต้องคือ **state correctness → interaction ownership → semantic visual foundation → responsive composition → motion → authoring polish/QA**

## ข้อค้นพบที่นักออกแบบยืนยัน

### P1 ที่ควรคงไว้

- Current Quest สามารถแสดงเป็น Completed และทำลาย mental model ของ Level
- Mobile rail ไม่พาไป Current Quest และไม่มี horizontal-navigation affordance
- Star Lens และ Skill modal สามารถเป็น active detail context พร้อมกัน
- Escape ถูกจัดการหลาย Component และไม่มี top-layer ownership
- Dark Mode มี surface hierarchy แบนและมี Light islands
- Main Quest Editor และ Star Lens ไม่ใช้ visual system เดียวกับผลิตภัณฑ์
- Future Quest ลด contrast ของข้อความพร้อม decoration
- Publish Main Quest ได้โดยไม่มี Requirement/readiness gate
- Playwright test อ้างโครงสร้าง Main Constellation เก่า

### Design decisions ที่เห็นตรงกัน

- Main Quest คือ Level-up progression ไม่ใช่ Constellation map
- Current Quest และ `Level N → N+1` ต้องเป็น visual focus หลักเพียงจุดเดียว
- Desktop Star Lens เป็น modeless contextual inspector
- Mobile Star Lens เป็น modal bottom sheet
- หนึ่งเวลาให้มี active detail context ได้ชุดเดียว
- Status ต้องใช้ข้อมูลชุดเดียวกันใน Rail, Dock, Approval และ Editor
- Status ต้องมี local text/icon ไม่พึ่งสีหรือ legend
- Archive/Unpublish เป็นค่าเริ่มต้น ส่วน Hard Delete เป็น exceptional action
- Motion มีหน้าที่อธิบาย state transition เท่านั้น ไม่มี continuous pulse/zoom

## Corrections ต่อรายงานผู้ใช้

1. **Outside click ต้องจำแนกตาม intent**
   - ปิด: neutral content ที่เปลี่ยน context, navigation, Skill detail, modal/drawer ใหม่
   - ไม่ปิด: ภายใน Dock, Main Quest เดิม, Main Quest อื่น, scroll, resize, Theme toggle
   - Outside click เพียงอย่างเดียวเป็น P2 แต่ detail-context conflict และ Escape layering เป็น P1

2. **Browser Back เป็น product decision ระดับ P2**
   - Desktop modeless inspector ไม่จำเป็นต้องสร้าง history entry
   - หากอนาคต Dock deep-linkable หรือ mobile sheet ต้องเลียนแบบ native navigation จึงค่อยให้ Back ปิด panel ก่อน

3. **State model เดิมผสม state กับ event**
   - Persistent state: `Closed`, `OpenExpanded`, `OpenMinimized`
   - Transient mode: `Idle`, `Dragging`, `Exiting`
   - Event: `OPEN_QUEST`, `OPEN_OVERLAY`, `OUTSIDE_CONTEXT`, `ESCAPE`, `NAVIGATE`, `RESIZE`

4. **Focus behavior ต้องขึ้นกับ input modality**
   - Keyboard: ย้าย focus เข้า Dock และคืน trigger เมื่อปิดด้วย X/Escape
   - Pointer desktop: ไม่จำเป็นต้องดึง focusออกจาก Node
   - Mobile bottom sheet: trap focus และทำ background inert
   - Navigation/outside-control dismissal: อย่าดึง focusกลับไป Node จนแย่ง action ใหม่

5. **Roving focus เป็น scalability decision**
   - Native Tab order ยังยอมรับได้เมื่อมี Quest น้อย
   - ใช้ roving focus/arrow navigation เมื่อ path ยาวหรือประกาศเป็น composite widget

6. **Typography inconsistency เป็น P2 จนกว่าจะมี usability evidence**
   - ข้อความ progression ขนาด 10px ยังคงเป็น readability issue ที่เร่งด่วนกว่า font coherence

7. **Dark selector architecture เป็น P2 design-system debt**
   - Defect ที่เห็นจริง เช่น Editor ขาว, badge ขาว, contrast ต่ำ และ surface แบนเป็น P1

8. **Dock exit animation เป็น P3 polish แต่ lifecycle เป็น dependency ของ P1 interaction**
   - ห้ามทำ animation ก่อนนิยาม close/overlay/focus lifecycle

9. **Reduced Motion มี global fallback อยู่แล้ว**
   - ปัญหาจริงคือ JavaScript smooth scroll, semantic parity และ motion tokens ยังไม่ครบ

10. **Dock มี `aria-live="polite"` แล้ว แต่ scope ไม่เหมาะสม**
    - การประกาศทั้ง Dock อาจ verbose
    - ต้องแยก concise status announcer สำหรับ Submitted, Pending, Rejected, Approved และ Level Up

11. **Delete มีคำเตือนแล้ว แต่ safety ไม่พอ**
    - ขาด impact count, Archive, restore path, audit log และ published-content versioning

12. **ไม่ควรล็อก implementation ว่าต้องเป็น reducer**
    - Design requirement คือ behavior contract และ single ownership
    - Engineering เลือก reducer, context หรือ overlay manager ได้ตามสถาปัตยกรรม

## ประเด็นที่รายงานเดิมยังขาด

### Product contract

- Requirement เป็นคำอธิบายหรือหลักฐานที่ Admin ต้องตรวจ
- ผู้เล่นส่งข้อความ, URL, ไฟล์ หรือกด Submit อย่างเดียว
- Rejection/resubmission flow และ notification/SLA
- Pending request เมื่อ Level หรือ Quest version เปลี่ยน
- Lifecycle: Draft, Published, Submitted, Pending, Approved, Rejected, Archived
- Status vocabulary ภาษาไทย/อังกฤษที่ใช้เหมือนกันทุกหน้า

### Responsive and accessibility

- Forced Colors/Windows High Contrast
- Browser zoom 200–400%, 320 CSS px และ text scaling
- iOS/Android safe area, browser chrome, virtual keyboard และ landscape
- Nested scroll ownership ระหว่าง page, rail, sheet และ Requirements
- Input-modality tracking และ focus-origin restoration
- ถอด `role="application"` หากไม่มี complete application keyboard model
- `lang`/localization contract และ Thai content expansion

### Content and failure stress cases

- Requirement 0, 1, 3, 10 และ 30 รายการ
- ชื่อ Quest ภาษาไทยยาว, Level หลักสิบ/หลักร้อย
- ไม่มีรูป, รูปเสีย, รูปแนวตั้ง
- Loading, stale data, offline, retry, permission denied และ double submit
- Rapid Quest switching และ interrupted animation
- Background approval ขณะ tab ไม่ active

### Governance

- Z-index/layer tokens
- Automated contrast, Axe, keyboard และ screenshot tests
- CSS legacy/cascade debt และ color literals จำนวนมาก
- Theme flash ก่อน React mount
- Analytics baseline: time to current Quest, submit success, abandonment

## Design principles ที่อนุมัติเป็นฐานแผน

1. **Progression before visualization** — Current Quest มาก่อน chronology และ decoration
2. **One current state, one primary action** — ผู้เล่นรู้ว่าตอนนี้ทำอะไรและกดอะไรต่อ
3. **One interaction, one owner** — Overlay และ Dock ไม่จัดการ event แข่งกัน
4. **Status is data, not decoration** — ใช้ resolver/vocabulary กลาง
5. **State is locally legible** — สี + icon + label อยู่ใกล้สิ่งที่อธิบาย
6. **Responsive presentation, not shrinkage** — Desktop inspector, mobile sheet
7. **Theme parity, not selector patching** — Component ใช้ semantic tokens
8. **Motion explains causality** — Open, close, replace, progression; ไม่มี perpetual urgency
9. **Direct manipulation is immediate** — Drag/scroll ติด pointer ไม่มี easing
10. **Safe authoring by default** — Draft/Archive ก่อน Publish/Delete

## Motion comment ที่ผ่านการทบทวน

| Event | Standard | Reduced Motion |
|---|---|---|
| Dock enter | opacity + translateY 8px, 180ms | แสดงทันที |
| Dock exit | opacity + translateY 4px, 120–150ms แล้ว unmount | ปิดทันทีและคืน focus |
| Quest replacement | content crossfade 100–140ms; shell ไม่ขยับ | เปลี่ยนทันที + announce |
| Mobile sheet enter | translateY 24px + fade, 200–220ms | แสดง final state ทันที |
| Minimize/expand | content reveal 140–160ms; header/position คงที่ | เปลี่ยนทันที |
| Drag | 1:1 ไม่มี easing; elevation feedback ≤80ms | เหมือน standard |
| Submit → Pending | status/text response ≤180ms; ไม่ pulse | เปลี่ยนทันที |
| Approved → Level Up | Completed → connector → next Current ≤420ms หนึ่งครั้ง | final states + announcement ทันที |
| Current Quest reveal | auto-scroll 200–280ms เฉพาะ page entry/Level change | scroll ทันที |
| Error | แสดง/focus ทันที; fade ≤120ms; ไม่ shake | แสดงทันที |

Motion ต้อง interrupt ได้, ห้าม queue และควรใช้ `transform`/`opacity` เป็นหลัก
