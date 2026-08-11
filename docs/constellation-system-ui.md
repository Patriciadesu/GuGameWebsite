# Constellation System: Player and Admin UI

เอกสารนี้อธิบาย UI implementation ใน Phase 4 และความรับผิดชอบของ component/state หลัก

## Progressive Rollout

`MainMenu` โหลด Discipline Maps จาก `GET /api/constellation-maps?scope=discipline`

- ถ้ามี Discipline Map อย่างน้อยหนึ่งรายการ จะแสดง `ConstellationTree`
- ถ้ายังไม่มี map หรือ API ใช้งานไม่ได้ จะแสดง Quest Tree เดิม
- unlock modal, approval, AP cost และ quest completion ยังใช้ flow เดิม

วิธีนี้ทำให้ deploy code ก่อน seed data ได้โดยผู้เล่นไม่เจอหน้าว่าง

## Player Components

### `ConstellationTree`

ไฟล์: `frontend/src/components/ConstellationTree.tsx`

รับผิดชอบ navigation และ rendering ของ Player Constellation ทั้งหมดบน visual canvas เดียว

| State | ความหมาย |
| --- | --- |
| `disciplineDetails` | Discipline Maps พร้อม Topic Gateway Nodes ที่โหลดแล้ว |
| `selectedDisciplineId` | Discipline ที่ผู้เล่นกำลัง focus |
| `previewSkill` | Topic Gateway ที่กำลัง hover, focus หรือแตะ |
| `topicGateway` | gateway anchor ที่ใช้เปิด Topic Map ปัจจุบัน |
| `topicDetail` | Topic Map และ lesson/boss/capstone nodes ที่เปิดอยู่ |
| `camera` | zoom และ translation ของ canvas |
| `loadingTopic` | ป้องกันการเปิด Topic ซ้ำระหว่าง request |

Navigation states:

1. Overview แสดง Discipline Maps แยกจากกัน
2. Focused Discipline แสดง gateway nodes และ Information Panel ด้านซ้าย
3. Topic Detail zoom เข้าหา gateway, ลด opacity ของ Discipline Map และ fade Topic Map เข้ามา

Browser Back และปุ่ม Back ย้อน Topic -> Discipline -> Overview ก่อนออกจากหน้า

### Rendering Helpers

| Function | หน้าที่ |
| --- | --- |
| `pointForSkill` | ใช้ `constellationPosition` หรือสร้าง fallback radial position โดยไม่แตะ `treePosition` เดิม |
| `pathBetween` | สร้าง connection แบบเส้นตรง `M ... L ...` เท่านั้น |
| `constellationBranches` | สร้าง visual-only branches ให้ Topic Gateways เชื่อมเป็นกลุ่มดาวโดยไม่เปลี่ยน progression |
| `renderMapLayer` | render line, star node, status และ role ของ map หนึ่งระดับ |
| `statusForSkill` | แปลง progression เป็น unlocked, available หรือ locked |
| `openTopic` | หา Topic Map ด้วย `gatewaySkillId` แล้วโหลดรายละเอียด map |

`renderMapLayer` ใช้กับทั้ง Discipline และ Topic เพื่อให้ node states และ visual rules ไม่แยก implementation

### Responsive Behavior

- เมื่อมี 3 Discipline จะแสดง 3 columns บน visual canvas เดียว
- เมื่อเพิ่ม Discipline ที่ 4 จะเปลี่ยนเป็น 2 x 2 ด้วย `data-map-count` โดยไม่แก้ component
- Mobile แสดง Discipline Map ครั้งละหนึ่งตัวด้วย horizontal paging
- Mobile Information Panel เป็น bottom sheet และซ่อน zoom controls ขณะ panel เปิด
- Reduced-motion ใช้ transition ระยะสั้นแทน camera animation

## Admin Component

### `ConstellationAdmin`

ไฟล์: `frontend/src/components/ConstellationAdmin.tsx`

รับผิดชอบ map ownership และ node placement metadata ไม่แก้ quest content, rewards หรือ approval logic

ความสามารถ:

