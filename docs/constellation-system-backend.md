# Constellation System: Backend API and Migration

เอกสารนี้อธิบาย backend contract ใน Phase 3 การกำหนด ownership และวิธีเตรียม migration โดยไม่เปลี่ยน progression เดิม

## Authorization

| Operation | Role |
| --- | --- |
| อ่าน active maps และ active nodes | authenticated user |
| อ่าน inactive maps และ nodes | admin หรือ super-admin โดยใช้ `includeInactive=true` |
| สร้าง แก้ไข และลบ map | super-admin |
| กำหนด Skill ลง map | super-admin ผ่าน Skill API |
| บันทึก visual layout แบบ batch | super-admin |

## Read API

### `GET /api/constellation-maps`

คืนรายการ map ที่ active เรียงตาม `displayOrder` แล้วตาม `name`

Query parameters:

- `scope=discipline|topic` กรองระดับ map
- `parentMapId=<id>` กรอง Topic Maps ของ Discipline Map
- `gatewaySkillId=<id>` หา Topic Map ที่เปิดจาก Topic Gateway Node
- `includeInactive=true` ใช้ได้เฉพาะ admin และ super-admin
- `limit=1..100` จำกัดจำนวนผลลัพธ์ ค่าเริ่มต้น `50`
- `cursor=<token>` อ่านหน้าถัดไปโดยไม่ใช้ offset

Response มี `pagination.nextCursor` ถ้ามีหน้าถัดไป Client ส่งค่านี้กลับมาเป็น `cursor`

### `GET /api/constellation-maps/:id`

คืน `{ map, skills }` โดย skills คือ nodes ที่มี `constellationMapId` ตรงกับ map

เมื่อผู้เล่นเลือก Topic Gateway Node ให้หา Topic Map ด้วย:

```text
GET /api/constellation-maps?gatewaySkillId=<skill-id>&limit=1
```

จากนั้นใช้ `GET /api/constellation-maps/:id` เพื่อโหลด map และ nodes สำหรับ transition แบบ zoom-in

Content links ของ asset node ที่ยังล็อกยังถูกซ่อนด้วยกฎเดิม

## Write API

### `POST /api/constellation-maps`

สร้าง Discipline Map หรือ Topic Map ใหม่ ใช้ fields ตาม `ConstellationMap` model

### `PATCH /api/constellation-maps/:id`

แก้ไข map เฉพาะ fields ที่ส่งมา การส่ง `null` ให้ `parentMapId` หรือ `gatewaySkillId` ใช้ล้างค่าเมื่อเปลี่ยนเป็น Discipline Map

### `PATCH /api/constellation-maps/:id/layout`

บันทึก `constellationPosition` ของหลาย nodes ใน request เดียวสำหรับ Visual Layout Editor

```json
{
  "nodes": [
    { "skillId": "<skill-id>", "x": 430, "y": 390 },
    { "skillId": "<skill-id>", "x": 800, "y": 700 }
  ]
}
```

Server ตรวจ contract ต่อไปนี้ก่อน `bulkWrite`:

- request มี 1-500 nodes และไม่มี `skillId` ซ้ำ
- `skillId` ทุกตัวเป็น ObjectId และเป็นสมาชิกของ map ใน URL
- `x/y` เป็น finite number และอยู่ภายใน `map.viewport`
- การผิด ownership ได้ HTTP `409`; payload หรือพิกัดไม่ถูกต้องได้ HTTP `400`

Endpoint นี้เปลี่ยนเฉพาะ `constellationPosition` ไม่แก้ `treePosition`, progression หรือ connection

### `DELETE /api/constellation-maps/:id`

ลบได้เมื่อไม่มี Skill อยู่ใน map และไม่มี Topic Map อ้างเป็น parent ระบบไม่ cascade ข้อมูล progression

### Skill API fields

`POST /api/skills` และ `PUT /api/skills/:id` รองรับ:

- `constellationMapId`
- `mapNodeRole`
- `nodePreview`

Skill ที่เป็น gateway จะลบ ย้ายออกจาก Discipline Map หรือเปลี่ยน role ไม่ได้จนกว่าจะลบ Topic Map ที่เปิดจาก Skill นั้นก่อน

## Ownership Rules

1. Discipline Map รับเฉพาะ `topic-gateway` nodes
2. Topic Map รับ `lesson`, `boss` และ `capstone` nodes
3. Topic Map ต้องมี `parentMapId` ที่ชี้ไป Discipline Map
4. `gatewaySkillId` ต้องเป็น Topic Gateway ใน parent map เดียวกัน
5. การลบ map หรือ gateway ที่ยังมี dependency จะได้ HTTP `409`

## Migration Tool

คำสั่ง audit แบบ read-only:

```bash
cd backend
npm run migrate:constellations
```

ตรวจ initial manifest โดยไม่เขียนฐานข้อมูล:

```bash
npm run migrate:constellations -- --file ./migration/constellations.initial.json
```

เขียนข้อมูลหลังตรวจ dry-run แล้วเท่านั้น:

```bash
npm run migrate:constellations -- --file ./migration/constellations.initial.json --apply
```

รูปแบบ manifest:

```json
{
  "maps": [
    {
      "name": "Game Art",
      "slug": "game-art",
      "scope": "discipline",
      "displayOrder": 2
    },
    {
      "name": "3D Modeling",
      "slug": "game-art-3d-modeling",
      "scope": "topic",
      "parentSlug": "game-art",
      "gatewaySkillId": "<existing-skill-id>"
    }
  ],
  "skillAssignments": [
    {
      "skillId": "<existing-skill-id>",
      "mapSlug": "game-art",
      "mapNodeRole": "topic-gateway",
      "constellationLabel": "3D Modelling",
      "constellationPosition": { "x": 250, "y": 250 }
    }
  ]
}
```

Script เป็น idempotent โดย upsert map ผ่าน `slug` และ update Skill ผ่าน `_id` เดิม การ update จำกัดเฉพาะ `constellationMapId`, `constellationLabel`, `constellationPosition`, `mapNodeRole` และ `nodePreview` จึงไม่แก้:

- Skill `_id`
- `User.unlockedSkills`
- `Skill.prerequisites`
- `Skill.connections`

Initial manifest ถูก apply ใน development database แล้วใน Phase 5 หลัง UI contract ผ่านการตรวจ ดูสถานะและ verification checklist ที่ `docs/constellation-system-rollout.md`
