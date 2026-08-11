# Constellation System: Experience Design

เอกสารนี้เป็น Design Contract สำหรับ Phase 2 ใช้เป็นข้อตกลงระหว่าง Product, Designer และ Engineer ก่อนเริ่ม API และ UI implementation

Reference หลักคือ constellation canvas เดียวที่ซูมจาก Discipline Map เข้า Topic Gateway Node จากนั้นลดความเด่นของ Discipline Map และแสดง Topic Map รอบ node ที่เลือก

## 1. เป้าหมาย

- แสดง Discipline Constellation Map ปัจจุบัน 3 สาขา และเพิ่มสาขาที่ 4 ได้ในอนาคต
- ทำให้ผู้เล่นเข้าใจความสัมพันธ์ Discipline -> Topic -> Lesson Path
- แสดงผลลัพธ์ที่จะได้เรียนก่อนเปิด Topic Map
- รักษากฎ progression, unlock, approval และ prerequisites เดิม
- ใช้งานได้ด้วย mouse, keyboard และ touch

## 2. สิ่งที่ Phase 2 ไม่เปลี่ยน

- ไม่เปลี่ยน cost หรือ reward logic
- ไม่เปลี่ยนวิธี approve quest
- ไม่เปลี่ยนข้อมูล `User.unlockedSkills`
- ไม่สร้าง API หรือ migration
- ไม่แก้ Player UI และ Admin UI จริง

## 2.1 Visual Direction: Clean Luminous Luxury

Constellation UI ต้องให้ความรู้สึกสะอาด เรียบ หรู และมีแสง ไม่ใช้บรรยากาศมืดหรือหม่นแบบ fantasy UI หนัก

หลักการออกแบบ:

- ใช้พื้นหลังขาวเย็นหรือเทาอ่อน ไม่ใช้พื้นหลังดำเต็มพื้นที่
- ใช้พื้นที่ว่างมากพอให้ constellation แต่ละกลุ่มอ่านง่าย
- เส้น map บาง คม และมี glow เฉพาะ node สำคัญ
- Information Panel ใช้พื้นขาว ขอบบาง และ radius ไม่เกิน `8px`
- ลดลวดลายกรอบตกแต่ง ให้ title และ constellation เป็นจุดเด่น
- ไม่ใช้ gradient หนัก, texture มืด, vignette หรือเงาดำขนาดใหญ่
- ใช้ Blue, Gold, Red และ Violet เป็น status accents ไม่ใช้สีเดียวครองทั้งหน้าจอ

Typography:

- ชื่อ Discipline/Topic ใช้ serif ที่คมและอ่านง่ายเพื่อสร้างความหรู
- node label, controls และ Information Panel ใช้ system sans-serif
- ไม่ใช้ Dongle/Itim ใน Constellation UI เพราะบุคลิก playful เกินเป้าหมาย
- letter spacing เป็น `0`
- ขนาดข้อความต้องคงที่ตามชนิดของข้อมูล ไม่ scale ตาม viewport width

Default palette:

| Token | Color | หน้าที่ |
| --- | --- | --- |
| Canvas | `#f7f9fc` | พื้นหลังหลัก |
| Surface | `#ffffff` | panel และ controls |
| Primary text | `#182033` | title และ label หลัก |
| Secondary text | `#667085` | description และ metadata |
| Border | `#d9e0ea` | เส้นขอบบาง |
| Connection | `#8b97aa` | เส้น constellation |
| Unlocked | `#1677ff` | สำเร็จแล้ว |
| Available | `#b77900` | พร้อมเรียน |
| Boss | `#d63c45` | Boss Quest |
| Capstone | `#6d4aff` | Final achievement |

## 3. Information Architecture

```text
Constellation Overview
├── Programming Discipline Map
├── Unity Development Discipline Map
├── Game Art Discipline Map
└── Future Discipline Map

Focused Discipline View
├── Discipline Map
│   └── Topic Gateway Nodes
├── Topic Gateway Information Panel
└── Selected Topic Map
    ├── Lesson Nodes
    ├── Boss Nodes
    └── Capstone Node
```

## 4. Navigation States

ระบบมี 3 navigation states ที่ชัดเจน

### 4.1 Overview State

แสดง Discipline Maps ทั้งหมดในพื้นที่เดียวกัน:

- Programming
- Unity Development
- Game Art
- Discipline Map ใหม่ในอนาคต

