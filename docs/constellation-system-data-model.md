# Constellation System: Data Model

เอกสารนี้อธิบาย Data Contract ของ Constellation System ใน Phase 1 โดยใช้ชื่อจาก domain จริงและหลีกเลี่ยงคำว่า `Root` กับ `Child` ซึ่งไม่ได้อธิบายหน้าที่ของข้อมูล

Schema ที่อ้างอิง:

- `backend/src/models/ConstellationMap.ts`
- `backend/src/models/Skill.ts`

## 1. คำศัพท์หลัก

| ชื่อ | ความหมาย | ตัวอย่าง |
| --- | --- | --- |
| Discipline Constellation Map | แผนผังสาขาหลักของระบบ | Programming, Unity Development, Game Art |
| Topic Constellation Map | แผนผังการเรียนของหัวข้อเฉพาะ | 3D Modeling, VFX, Shader Graph |
| Topic Gateway Node | node ใน Discipline Map ที่ใช้เปิด Topic Map | 3D Modeling ใน Game Art |
| Lesson Node | node การเรียนหรือ quest ปกติ | Blender Setup, UV, Rigging |
| Boss Node | quest สำคัญปลาย branch | Scenery, Action |
| Capstone Node | quest สุดท้ายที่รวมหลาย branch | Cinematic |

คำเหล่านี้ใช้ทั้งใน schema, API และ UI เพื่อลดการแปลความหมายระหว่าง Engineer, Designer และ Content Designer

## 2. ภาพรวมโครงสร้าง

```text
Discipline Constellation Maps
├── Programming
├── Unity Development
├── Game Art
│   ├── 2D Art Gateway -> Topic Constellation Map
│   ├── 3D Modeling Gateway -> Topic Constellation Map
│   ├── Materials Gateway -> Topic Constellation Map
│   ├── Animation Gateway -> Topic Constellation Map
│   └── VFX Gateway -> Topic Constellation Map
└── Future Discipline Map
```

ระบบไม่ได้จำกัดจำนวน Discipline Map ไว้ที่ 3 ตัว การเพิ่มสาขาที่ 4 ใช้ข้อมูลใหม่โดยไม่ต้องเปลี่ยน schema

## 3. Discipline Constellation Map

Discipline Map คือแผนผังสาขาหลัก ผู้เล่นใช้เลือกหัวข้อที่จะเรียน เช่น Game Art แสดง 2D Art, 3D Modeling, Materials, Animation และ VFX

กฎ:

- `scope` ต้องเป็น `discipline`
- ไม่มี `parentMapId`
- ไม่มี `gatewaySkillId`
- node ภายในส่วนใหญ่มี `mapNodeRole` เป็น `topic-gateway`
- มี visual theme, viewport และลำดับการแสดงผลของตัวเอง

## 4. Topic Constellation Map

Topic Map คือแผนผังการเรียนเชิงลึกที่เปิดจาก Topic Gateway Node เช่น 3D Modeling Map เปิดจาก 3D Modeling Gateway ใน Game Art

```text
Game Art (Discipline Map)
└── 3D Modeling (Topic Gateway Node)
    └── 3D Modeling (Topic Map)
        ├── Blender Setup (Lesson)
        ├── Blender Basic (Lesson)
        ├── Scenery (Boss)
        ├── Action (Boss)
        └── Cinematic (Capstone)
```

กฎ:

- `scope` ต้องเป็น `topic`
- ต้องมี `parentMapId`
- ต้องมี `gatewaySkillId`
- ห้ามใช้ตัวเองเป็น `parentMapId`
- `gatewaySkillId` หนึ่งตัวเปิด Topic Map ได้เพียงหนึ่ง map

Topic Map เป็นเจ้าของความสัมพันธ์กับ parent และ gateway เพียงจุดเดียว ตัว Skill ไม่เก็บ ID ย้อนกลับไปยัง Topic Map จึงไม่มีข้อมูลซ้ำที่อาจขัดแย้งกัน

## 5. ConstellationMap Model

ไฟล์: `backend/src/models/ConstellationMap.ts`

### 5.1 Class และ Type

