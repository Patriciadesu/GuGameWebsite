import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertConstellationHierarchyIntegrity,
  assertRoleAllowedForScope,
  ConstellationOperationError,
  normalizeConstellationLayout
} from './constellationService';

test('hierarchy accepts a topic under a same-type discipline', () => {
  assert.doesNotThrow(() => assertConstellationHierarchyIntegrity(
    { scope: 'discipline', constellationType: 'main' },
    { scope: 'topic', constellationType: 'main' }
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
