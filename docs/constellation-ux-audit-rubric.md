# GuGame Constellation UX Audit Rubric

สถานะ: Consensus approved

วันที่จัดทำ: 2026-08-08

ขอบเขต: Main Menu, Constellation Player, Topic/Quest transition และ Constellation Admin Editor

เอกสารนี้เป็นเกณฑ์กลางสำหรับการตรวจ UI/UX ของ Constellation System โดยแยกข้อบกพร่องที่พิสูจน์ได้ออกจากความเห็นด้านรสนิยม และกำหนดวิธีควบคุมคุณภาพของผู้ตรวจหลายคน

## เป้าหมาย

1. ตรวจว่าผู้ใช้เข้าใจโครงสร้าง Discipline, Topic, Quest, Boss และ Capstone โดยไม่ต้องเข้าใจโครงสร้างข้อมูลภายใน
2. ซ่อนความซับซ้อนด้วย progressive disclosure ผู้ใช้เห็นเฉพาะข้อมูลและคำสั่งที่จำเป็นใน state ปัจจุบัน
3. รักษาบริบทเมื่อซูม แพน เปิดรายละเอียด และย้อนกลับ
4. ทำให้ desktop, mobile, keyboard, touch และ assistive technology ใช้ journey เดียวกันได้
5. ป้องกันข้อสรุปจากผู้ตรวจที่ไม่มีหลักฐานหรืออิงรสนิยมส่วนตัว

## ทีมตรวจและขอบเขตความรับผิดชอบ

### Constellation Display Specialist

ดูแล visual hierarchy ของดาวและเส้น, progression state, node role, Discipline/Topic composition, Boss/Capstone, camera และการ scale รองรับ 4+ disciplines

### Website UI / Design-System Specialist

ดูแล typography, color, spacing, surface, iconography, visual hierarchy และความต่อเนื่องระหว่าง Main Menu เดิมกับ Constellation UI

### Layout, UX, Accessibility & Responsive Specialist

ดูแล user journey, progressive disclosure, mobile/touch, keyboard/focus, semantics, loading/error/empty states และการป้องกันงาน editor สูญหาย

### Motion & Interaction Specialist

ดูแล hover/focus/tap, preview lifecycle, camera motion, drill-down/reverse transition, interruption, perceived performance และ reduced motion

### QA Adjudicator

ไม่มีสิทธิ์ตัดสินจากจำนวนเสียง หน้าที่คือรวมข้อซ้ำ, ตรวจข้อขัดแย้ง, ลดระดับข้อที่หลักฐานไม่พอ, ปฏิเสธ threshold ที่ไม่มีที่มา และแยก Verified, Needs targeted reproduction, Recommendation และ Rejected

## Rubric ที่ทีมยอมรับร่วมกัน

### 1. Journey Continuity

เหตุผล: ผู้ใช้ต้องเดินทาง Overview -> Discipline -> Preview -> Topic -> Quest และย้อนกลับได้โดยไม่หลง

ผ่านเมื่อ:

- ทุกระดับมีทางเข้าและทางกลับที่ชัดเจน
- Back กลับไปยัง state, camera และ focus ที่เริ่มต้น journey
- ไม่มี state ที่ผู้ใช้ติดอยู่หรือจำเป็นต้อง reload หน้า

หลักฐานบังคับ: automated journey test, focus assertion และ screenshot ก่อน/หลัง transition

### 2. Progressive Disclosure / Complexity Budget

เหตุผล: ความซับซ้อนของ schema, metadata และเครื่องมือ editor ไม่ควรถูกผลักให้ผู้ใช้รับรู้พร้อมกันทั้งหมด

ผ่านเมื่อ:

- Overview แสดงเฉพาะ Discipline identity และ progress
- Discipline แสดง Topic gateways และสถานะที่จำเป็น
- Preview แสดงผลลัพธ์การเรียนและ primary action เดียว
- Topic แสดง node ภายใน topic ที่เลือก โดยทำให้ Discipline จางลงแต่ยังรักษาบริบท
- Quest detail เปิดหลังผู้ใช้เลือก node เท่านั้น
- Admin แสดงข้อมูลของ selected node ใน inspector/drawer ไม่กอง metadata และ legacy list ต่อท้าย workspace
- Advanced controls เปิดตามเจตนาของผู้ใช้และปิดได้

ไม่ผ่านเมื่อ:

- มี competing primary actions
- panel หรือ metadata บังแผนที่และงานหลัก
- technical ID, schema term หรือ legacy controls ปรากฏโดยไม่จำเป็น
- ข้อมูลทุกระดับแสดงพร้อมกันจนไม่รู้ว่าต้องทำอะไรต่อ