แต่ละ map แยกจากกันโดยไม่มี connection line ข้าม discipline

การเลือก Discipline Map จะเข้าสู่ Focused Discipline State

### 4.2 Focused Discipline State

แสดง Discipline Map ที่เลือกในพื้นที่หลัก Topic Gateway Nodes ทั้งหมดมองเห็นได้และยังไม่มี Topic Map เปิด

เมื่อ hover, focus หรือแตะ Topic Gateway Node จะแสดง Information Panel ของหัวข้อนั้น

### 4.3 Topic Detail State

Topic Detail ใช้ canvas เดิมและ camera transition ไม่มีการแบ่งหน้าจอ:

```text
Discipline Map
    │
    ├── camera zooms toward selected Topic Gateway
    ├── Information Panel fades out
    ├── Discipline nodes and lines fade to background
    └── Topic Map nodes and lines fade in around the gateway
```

Selected Topic Gateway Node เป็น visual anchor ระหว่างสองระดับ แต่ไม่มี connection line เชื่อม Discipline Map กับ Topic Map เมื่อ transition เสร็จ Topic Map เป็น interaction layer หลัก ส่วน Discipline Map ยังคงมองเห็นจางๆ เพื่อรักษาความรู้สึกว่าได้ซูมเข้าไปใน constellation เดิม

## 5. Desktop Layout

Breakpoint: มากกว่า `768px`

### 5.1 Overview

- ใช้ canvas เต็มพื้นที่ quest section
- Discipline Map แต่ละตัวมีพื้นที่คงที่และไม่ซ้อนกัน
- 3 maps ใช้ layout 3 columns
- 4 maps ใช้ layout 2 x 2 บนหน้าจอที่พื้นที่ไม่พอ
- แต่ละ map แสดงชื่อ, progress และ Topic Gateway Nodes

### 5.2 Topic Detail

- ใช้ constellation canvas เต็มความกว้างโดยไม่มี pane หรือเส้นแบ่ง
- กล้องซูมและเลื่อนไปให้ selected Topic Gateway อยู่ใกล้ visual center
- Selected Gateway คง opacity และ glow เต็มระหว่าง transition
- Discipline lines ลด opacity เหลือประมาณ `12-18%`
- Discipline nodes ที่ไม่ถูกเลือก ลด opacity เหลือประมาณ `18-24%`
- Topic Map เริ่มที่ selected gateway แล้ว fade/scale เข้ามารอบจุดยึด
- Information Panel fade out ก่อน Topic Map เริ่มรับ interaction
- Pan/zoom controls หลัง transition ควบคุม Topic Map
- Back action เล่น transition ย้อนกลับและคืน camera ของ Discipline Map

### 5.3 Stable Dimensions

- พื้นที่ map สูงอย่างน้อย `620px`
- Topic node hit area อย่างน้อย `44 x 44px`
- Information Panel กว้าง `240-300px`
- Panel preview ใช้ aspect ratio `4 / 3`
- ความยาว outcome list สูงสุด 4 รายการ
- ชื่อ node ยาวต้องตัดบรรทัด ห้ามย่อ font ตาม viewport width

## 6. Mobile Layout

Breakpoint: `768px` หรือต่ำกว่า Mobile ใช้ drill-down transition แบบเดียวกับ desktop แต่ลดระยะ camera movement และแสดง Topic Map เต็มพื้นที่

### 6.1 Overview

- แสดง Discipline Map ครั้งละหนึ่งตัว
- เปลี่ยน map ด้วย horizontal swipe หรือ segmented selector
- แสดง progress ของ map ที่กำลังดู
- ตำแหน่ง pan/zoom ของแต่ละ map ต้องจำแยกกัน

### 6.2 Topic Gateway Interaction

Mobile ไม่มี hover:

1. แตะ Topic Gateway ครั้งแรกเพื่อเลือก node
2. แสดง Information Panel เป็น bottom sheet
3. แตะ `View Path` เพื่อเปิด Topic Map

### 6.3 Topic Map

- Topic Map ใช้พื้นที่เต็ม viewport ของ section
- แสดง breadcrumb และ Back control ด้านบน
- Discipline Map คงอยู่เป็น background layer ที่จางลง
- Information Panel ไม่แสดงค้างระหว่าง pan
- Zoom controls อยู่มุมล่างขวาและมี touch target อย่างน้อย `44px`

## 7. Breadcrumb และ Back Navigation

