import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeQuestStepExternalIds } from './questStepNormalization';

test('assigns unique stable-looking IDs to new quest steps', () => {
  const normalized = normalizeQuestStepExternalIds([
    { title: 'First' },
    { title: 'Second', externalId: ' upstream-step ' }
  ]);

  assert.match(normalized[0].externalId, /^step-[0-9a-f-]{36}$/);
  assert.equal(normalized[1].externalId, 'upstream-step');
  assert.notEqual(normalized[0].externalId, normalized[1].externalId);
});

test('preserves persisted IDs when an update omits or replaces them', () => {
  const persisted = [{ externalId: 'step-a' }, { externalId: 'step-b' }];
  const normalized = normalizeQuestStepExternalIds([
    { title: 'Renamed' },
    { title: 'Changed ID', externalId: 'replacement' },
    { title: 'New', externalId: 'new-step' }
  ], persisted);

  assert.deepEqual(normalized.map(step => step.externalId), ['step-a', 'step-b', 'new-step']);
});

test('preserves persisted IDs when existing steps are reordered', () => {
  const persisted = [{ externalId: 'step-a' }, { externalId: 'step-b' }];
  const normalized = normalizeQuestStepExternalIds([
    { title: 'B', externalId: 'step-b' },
    { title: 'A', externalId: 'step-a' }
  ], persisted);

  assert.deepEqual(normalized.map(step => step.externalId), ['step-b', 'step-a']);
});

test('rejects duplicate external IDs', () => {
  assert.throws(
    () => normalizeQuestStepExternalIds([{ externalId: 'same' }, { externalId: ' same ' }]),
    /must be unique/
  );
});