| ชื่อ | ประเภท | หน้าที่ |
| --- | --- | --- |
| `IConstellationMap` | TypeScript interface | รูปแบบข้อมูลของแผนผังทุกระดับ |
| `ConstellationMapSchema` | Mongoose schema | field, default, validation และ database index |
| `ConstellationMap` | Mongoose model | ใช้ query, create, update และ delete map |
| `ConstellationScope` | TypeScript type | จำกัดค่าเป็น `discipline` หรือ `topic` |
| `IConstellationVisualTheme` | TypeScript interface | รูปแบบภาพและสีของ map |
| `IConstellationViewport` | TypeScript interface | ขนาด canvas และขอบเขต zoom |

### 5.2 ตัวแปรใน `IConstellationMap`

| ตัวแปร | ประเภท | ความหมาย |
| --- | --- | --- |
| `name` | `string` | ชื่อที่แสดง เช่น `Game Art` หรือ `3D Modeling` |
| `slug` | `string` | รหัส URL/API ที่ไม่ซ้ำ เช่น `game-art-3d-modeling` |
| `description` | `string` | คำอธิบาย map |
| `scope` | `discipline \| topic` | หน้าที่ของ map |
| `parentMapId` | `ObjectId` | Discipline Map ที่เป็นเจ้าของ Topic Map |
| `gatewaySkillId` | `ObjectId` | Topic Gateway Node ที่ใช้เปิด Topic Map |
| `displayOrder` | `number` | ลำดับการแสดง map |
| `isActive` | `boolean` | เปิดหรือซ่อน map จากผู้เล่น |
| `visualTheme` | `IConstellationVisualTheme` | พื้นหลัง กรอบ และสีสถานะ |
| `viewport` | `IConstellationViewport` | ขนาด logical canvas และ zoom |
| `schemaVersion` | `number` | เวอร์ชันข้อมูลสำหรับ migration |
| `createdAt` | `Date` | วันที่สร้างโดย Mongoose |
| `updatedAt` | `Date` | วันที่แก้ไขล่าสุดโดย Mongoose |

## 6. Visual Theme

`visualTheme` แยกงานออกแบบออกจาก progression logic Designer สามารถเปลี่ยนรูปแบบของแต่ละ map ได้โดยไม่เปลี่ยนกฎ unlock

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `key` | `default` | รหัส theme เช่น `game-art` |
| `backgroundAssetUrl` | ไม่มี | URL ของ background หรือ texture |
| `frameStyle` | `luminous-minimal` | visual preset แบบเรียบและสว่าง |
| `backgroundColor` | `#f7f9fc` | สีพื้นหลัง canvas โทนขาวเย็น |
| `surfaceColor` | `#ffffff` | สีพื้นผิวของ Information Panel และ controls |
| `textColor` | `#182033` | สีข้อความหลัก |
| `mutedTextColor` | `#667085` | สีข้อความรอง |
| `borderColor` | `#d9e0ea` | สีเส้นขอบและเส้นแบ่งระดับอ่อน |
| `lineColor` | `#8b97aa` | สีเส้น constellation ปกติ |
| `unlockedColor` | `#1677ff` | สี node ที่สำเร็จแล้ว |
| `availableColor` | `#b77900` | สี node ที่พร้อมเรียน |
| `lockedColor` | `#a4adbb` | สี node ที่ยังล็อก |
| `bossColor` | `#d63c45` | สี Boss Node |
| `capstoneColor` | `#6d4aff` | สี Capstone Node |

## 7. Viewport

`viewport` กำหนดพื้นที่รวมของ map ส่วนตำแหน่ง node แต่ละตัวเก็บใน `Skill.treePosition`

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `width` | `1600` | ความกว้าง logical canvas |
| `height` | `900` | ความสูง logical canvas |
| `minZoom` | `0.3` | zoom ต่ำสุด |
| `maxZoom` | `3` | zoom สูงสุด |

`minZoom` ห้ามมากกว่า `maxZoom`

## 8. Skill Fields สำหรับ Constellation Map

ระบบยังใช้ Skill เป็นข้อมูลหลักของ node เพื่อรักษา cost, unlock, prerequisite, approval และ reward ที่มีอยู่แล้ว