รูปแบบ breadcrumb:

```text
CONSTELLATIONS / GAME ART / 3D MODELING
```

กฎ:

- Overview ไม่มี breadcrumb ย้อนกลับ
- Focused Discipline แสดง `CONSTELLATIONS / GAME ART`
- Topic Detail แสดงครบ 3 ระดับ
- Browser Back ต้องย้อน navigation state ก่อนออกจาก Main Menu
- Back control ต้องคืน focus ไปยัง gateway node ที่ใช้เปิด Topic Map

## 8. Topic Gateway Information Panel

Information Panel แสดงข้อมูลจาก `Skill.nodePreview`

ลำดับเนื้อหา:

1. ชื่อ Topic
2. Summary หนึ่งย่อหน้าสั้น
3. Preview image
4. `YOU'LL BE ABLE TO` outcomes
5. Availability status
6. `View Path` action

กฎ:

- Desktop เปิดด้วย hover หรือ keyboard focus
- Panel คงอยู่เมื่อ pointer ย้ายจาก node เข้า panel
- Panel ปิดเมื่อ focus/pointer ออกจากทั้ง node และ panel
- Locked topic แสดงข้อมูลได้ แต่ action บอก prerequisite ที่ขาด
- Preview image โหลดไม่ได้ต้องแสดง fallback ที่มีชื่อ Topic
- Panel ไม่ใช้เป็น quest unlock modal

## 9. Node Interaction Model

### 9.1 Topic Gateway Node

- Hover/focus: แสดง Information Panel
- Click/Enter: เลือก node
- `View Path`: เปิด Topic Map
- ไม่เปิด quest modal ของระบบเดิม

### 9.2 Lesson Node

- Hover/focus: highlight node และ prerequisite path
- Click/Enter: เปิด quest detail modal เดิม
- Unlock และ approval ใช้ logic เดิม

### 9.3 Boss Node

- ใช้ interaction เหมือน Lesson Node
- ใช้สีแดงและขนาดใหญ่กว่า Lesson Node
- label แสดง `BOSS QUEST` และชื่อ quest
- Action และ Scenery เป็นคนละ branch

### 9.4 Capstone Node

- ใช้ interaction เหมือน Lesson Node
- มี visual emphasis สูงสุด
- available เมื่อ prerequisites จากทุก branch สำเร็จ
- Cinematic ต้องรับ prerequisite จาก Action และ Scenery

## 10. Visual States

สถานะ progression และ role เป็นคนละแกน

| Progression state | ความหมาย | Visual treatment |
| --- | --- | --- |
| `unlocked` | ผู้เล่นสำเร็จหรือปลดล็อกแล้ว | cyan, glow คงที่, connection ก่อนหน้าสว่าง |
| `available` | prerequisite ครบและพร้อมดำเนินการ | gold, pulse เบา |
| `locked` | prerequisite ยังไม่ครบ | muted blue-gray, glow ต่ำ |
| `pending` | ส่ง approval แล้ว | amber ring แบบ dashed |

| Node role | Visual treatment เพิ่มเติม |
| --- | --- |
| `topic-gateway` | ขนาดใหญ่กว่า lesson และมี selection ring |
| `lesson` | star node มาตรฐาน |
| `boss` | red star พร้อม outer spikes |
| `capstone` | star ขนาดใหญ่ที่สุดพร้อม double halo |

ห้ามใช้สีอย่างเดียวในการสื่อสถานะ ต้องมี shape, ring, icon หรือ label ร่วมด้วย

## 11. Connection Lines

- Connection ภายใน map ใช้เส้นจาก `Skill.connections`
- Discipline Maps ไม่มีเส้นเชื่อมข้ามกัน
- ไม่มี connection line ข้ามระหว่าง Discipline layer และ Topic layer Selected Gateway เป็น visual anchor เท่านั้น
- Completed path ใช้เส้นสว่างและหนาขึ้น
- Available path ใช้สี theme ปกติ
- Locked path ลด opacity
- Boss merge ต้องเห็นชัดว่า Scenery และ Action เชื่อมเข้า Cinematic
- Arrowhead แสดงเฉพาะเมื่อข้อมูล connection ระบุให้แสดง

## 12. Pan และ Zoom