หลักฐานบังคับ: screenshot ทุก navigation depth และ action-count review ของแต่ละ state

### 3. Visual Hierarchy

เหตุผล: Topic, lesson, boss, capstone และ progression เป็นข้อมูลคนละมิติ ต้องอ่านแยกออกโดยไม่พึ่งสีอย่างเดียว

ผ่านเมื่อ:

- role ใช้ geometry, scale, ring หรือ label hierarchy
- progression ใช้ core/ring/glow/pattern ที่ไม่ถูก role color ทับ
- Boss และ Capstone เด่นขึ้นตามลำดับโดยไม่ทำให้สถานะ locked/available/unlocked หาย
- selected node และ path ที่เกี่ยวข้องระบุได้ทันที

หลักฐานบังคับ: fixture ครบ role x progression และ screenshot/pixel assertion

### 4. Legibility

เหตุผล: ชื่อ node และ connection เป็น navigation หลัก ไม่ใช่ decoration

ผ่านเมื่อ:

- label อ่านได้โดยไม่ต้อง zoom ก่อน
- label ไม่ชน node, panel, edge หรือ viewport boundary
- long label มี wrap/placement strategy ที่คงขนาดอ่านได้
- selected node ยังมองเห็นเมื่อ preview เปิด

หมายเหตุ: `14px` เป็น proposed GuGame product baseline ไม่ใช่ WCAG minimum จนกว่า product owner จะรับรอง

หลักฐานบังคับ: computed size, screenshot ที่ 5 viewports และ long-label fixtures

### 5. Camera & Direct Manipulation

เหตุผล: zoom และ pan ต้องสัมพันธ์กับมือและช่วยรักษา spatial memory

ผ่านเมื่อ:

- wheel/trackpad zoom ยึดจุดใต้ pointer
- drag ไม่เกิด easing ที่ทำให้กล้องตามมือช้า
- programmatic reframe แยกจาก direct manipulation
- camera state จำแยกตาม map
- Reset เป็น fit-content ที่เผื่อพื้นที่ label
- pan/zoom ถูกจำกัดหรือยกเลิกอย่าง deterministic ระหว่าง transition

หมายเหตุ: `50ms` และ pointer drift `2-4px` เป็น proposed acceptance thresholds ต้องได้รับการรับรองก่อนใช้เป็น release gate

หลักฐานบังคับ: intermediate-frame measurement, transform assertions และ interruption tests

### 6. Responsive Layout

เหตุผล: mobile ไม่ควรเป็นเพียง desktop SVG ที่ย่อจนอ่านไม่ได้

ผ่านเมื่อ:

- node สำคัญและอย่างน้อยหนึ่ง connection ยังมองเห็นเมื่อ preview เปิด
- mobile preview เป็น dismissible bottom sheet หรือ panel ที่ไม่ทำลาย spatial context
- touch target ไม่น้อยกว่า `44x44px` ตาม GuGame experience spec
- desktop, tablet และ mobile ใช้ framing ที่เหมาะกับสัดส่วนหน้าจอ
- 4, 5 และ 6 disciplines มี layout/paging ที่เข้าใจได้

หลักฐานบังคับ: screenshot, overflow assertion และ touch-target measurement ทุก viewport บังคับ

### 7. Motion & Orientation

เหตุผล: motion ต้องอธิบายว่าผู้ใช้กำลังลงลึกหรือย้อนกลับ ไม่ใช่เพียงตกแต่ง

ผ่านเมื่อ:

- Overview -> Discipline -> Topic -> Quest มี continuity
- reverse navigation ใช้ reverse transition และคืนบริบท
- preview มี entrance และ exit lifecycle ที่ predictable
- input ใหม่ระหว่าง motion ไม่สร้าง mixed state
- reduced motion ไม่มี spatial travel หรือ transition delay ที่ค้าง

หลักฐานบังคับ: video/trace หรือ intermediate screenshots, computed transition values และ reduced-motion test

### 8. Input & Accessibility Parity

เหตุผล: mouse, touch, keyboard และ assistive technology ต้องทำงานหลักชุดเดียวกันได้

ผ่านเมื่อ:

- interactive destination ใช้ native button/link หรือมี semantics ครบ
- Enter/Space ทำงานเทียบเท่า click/tap
- focus visible, ลำดับถูกต้อง และคืนไปยัง origin หลังปิด/ย้อนกลับ
- modal trap focus, ปิดด้วย Escape และคืน focus
- accessible name ระบุ title, role และ progression state
- สถานะสำคัญไม่สื่อด้วยสีอย่างเดียว

