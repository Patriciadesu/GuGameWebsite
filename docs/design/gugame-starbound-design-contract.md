# GuGame Starbound UI Design Contract

สถานะ: Canonical design reference

เอกสารนี้ล็อกภาษาภาพ ลำดับความสำคัญ และพฤติกรรมของหน้าหลัก GuGame ตามต้นแบบ Starbound Game UI เพื่อป้องกันไม่ให้การพัฒนารอบถัดไปค่อย ๆ กลับไปเป็น dashboard, SaaS หรือ UI สำเร็จรูปที่ไม่ให้ความรู้สึกเป็นเกม

## แหล่งอ้างอิงหลัก

- Interactive reference: `docs/design/reference/gugame-starbound-checkpoint.html`
- Topic screenshot: `docs/design/reference/gugame-starbound-topic.png`
- Production components: `frontend/src/pages/MainMenu.tsx` และ `frontend/src/components/ConstellationTree.tsx`
- Production styles: `frontend/src/pages/MainMenu.css` และ `frontend/src/components/ConstellationTree.css`

เมื่อเอกสารกับ interactive reference ขัดกัน ให้ยึด interactive reference สำหรับรูปลักษณ์และ spatial hierarchy แต่ให้ยึด production behavior สำหรับข้อมูลจริง การอนุญาต และ progression logic

## Design Intent

หน้าหลักต้องรู้สึกเหมือนเมนูพัฒนาตัวละครในเกม Fantasy Sci-fi ที่อยู่ในจักรวาลดวงดาว ไม่ใช่เว็บจัดการข้อมูลที่เปลี่ยนพื้นหลังเป็นสีดำ

บุคลิกหลัก:

- Game-like, celestial, focused และมีความลึกลับพอดี
- Clean และอ่านง่าย แม้ฉากหลังจะมืด
- เส้นและกรอบมีความละเอียดแบบเครื่องมือดูดาว แต่ไม่เป็น cockpit หรือแผงควบคุมเครื่องบิน
- ความสนุกมาจาก constellation, progression state และ quest hierarchy ไม่ใช่ decoration จำนวนมาก
- ไม่ใช้ purple gradient, glass card จำนวนมาก, orb, bokeh หรือองค์ประกอบที่ไม่มีหน้าที่

## Information Hierarchy

ลำดับสิ่งที่ผู้ใช้ต้องเห็น:

1. Constellation map และตำแหน่งดาวที่เลือก
2. ชื่อ Discipline หรือ Topic ที่กำลังดู
3. สถานะของดาวและเส้นทางที่จะไปต่อ
4. Quest/Topic information panel ทางซ้าย
5. Primary action เช่น `Enter 3D Modeling` หรือ `Begin Boss Quest`
6. Player resources และ progress
7. Navigation รอง

แผนที่ต้องครองพื้นที่ส่วนใหญ่ของ viewport เสมอ แผงข้อมูลและ navigation ต้องไม่แย่งความเด่นจากแผนที่

## Layout Contract

### Desktop

- Product window เป็นพื้นผิวเต็มกว้าง สี `Void` และมีกรอบ 1px
- HUD สูงประมาณ 68px แบ่งเป็น Brand / Current location / Player stats
- Main content แบ่งเป็น info panel ซ้าย 290px และ constellation canvas ที่เหลือ
- Bottom navigation สูง 62px และวางติดขอบล่างของ product window
- Canvas ต้องมีพื้นที่ว่างรอบ constellation เพื่อให้รูปทรงอ่านออก แต่ต้องไม่เล็กจนดูเหมือน diagram ใน card
- Map controls อยู่มุมขวาล่างและไม่บัง node หรือ label
- Legend อยู่มุมซ้ายล่างของ canvas

### Mobile

- HUD ลดเหลือ Brand และ resource สำคัญหนึ่งรายการ
- ซ่อน location ตรงกลางและสถิติรอง
- Canvas มาก่อน info panel เพื่อให้ผู้ใช้ยังรับรู้ตำแหน่งในจักรวาล
- Canvas สูงประมาณ 560px และรักษาขนาด constellation ด้วย viewport ภายใน ไม่บีบ node จนเล็ก
- Map controls เรียงแนวตั้งที่มุมขวาบนใต้ heading
- Info panel เปลี่ยนจาก sidebar เป็น section ใต้ canvas
- Bottom navigation กระจายเท่ากันและใช้ touch target อย่างน้อย 44px

## Color Tokens