- ใช้ canvas และ camera เดียว แต่เก็บ camera snapshot แยกตาม `ConstellationMap._id`
- Zoom range ใช้ `ConstellationMap.viewport`
- Reset คืนค่ากล้องของ map ที่ active เท่านั้น
- Wheel zoom ต้องยึดตำแหน่ง pointer เป็นศูนย์กลาง
- Drag บนพื้นหลังเพื่อ pan
- Drag จาก node ไม่เริ่ม pan
- เปิด Information Panel แล้ว pan canvas ได้โดย panel ไม่เคลื่อนตาม SVG
- ระหว่าง drill-down transition ต้องปิด pan/zoom ชั่วคราวเพื่อป้องกัน camera state ชนกัน
- Back action คืน Discipline camera snapshot ก่อนเปิด interaction อีกครั้ง

## 13. Motion

- Hover/focus transition: `160-200ms`
- เปิด Information Panel: `180-240ms`
- เปลี่ยน Overview -> Focused Discipline: ไม่เกิน `300ms`
- Drill-down camera zoom: `320-420ms`
- Discipline fade และ Topic Map fade ซ้อนกันได้ แต่ transition รวมต้องไม่เกิน `600ms`
- Topic Map เริ่ม fade in หลัง camera transition ผ่านประมาณ `45%`
- Available pulse ต้องไม่เร็วกว่า `1.5s`
- รองรับ `prefers-reduced-motion: reduce`
- Reduced motion ปิด pulse และเปลี่ยน layer ด้วย cross-fade ไม่ใช้ camera animation

## 14. Accessibility

- SVG node ทุกตัวต้อง focus ได้
- ใช้ semantic button behavior: Enter และ Space ทำงานเหมือน click
- `aria-label` ต้องมีชื่อ, role และ progression state
- Hover behavior ทุกอย่างต้องทำงานผ่าน keyboard focus ได้
- Focus ring ต้องมองเห็นบนทุก node state
- Text contrast อย่างน้อย WCAG AA
- Touch target อย่างน้อย `44 x 44px`
- Screen reader ต้องอ่าน prerequisite ที่ขาดก่อน action
- หลังปิด Topic Map focus กลับ gateway node เดิม

## 15. Loading, Empty และ Error States

### Loading

- แสดง star skeleton ตามขนาด canvas คงที่
- controls disabled จนข้อมูล map พร้อม
- ห้ามเปลี่ยนความสูง layout ระหว่าง loading กับ loaded

### Empty

- Discipline Map ไม่มี topic แสดงชื่อ map และ empty constellation marker
- Topic Map ไม่มี lesson แสดงข้อความ `No learning path published yet`

### Error

- โหลด Overview ไม่สำเร็จแสดง retry ใน quest section
- โหลด Topic Map ไม่สำเร็จต้อง reverse transition กลับ Discipline Map และรักษา selected node ไว้
- Preview image error ไม่ทำให้ panel ปิด

## 16. Component Boundaries สำหรับ Phase 4

ชื่อเหล่านี้เป็น implementation contract ไม่ใช่ code ใน Phase 2:

```text
ConstellationExperience
├── DisciplineOverview
├── ConstellationStage
│   ├── DisciplineLayer
│   ├── TopicLayer
│   └── ConstellationCanvas
│       ├── ConstellationConnections
│       └── ConstellationNode
├── TopicPreviewPanel
├── ConstellationBreadcrumb
└── ConstellationControls
```

`ConstellationCanvas` ต้องใช้ร่วมกันระหว่าง Discipline Map, Topic Map และ Admin editor เพื่อไม่ให้ player/admin คำนวณ layout คนละแบบ

## 17. Acceptance Criteria

Phase 2 ถือว่าผ่านเมื่อยืนยันประเด็นต่อไปนี้:

- Overview รองรับ 3 Discipline Maps ปัจจุบันและ map ที่ 4
- Desktop และ Mobile ใช้ single-canvas drill-down โดยไม่มี split view
- Discipline layer จางลงและ Topic layer fade in รอบ selected gateway
- Back action reverse transition และคืน camera/focus เดิม
- Mobile ใช้ Information Panel แบบ bottom sheet ก่อน drill-down
- Topic Gateway ไม่เปิด quest modal เดิม
- Lesson, Boss และ Capstone ยังใช้ quest modal และ progression เดิม
- Scenery กับ Action merge เข้า Cinematic อย่างชัดเจน
- Mouse, keyboard และ touch มี flow เทียบเท่ากัน
- Designer สามารถเปลี่ยน visual theme โดยไม่เปลี่ยน progression logic