หลักฐานบังคับ: keyboard journey, accessibility snapshot และ focus assertions

### 9. Resilience

เหตุผล: loading, error, empty และ media failure ต้องไม่ทำให้ผู้ใช้เข้าใจผิดว่าเป็นเนื้อหาปกติ

ผ่านเมื่อ:

- loading รักษาขนาด layout และมี feedback
- error มีข้อความ, retry และรักษา selection
- empty state บอกสิ่งที่เกิดขึ้นและ next action
- unavailable topic อธิบายได้โดยไม่เปลี่ยนเป็น legacy UI เงียบๆ
- avatar/preview image failure มี fallback ที่ไม่ทำให้ layout shift

หลักฐานบังคับ: mocked slow/error/empty/404 states และ recovery assertions

### 10. Admin Work Protection

เหตุผล: การจัด node เป็นงานละเอียดและห้ามสูญหายเพราะเปลี่ยน tab, section หรือ route

ผ่านเมื่อ:

- dirty state มีสัญญาณชัดเจน
- ทุกทางออกเสนอ Save, Discard, Cancel หรือเก็บ draft ไว้
- save failure ไม่ล้าง draft
- reset/discard ระบุ scope ที่จะได้รับผลกระทบ

หลักฐานบังคับ: exit-path matrix และ persistence tests

### 11. Product Coherence

เหตุผล: Constellation อาจมีบุคลิกเฉพาะ แต่ยังต้องรู้สึกว่าอยู่ใน GuGame เดียวกับ Main Menu

ผ่านเมื่อ:

- page shell, spacing, control roles, icon set, radius และ elevation ใช้ token ร่วมกัน
- typography มีหน้าที่ชัดเจนและไม่แข่งขันกัน
- primary/secondary/destructive action ใช้ hierarchy เดียวกัน
- ไม่พึ่ง platform emoji สำหรับ navigation หลัก

หลักฐานบังคับ: token inventory, side-by-side screenshot และ component-state review

## Severity

| ระดับ | ความหมาย | การตัดสิน release |
| --- | --- | --- |
| P0 | สูญเสียข้อมูล, security หรือ core journey ใช้ไม่ได้ในวงกว้าง | Block ทันที |
| P1 | งานหลักใช้ไม่ได้/เข้าใจผิด/ไม่สามารถใช้งานได้ใน input หรือ viewport สำคัญ | Block release |
| P2 | friction สูง, accessibility gap หรือ visual/interaction defect ที่มี workaround | แก้หรือมี owner รับความเสี่ยงพร้อม ticket |
| P3 | polish, consistency หรือ improvement ที่ไม่ขวางงาน | ไม่ block แต่ต้องเก็บ backlog |

Severity ไม่ได้มาจากจำนวน agent ที่เห็นตรงกัน แต่พิจารณาจาก user impact, reach, recoverability และหลักฐาน

## Evidence Contract

ทุก finding ต้องมี:

1. viewport และ state ที่เกิด
2. ขั้นตอนทำซ้ำ
3. expected และ actual behavior
4. screenshot/video/test หรือ computed measurement
5. selector หรือ file:line ที่เกี่ยวข้อง
6. user impact
7. confidence: high, medium หรือ low
8. acceptance criterion ที่ตรวจซ้ำได้

การจัดประเภท:

- **Verified**: behavior/visual มีหลักฐานอย่างน้อยสองชนิด เช่น source + screenshot หรือ source + targeted test
- **Needs targeted reproduction**: source ยืนยันความเสี่ยง แต่ยังไม่มี runtime evidence
- **Recommendation**: ข้อเสนอด้านคุณภาพที่ไม่ใช่ defect ตาม contract ปัจจุบัน
- **Rejected**: ขัดกับหลักฐาน, ซ้ำโดยไม่เพิ่มข้อมูล หรือใช้ threshold ที่ไม่มีที่มา

Screenshot อย่างเดียวไม่พิสูจน์ interaction และ source อย่างเดียวไม่พิสูจน์ runtime behavior

## Coverage Matrix

| มิติ | ชุดบังคับ |
| --- | --- |
| Viewport | `1440x1000`, `1024x768`, `768x1024`, `390x844`, `320x568` |
| Discipline count | 0, 1, 3, 4, 6 |
| Content | long labels, edge nodes, branch split, branch merge, empty topic |
| Progression | unlocked, available, locked, pending |
| Role | topic gateway, lesson, boss, capstone |
| Input | mouse, wheel/trackpad, touch, keyboard, accessibility tree |
| Depth | overview, discipline, preview, topic, quest และ reverse ทุกระดับ |
| Failure | slow API, error API, empty API, unavailable topic, broken preview/avatar |
| Motion | normal, interrupted, rapid repeat input, reduced motion |
| Admin | drag, save, reset, save failure, dirty exit ทุก route, modal keyboard flow |
| Browser | Chromium บังคับ; Firefox และ WebKit ก่อน production sign-off |