| Token | Value | หน้าที่ |
| --- | --- | --- |
| Void | `#080c18` | ฉากหลังหลัก |
| Space | `#0d1426` | พื้นผิวรอง |
| Panel | `#111a2d` | Panel และ node shell |
| Panel 2 | `#172238` | Hover/raised surface |
| Ink | `#f2eee3` | ข้อความหลัก สีขาวอุ่น |
| Muted | `#9ca9bd` | คำอธิบายและ metadata |
| Line | `#36445e` | เส้นแบ่งและกรอบ |
| Cyan | `#4de7ff` | Awakened, selected, active |
| Blue | `#62a2ff` | Progress และ informational accent |
| Gold | `#ffc45b` | Available และ primary action |
| Red | `#ff5d68` | Boss quest และ danger |
| Violet | `#ad86ff` | Pending review เท่านั้น |
| Green | `#63d5a0` | Success ที่ไม่ใช่ progression state |

ห้ามใช้สี semantic สลับความหมายระหว่างหน้า เช่น ดาว Available ต้องเป็น Gold ทุกหน้า และ Boss Quest ต้องเป็น Red ทุกหน้า

## Typography

- Display และชื่อโลกใช้ `Georgia`, `Times New Roman`, serif
- UI text ใช้ `Noto Sans Thai`, `Trebuchet MS`, sans-serif
- Heading ใช้ serif น้ำหนัก 500 ไม่ใช้ bold หนามาก
- Kicker และ metadata ใช้ uppercase ขนาดเล็ก พร้อม letter spacing บวก
- ข้อความเนื้อหาใช้ line-height อย่างน้อย 1.45
- ไม่ scale font ตาม viewport width
- ชื่อ node ต้องอ่านได้บนพื้นหลังและห้ามชน node, เส้น หรือ label อื่น

## Constellation Model

### Universe Overview

- Programming, Unity Development และ Game Art เป็น constellation แยกจากกันโดยสมบูรณ์
- ในอนาคตต้องรองรับ Discipline ที่ 4 โดยเพิ่ม constellation ใหม่ ไม่เชื่อมเส้นข้าม Discipline
- แต่ละ Discipline แสดง gateway stars ของ Topic ภายใน
- Discipline ที่เลือกมี orbit halo และรายละเอียดอยู่ใน info panel ซ้าย

### Discipline View

- Topic เป็นดาวใน Discipline constellation
- Single click เลือกดาวและเปิด preview
- การเข้า Topic เป็นการ zoom/fade เข้าไปในตำแหน่งเดิม ไม่ใช่เปลี่ยนเป็นคนละหน้าแบบตัดทันที
- Discipline layer จางลงเมื่อ Topic layer fade in เพื่อรักษา spatial context

### Topic View

- ดาวภายในคือ Quest หรือ learning step
- เส้นทางสามารถแตกแขนงและรวมกลับได้
- 3D Modeling ใช้ trunk ก่อนแยกเป็น Painting Path และ Modeling Path
- Painting Path จบที่ Boss Quest `Scenery`
- Modeling Path จบที่ Boss Quest `Action!`
- สอง Boss Quest รวมเข้าสู่ Big Boss Quest `Cinematic`

## Node And Connection States

### Awakened / Complete

- Cyan shell และ cyan core
- เส้นที่ผ่านแล้วเป็น cyan ทึบ
- สามารถมี glow เบา ๆ แต่ข้อความต้องยังคม

### Available

- Gold shell และ gold core
- เส้นที่เปิดให้ไปต่อเป็น gold ทึบ
- Primary action ของดาวนี้ใช้ gold เช่นเดียวกัน

### Pending

- Violet shell/core
- แสดงข้อความ `Pending review`
- ห้ามใช้ Red เพราะ Red สงวนให้ Boss และ destructive state

### Locked

- Blue-gray shell/core
- เส้นเป็น dashed และลด opacity
- Label ต้องยังอ่านได้ แต่ visual weight ต่ำกว่า Available

### Boss Quest

- Red star ที่ใหญ่กว่าดาวปกติ
- แสดง kicker `Boss Quest`
- Selected Boss มี cyan orbit halo รอบ red star เพื่อแยก selection ออกจาก node type

### Capstone / Big Boss

- ใหญ่ที่สุดใน Topic constellation
- ใช้ cyan/ice-blue เป็น landmark
- แสดง `Big Boss` และ lock state ชัดเจน
- ต้องอยู่ตรงจุดที่ branch ทั้งหมดมารวมกัน

## Information Panel

