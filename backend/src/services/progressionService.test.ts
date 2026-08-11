import assert from 'node:assert/strict';
import test from 'node:test';
import { areQuestStepsComplete } from './progressionService';

test('a quest without steps is not complete', () => {
  assert.equal(areQuestStepsComplete([], new Set()), false);
});

test('every quest step must be complete', () => {
  const steps = [{ externalId: 'intro' }, {}, { externalId: 'finish' }];
  assert.equal(areQuestStepsComplete(steps, new Set(['intro', 'step-1'])), false);
  assert.equal(areQuestStepsComplete(steps, new Set(['intro', 'step-1', 'finish'])), true);
});