ใช้ pairwise coverage ได้ แต่ mobile, keyboard, error, pending, dirty exit และ reduced motion ต้องมี dedicated scenarios

## Preliminary Classification

Baseline ปัจจุบัน: Playwright `6/6` ผ่านใน `14.5s` แปลว่า core journey ที่มี fixture อยู่ไม่พัง แต่ไม่ได้แปลว่า rubric ทุกหมวดผ่าน

### Verified

- P1: mobile player map ถูกย่อเป็นแถบเล็กและ preview บัง spatial context
- P1: boss/capstone role treatment ทับ progression state
- P1: connection ไม่ใช้ `hasArrowhead` และไม่มี progression treatment
- P1: mobile admin editor map เล็กเกินไปสำหรับการจัด node จริง
- P2: overview label legibility ต่ำ
- P2: mobile ซ่อน status legend ทั้งที่ยังใช้สีสื่อสถานะ
- P2: Back/zoom controls `40px` ต่ำกว่า project spec `44px`
- P2: platform emoji แสดง missing glyph ใน Chromium/Linux fixture
- P2: non-numeric fixture ID ทำ avatar fallback เป็น `NaN`
- P3: `Skill Constellations` ซ้ำสองระดับ

### Needs Targeted Reproduction

- direct manipulation ใช้ camera easing เดียวกับ programmatic transition
- wheel zoom ไม่ยึด pointer
- Back reset camera, ไม่ reverse layer และไม่คืน focus
- pan/zoom ระหว่าง drill-down
- reduced-motion transition delay
- preview ไม่มี exit lifecycle และ close timer ถูกต่ออายุ
- mobile ใช้ camera displacement เดียวกับ desktop
- Shop/Admin pointer-only
- dirty editor draft สูญหายเมื่อออกทางอื่น
- modal focus management
- pending approval state หายจาก constellation
- topic ใช้ Discipline viewport และ hard-coded `0.72` scale
- locked preview ไม่อธิบาย prerequisite
- loading/error/empty recovery
- broken image runtime fallback
- quest modal focus/motion continuity

### Recommendations

- shared Main Menu/Constellation design tokens
- mobile discipline pager/position indicator
- Overview -> Discipline transition
- fixture 4/5/6 disciplines
- Reset แบบ fit-content พร้อม label margin
- visual diff และ intermediate-frame assertions

## Quality-Control Protocol

1. Freeze commit, fixtures, browser versions และ screenshot viewport
2. รัน baseline suite และบันทึกผลจาก environment หลัก
3. ให้ specialist ตรวจอิสระโดยไม่เห็น severity ของคนอื่น
4. เพิ่ม targeted reproduction สำหรับทุก source-only finding
5. เก็บ source reference, settled screenshot และ intermediate/runtime evidence
6. QA Adjudicator รวมข้อซ้ำและตัดสินจากหลักฐาน ไม่ใช้เสียงข้างมาก
7. ส่งผลกลับให้ specialist ทุกคน Accept หรือ Object พร้อม contradictory evidence
8. Main agent ตรวจ contradiction และ rerun test ที่เป็น release gate
9. หลังแก้ต้องเพิ่ม regression assertion และ retest fixture เดิม

## Consensus Record

- Constellation Display Specialist: ACCEPT
- Website UI / Design-System Specialist: ACCEPT
- Layout, UX, Accessibility & Responsive Specialist: ACCEPT
- Motion & Interaction Specialist: ACCEPT
- Progressive Disclosure / Complexity Budget addendum: ACCEPT 4/4
- QA Adjudicator: approved with evidence downgrades and unsupported thresholds rejected

## Exit Gates

- baseline และ targeted suites ผ่านทั้งหมด
- ไม่มี P0/P1 ค้าง
- P2 ถูกแก้หรือมี owner รับความเสี่ยงพร้อม ticket
- mobile constellation อ่านและใช้งานได้จริงโดย preview ไม่ทำลายบริบท
- progression x role ทุก combination แยกออก
- keyboard journey, focus restoration และ reduced motion ผ่าน
- dirty admin work ไม่สูญหาย
- failure states มี fallback/retry
- screenshot review ไม่มี clipping, overlap, missing glyph หรือ broken media
- complexity budget ผ่านทุก navigation depth