- Desktop อยู่ซ้ายเสมอ ไม่ย้ายไปขวา
- แสดงข้อมูลเฉพาะ node หรือ path ที่เลือก
- โครงสร้างข้อมูล: Kicker, title, flavor line, description, output preview, objective, rewards และ primary action
- Output preview ต้องแสดงผลลัพธ์ที่ผู้ใช้จะสร้างได้ ไม่ใช่ภาพบรรยากาศทั่วไป
- Primary action อยู่ล่างสุด ใช้ Gold และทรงมุมตัด
- ไม่มี form, filter หรือ control ที่ไม่เกี่ยวกับการตัดสินใจปัจจุบัน
- ระหว่างยังไม่เลือกดาว ให้ panel แสดง Discipline summary และ next recommended path

## HUD And Navigation

- Brand อยู่ซ้ายพร้อม diamond sigil
- Current location อยู่กลาง เช่น `Skill Constellations` หรือ `Game Art · 3D Modeling`
- Player stats อยู่ขวาและมีเพียง resource ที่ช่วยตัดสินใจในหน้านี้
- Bottom navigation ประกอบด้วย Constellations, Guild, Rewards และ Shop
- Active navigation ใช้ Gold text กับ underline 1px
- Editor/Admin entry ไม่ควรแย่งพื้นที่ใน player navigation

## Motion

- Selected orbit หมุนช้า 7 วินาทีต่อรอบ
- Topic transition ใช้ zoom และ cross-fade ประมาณ 260-380ms
- Panel เข้าโดย fade/slide ระยะสั้น ไม่เกิน 8px
- Direct manipulation เช่น pan ต้องยกเลิก transition ระหว่างลาก
- รองรับ `prefers-reduced-motion`; ปิด orbit และ transition ที่ไม่จำเป็น
- ไม่ใช้การกระพริบเร็วหรือ glow pulse ต่อเนื่องกับทุก node

## Interaction And Accessibility

- Node ต้องกดได้ด้วย pointer, Enter และ Space
- Hit target ของ node และ icon button อย่างน้อย 44px
- ทุก icon button มี accessible name และ tooltip
- สีไม่ใช่วิธีเดียวในการสื่อสถานะ ต้องมีข้อความ state หรือ legend
- Focus state ต้องมองเห็นได้บนพื้นหลังมืด
- Zoom รองรับปุ่ม, wheel และ trackpad
- Pan เริ่มจากพื้นที่ว่าง ไม่ทำให้ node ขยับเมื่อผู้ใช้ click
- Back navigation ต้องคืน focus ไปยัง gateway เดิม
- ไม่ให้เกิด horizontal page overflow ที่ 320px ขึ้นไป

## Content Voice

- ชื่อ quest สั้นและเป็น action หรือ craft ที่ชัดเจน
- Flavor text สร้างโลกได้ แต่ต้องไม่แทนคำอธิบายงานจริง
- Objective บอกสิ่งที่ต้องส่งหรือทำให้สำเร็จ
- Reward และ unlock บอกผลที่เกิดหลังทำสำเร็จ
- ใช้คำว่า `Awakened` ใน presentation ได้ แต่ API/domain state ยังคงใช้ชื่อเดิม เช่น `unlocked`

## Review-Only Elements

ตัวเลือก `Check screen`, `Skill universe` และ `3D Modeling quest` ด้านนอก product window มีไว้สลับ state ใน design checkpoint เท่านั้น ห้ามนำไปแสดงใน production

## Production Mapping

| Reference | Production |
| --- | --- |
| `.gg-window` | `.main-panel` และ `.constellation-shell` |
| `.gg-hud` | `.topbar` |
| `.gg-info` | `.constellation-info-panel` |
| `.gg-map` | `.constellation-canvas-wrap` |
| `.gg-node` | `.constellation-node` |
| `.gg-path` | `.constellation-lines path` |
| `.gg-map-tools` | `.constellation-camera-controls` |
| `.gg-bottom-nav` | Player navigation implementation |

## Acceptance Checklist

- [ ] First viewport อ่านเป็นเกม constellation โดยไม่ต้องเห็น logo
- [ ] Canvas เด่นกว่า profile, leaderboard และ inventory
- [ ] Info panel อยู่ซ้ายบน desktop และใต้ canvas บน mobile
- [ ] Cyan/Gold/Violet/Gray/Red มีความหมายคงที่
- [ ] Boss และ Capstone แยกออกจาก lesson node ได้ทันที
- [ ] Discipline constellations ไม่เชื่อมถึงกัน
- [ ] Topic transition รักษา spatial context
- [ ] ไม่มี generic white card หลุดเข้ามาใน player view
- [ ] ไม่มีข้อความหรือ control ซ้อนทับ node/label
- [ ] Pan, zoom, select, preview, enter topic และ back ใช้งานได้ด้วย mouse และ keyboard
- [ ] Desktop และ mobile ไม่มี horizontal overflow
- [ ] Reduced motion mode ใช้งานได้

