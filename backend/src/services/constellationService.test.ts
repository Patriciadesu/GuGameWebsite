import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertConstellationHierarchyIntegrity,
  assertRoleAllowedForScope,
  ConstellationOperationError,
  mainQuestReadinessIssues,
  normalizeConstellationLayout
} from './constellationService';

test('main quest hierarchy rejects legacy topic maps', () => {
  assert.throws(() => assertConstellationHierarchyIntegrity(
    { scope: 'discipline', constellationType: 'main' },
    { scope: 'topic', constellationType: 'main' }
  ), /Main Quest paths do not use topic maps/);
});

test('hierarchy accepts a skill topic under a skill discipline', () => {
  assert.doesNotThrow(() => assertConstellationHierarchyIntegrity(
    { scope: 'discipline', constellationType: 'skill' },
    { scope: 'topic', constellationType: 'skill' }
  ));
});

test('hierarchy rejects cross-type parent and child maps', () => {
  assert.throws(
    () => assertConstellationHierarchyIntegrity(
      { scope: 'discipline', constellationType: 'main' },
      { scope: 'topic', constellationType: 'skill' }
    ),
    (error: unknown) => error instanceof ConstellationOperationError && error.statusCode === 409
  );
});

test('hierarchy rejects invalid parent and child scopes', () => {
  assert.throws(() => assertConstellationHierarchyIntegrity(
    { scope: 'topic', constellationType: 'skill' },
    { scope: 'topic', constellationType: 'skill' }
  ), /discipline map/);
  assert.throws(() => assertConstellationHierarchyIntegrity(
    { scope: 'discipline', constellationType: 'skill' },
    { scope: 'discipline', constellationType: 'skill' }
  ), /Only topic maps/);
});

test('discipline maps accept topic gateways', () => {
  assert.doesNotThrow(() => assertRoleAllowedForScope('discipline', 'topic-gateway'));
});

test('discipline maps reject lesson nodes', () => {
  assert.throws(
    () => assertRoleAllowedForScope('discipline', 'lesson'),
    (error: unknown) => error instanceof ConstellationOperationError && error.statusCode === 400
  );
});

test('main quest paths accept direct quest roles and reject topic gateways', () => {
  assert.doesNotThrow(() => assertRoleAllowedForScope('discipline', 'lesson', 'main'));
  assert.doesNotThrow(() => assertRoleAllowedForScope('discipline', 'boss', 'main'));
  assert.doesNotThrow(() => assertRoleAllowedForScope('discipline', 'capstone', 'main'));
  assert.throws(
    () => assertRoleAllowedForScope('discipline', 'topic-gateway', 'main'),
    /Main quest maps cannot contain topic-gateway nodes/
  );
});

test('main quest readiness requires a published quest with a named requirement', () => {
  assert.deepEqual(mainQuestReadinessIssues([]), ['Publish at least one Main Quest before publishing this path']);
  assert.match(mainQuestReadinessIssues([{
    title: 'First Trial',
    mainQuestLevel: 1,
    isActive: true,
    subQuests: []
  }])[0], /at least one Requirement/);
  assert.deepEqual(mainQuestReadinessIssues([{
    title: 'First Trial',
    mainQuestLevel: 1,
    isActive: true,
    subQuests: [{ title: 'Send your work' }]
  }]), []);
});

test('main quest readiness ignores incomplete drafts and detects duplicate published Levels', () => {
  assert.deepEqual(mainQuestReadinessIssues([
    { title: 'Draft', mainQuestLevel: 2, isActive: false, subQuests: [] },
    { title: 'Level one A', mainQuestLevel: 1, isActive: true, subQuests: [{ title: 'A' }] },
    { title: 'Level one B', mainQuestLevel: 1, isActive: true, subQuests: [{ title: 'B' }] }
  ]), ['Level 1 is assigned to more than one published Main Quest']);
});

test('topic maps accept lesson, boss, and capstone nodes', () => {
  assert.doesNotThrow(() => assertRoleAllowedForScope('topic', 'lesson'));
  assert.doesNotThrow(() => assertRoleAllowedForScope('topic', 'boss'));
  assert.doesNotThrow(() => assertRoleAllowedForScope('topic', 'capstone'));
});

test('topic maps reject topic gateways', () => {
  assert.throws(
    () => assertRoleAllowedForScope('topic', 'topic-gateway'),
    /Topic maps cannot contain topic-gateway nodes/
  );
});

test('layout normalization accepts unique nodes inside the viewport', () => {
  const nodes = normalizeConstellationLayout([
    { skillId: '64b000000000000000000001', x: 120, y: 240 },
    { skillId: '64b000000000000000000002', x: 880, y: 640 }
  ], { width: 1600, height: 900 });

  assert.deepEqual(nodes, [
    { skillId: '64b000000000000000000001', x: 120, y: 240 },
    { skillId: '64b000000000000000000002', x: 880, y: 640 }
  ]);
});

test('layout normalization rejects duplicate nodes', () => {
  assert.throws(() => normalizeConstellationLayout([
    { skillId: '64b000000000000000000001', x: 120, y: 240 },
    { skillId: '64b000000000000000000001', x: 220, y: 340 }
  ], { width: 1600, height: 900 }), /duplicate skill/);
});

test('layout normalization rejects positions outside the map viewport', () => {
  assert.throws(() => normalizeConstellationLayout([
    { skillId: '64b000000000000000000001', x: 1601, y: 240 }
  ], { width: 1600, height: 900 }), /outside the map viewport/);
});
