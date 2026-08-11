# Constellation System: Phase 5-6 Rollout

เอกสารนี้บันทึกสถานะ migration, safety contract และสิ่งที่ต้องตรวจสำหรับ Phase 5

## Applied Dataset

Initial manifest อยู่ที่ `backend/migration/constellations.initial.json` และถูก apply ใน development database แล้ว

| รายการ | จำนวน |
| --- | ---: |
| Discipline Maps | 3 |
| Topic Maps | 11 |
| Maps ทั้งหมด | 14 |
| Assigned Skills | 61 |
| Unassigned Skills ที่ยังใช้ระบบเดิม | 9 |
| Preserved user unlock references | 554 |

Discipline ปัจจุบันคือ Programming, Unity Development และ Game Art โครงสร้างรองรับ Discipline ที่ 4 โดยไม่แก้ schema

## Safety Contract

Migration เป็น idempotent และเขียนเฉพาะข้อมูล presentation/ownership ของ Constellation:

- `constellationMapId`
- `constellationLabel`
- `constellationPosition`
- `mapNodeRole`
- `nodePreview`

Migration ไม่แก้ Skill `_id`, `User.unlockedSkills`, prerequisites, connections, quest content, reward หรือ approval state

`treePosition` เดิมยังเป็นของ Quest Tree ส่วน `constellationPosition` เป็นของ Constellation canvas เท่านั้น

## Verification Commands

ตรวจ manifest และสถานะฐานข้อมูลแบบ read-only:

```bash
cd backend
npm run migrate:constellations -- --file ./migration/constellations.initial.json
```

ผลที่คาดหวัง:

```text
Discipline maps: 3
Topic maps: 11
Assigned skills: 61
Unassigned skills: 9
Preserved user unlock references: 554
Validated 14 maps and 61 skill assignments.
```

ตรวจ backend และ frontend:

```bash
cd backend && npm test
cd frontend && npm run build
cd frontend && npm run test:visual
```

Visual suite ต้องยืนยัน Overview, gateway preview, same-canvas Topic transition, mobile bottom preview, Admin ownership workspace และ connection geometry แบบเส้นตรงเท่านั้น

## Phase 5 Review Gate

การตรวจรอบนี้เน้นข้อมูล ไม่ใช่การปรับ art direction:

1. จำนวน Discipline/Topic ตรงกับ initial manifest
2. Skill เดิมยังใช้ `_id` เดิมและ unlock history ไม่หาย
3. Skill ที่ยังไม่ migrate จำนวน 9 รายการยังแสดงผ่าน fallback เดิมได้
4. การรัน dry-run ซ้ำไม่เขียนข้อมูลและไม่เกิด duplicate maps
5. การเพิ่ม Discipline ที่ 4 ไม่ต้องเปลี่ยน schema หรือ Player component

## Phase 6 Visual Editor

Phase 6 เพิ่ม Visual Layout Editor ใน Super Admin โดยไม่เปลี่ยน progression contract:

- ลาก Topic Gateway, Lesson, Boss และ Capstone บน viewport ของ map
- preview connections เป็นเส้นตรงแบบเดียวกับหน้า Player
- เก็บการแก้เป็น draft จนกด `Save Layout`
- บันทึก nodes ที่เปลี่ยนทั้งหมดผ่าน `PATCH /api/constellation-maps/:id/layout` หนึ่ง request
- validate ownership, duplicate ID, batch limit และ viewport bounds ที่ backend
- reset draft หรือยกเลิกการเปลี่ยน map เมื่อมีข้อมูลยังไม่ save ได้

### Phase 6 Review Gate

รอบนี้ให้ตรวจหน้า Super Admin > Quest Tree > Constellation Maps:

1. ลาก node แล้วเส้นตรงตาม node โดยไม่มี Bezier curve
2. ตัวเลข `unsaved` เพิ่มเฉพาะ node ที่ตำแหน่งเปลี่ยน
3. `Reset` คืนตำแหน่งล่าสุดจาก server และ `Save Layout` ทำให้สถานะกลับเป็น saved
4. เลือก node บน canvas แล้ว Node Assignment form ด้านล่างเปิด node เดียวกัน
5. Topic/Lesson/Boss/Capstone แยกสีชัด แต่ canvas ยังเป็น UI สว่าง เรียบ และอ่านง่าย
6. การแก้ layout ไม่เปลี่ยน Quest Tree เดิม, unlock history, cost, content หรือ approval