| ตัวแปร | ประเภท | ความหมาย |
| --- | --- | --- |
| `constellationMapId` | `ObjectId` | map ที่วาง Skill node นี้อยู่ |
| `constellationPosition` | `{ x, y }` | พิกัดเฉพาะใน Constellation Map ไม่ใช้ร่วมกับ Quest Tree เดิม |
| `constellationLabel` | `string` | ชื่อบนแผนที่ ถ้าไม่กำหนดจะใช้ชื่อ Skill เดิม |
| `mapNodeRole` | `topic-gateway \| lesson \| boss \| capstone` | หน้าที่ของ node ใน map |
| `nodePreview` | object | ข้อมูล Information UI เมื่อ hover หรือ focus |

### 8.1 Map Node Role

| Role | ความหมาย | ตัวอย่าง |
| --- | --- | --- |
| `topic-gateway` | เปิด Topic Constellation Map | 3D Modeling ใน Game Art |
| `lesson` | บทเรียนหรือ quest ปกติ | Blender Setup, Shader, Animation |
| `boss` | quest สำคัญที่จบ branch | Scenery, Action |
| `capstone` | quest สุดท้ายที่รวมหลาย branch | Cinematic |

ชื่อ role อธิบายหน้าที่ของ node โดยไม่ชนกับ `Skill.nodeType` เดิม ซึ่งใช้ควบคุมระบบ adventure, asset, quest และ marker

## 9. Node Preview

`nodePreview` ใช้สร้าง Information UI บน Discipline Map

| ตัวแปร | ประเภท | ความหมาย |
| --- | --- | --- |
| `imageUrl` | `string` | ภาพตัวอย่างผลลัพธ์ของหัวข้อ |
| `summary` | `string` | คำอธิบายสั้น |
| `outcomes` | `string[]` | สิ่งที่ผู้เล่นจะสามารถทำได้ |
| `actionLabel` | `string` | ข้อความปุ่ม ค่าเริ่มต้น `View Path` |

ตัวอย่าง Topic Gateway Node:

```json
{
  "title": "3D Modeling",
  "constellationMapId": "<game-art-map-id>",
  "mapNodeRole": "topic-gateway",
  "nodePreview": {
    "imageUrl": "/uploads/3d-modeling.png",
    "summary": "Create and shape 3D assets for your games.",
    "outcomes": [
      "Build game-ready 3D assets",
      "Create props and environments",
      "Prepare models for Unity"
    ],
    "actionLabel": "View Path"
  }
}
```

ตัวอย่าง Topic Map ที่เปิดจาก node ด้านบน:

```json
{
  "name": "3D Modeling",
  "slug": "game-art-3d-modeling",
  "scope": "topic",
  "parentMapId": "<game-art-map-id>",
  "gatewaySkillId": "<3d-modeling-skill-id>"
}
```

## 10. ความสัมพันธ์ของข้อมูล

```text
ConstellationMap (Game Art, discipline)
    │
    ├── Skill (3D Modeling, topic-gateway)
    │       ▲
    │       │ gatewaySkillId
    │       │
    │   ConstellationMap (3D Modeling, topic)
    │       ├── Skill (Blender Setup, lesson)
    │       ├── Skill (Scenery, boss)
    │       ├── Skill (Action, boss)
    │       └── Skill (Cinematic, capstone)
    │
    └── Skill (VFX, topic-gateway)
```

การหา node ใน map ใช้ `Skill.constellationMapId` การหา Topic Map ที่เปิดจาก node ใช้ `ConstellationMap.gatewaySkillId`

## 11. Backward Compatibility

- Skill เดิมที่ไม่มี `constellationMapId` ยังทำงานได้
- `mapNodeRole` มีค่าเริ่มต้นเป็น `lesson`
- `User.unlockedSkills` ไม่เปลี่ยนรูปแบบ
- `connections` และ `prerequisites` ยังเป็น progression rules หลัก

ข้อมูล rollout ปัจจุบันใช้ `constellationPosition` แยกจาก `treePosition` และไม่เปลี่ยน Skill ID หรือ user unlock references ดูรายละเอียดที่ `docs/constellation-system-rollout.md`

## 12. ขอบเขตเดิมของ Phase 1

- มี `ConstellationMap` model และ validation
- Skill รองรับ map membership, role และ preview
- มี schema validation tests
- ยังไม่มี Constellation API
- ณ ตอนจบ Phase 1 ยังไม่มี migration, seed, Player UI หรือ Admin UI ส่วน implementation ปัจจุบันทำครบใน Phase ถัดมาแล้ว