- โหลด maps ทุกหน้าด้วย REST cursor จน `nextCursor` เป็น `null`
- สร้างและแก้ Discipline/Topic Map
- เลือก parent Discipline และ gateway ของ Topic Map
- publish/hide map
- assign/unassign Skill จาก map
- เลือก `topic-gateway`, `lesson`, `boss` หรือ `capstone` ตาม scope
- แก้ `constellationLabel` และพิกัด `constellationPosition.x/y` โดยไม่เปลี่ยนชื่อหรือพิกัด Quest Tree เดิม
- แก้ preview image, summary, outcomes และ action label ของ Topic Gateway
- ลาก node บน Visual Layout canvas โดยเห็น connection เส้นตรงตามข้อมูลจริง
- zoom, pan, snap grid และขยับ node ที่เลือกด้วยปุ่มลูกศร (`Shift` = 20 units)
- แสดงจำนวนตำแหน่งที่ยังไม่ save, reset draft และเตือนก่อนเปลี่ยน map
- save เฉพาะ nodes ที่เปลี่ยนด้วย batch layout endpoint หนึ่ง request

Backend เป็นผู้ตัดสิน ownership rules ขั้นสุดท้าย Admin UI จำกัดตัวเลือกไว้ล่วงหน้าเพื่อลด input error แต่ไม่ใช้ client validation แทน server validation

### `ConstellationLayoutEditor`

ไฟล์: `frontend/src/components/ConstellationLayoutEditor.tsx`

Component นี้เป็น visual tool ที่ไม่ถือข้อมูลถาวรเอง รับ `positions` และ `dirtySkillIds` จาก `ConstellationAdmin` แล้วส่งการลากกลับผ่าน `onPositionChange` วิธีนี้ทำให้ form X/Y, canvas และ batch save ใช้ draft ชุดเดียวกัน

Editor เลือก geometry ตาม scope เดียวกับ Player และสร้างรูปทรง `M x y L x y` เสมอ จึงเป็น preview ของผลลัพธ์จริง ไม่ใช่แผนผังคนละชุด

### WYSIWYG Visual Contract

Editor และ Player ใช้ visual primitives ชุดเดียวกัน:

- `ConstellationNodeGlyph` render aura, star, core, label, Boss/Capstone kicker และ start ring
- `constellationVisuals.ts` เป็นเจ้าของ fallback position, straight path, Discipline branch geometry และ deterministic background stars
- Discipline Editor ใช้ nearest-branch geometry แบบเดียวกับ Player แทน Skill connections
- Topic Editor แสดงเฉพาะ `Skill.connections` แบบเดียวกับ Player และไม่สร้างเส้นเพิ่มจาก prerequisites
- map theme variables, focused header, status legend, canvas grid, glow และ camera controls ใช้ class contract เดียวกับ Player

สิ่งที่มีเฉพาะ edit mode คือ selection ring, dirty marker, coordinate status, snap, reset และ batch save จึงไม่เปลี่ยนภาพผลลัพธ์ที่ผู้เล่นจะเห็น

หน้า Super Admin แยก `Constellation Layout` กับ `Legacy Quest Tree` เป็นคนละ editor mode เพื่อไม่ให้ canvas สองระบบซ้อนกัน โดยเปิด Constellation เป็นค่าเริ่มต้น

## Shared Types

ไฟล์: `frontend/src/components/constellationTypes.ts`

| Type | ความหมาย |
| --- | --- |
| `ConstellationMap` | REST representation ของ Discipline หรือ Topic Map |
| `ConstellationSkill` | Skill node ที่มี constellation metadata |
| `ConstellationScope` | `discipline` หรือ `topic` |
| `MapNodeRole` | `topic-gateway`, `lesson`, `boss`, `capstone` |
| `ConstellationTheme` | design tokens ของ map |

## Visual Regression Tests

ไฟล์: `frontend/tests/constellation.visual.spec.ts`

```bash
cd frontend
npm run test:visual
```

Tests ใช้ route fixtures จึงไม่เขียนข้อมูลลง MongoDB และครอบคลุม:

- Player Overview 3 Discipline Maps
- Topic Gateway hover Information Panel
- Topic zoom/fade และ Boss/Capstone nodes
- Mobile bottom preview
- Admin map/node ownership workspace
- Admin drag, dirty state, straight-line preview และ batch layout save
- Player/Admin shared glyph and branch parity
- Mobile Admin Editor ไม่มี horizontal overflow

Screenshot สำหรับการตรวจอยู่ที่ `/tmp/constellation-visual/` รวม `admin-layout-editor.png`
