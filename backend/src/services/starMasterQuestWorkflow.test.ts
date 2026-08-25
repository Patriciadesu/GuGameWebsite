import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSubmissionHouse } from './starMasterQuestWorkflow';

test('submission House prefers the current active HamsterQuest House', () => {
  const selected = selectSubmissionHouse(
    { id: 'user', discordId: 'discord', currentHouseId: 'house-current' },
    [
      { house: { _id: 'house-old', name: 'Old' }, lastActivatedAt: '2026-08-24T12:00:00Z' },
      { house: { _id: 'house-current', name: 'Current' }, lastActivatedAt: '2026-08-20T12:00:00Z' }
    ]
  );
  assert.equal(selected?.house._id, 'house-current');
});

test('submission House falls back to the most recently active enabled membership', () => {
  const selected = selectSubmissionHouse(
    { id: 'user', discordId: 'discord', currentHouseId: 'disabled' },
    [
      { house: { _id: 'disabled', name: 'Disabled' }, disabledAt: '2026-08-23T12:00:00Z' },
      { house: { _id: 'older', name: 'Older' }, lastActivatedAt: '2026-08-20T12:00:00Z' },
      { house: { _id: 'newer', name: 'Newer' }, lastActivatedAt: '2026-08-24T12:00:00Z' }
    ]
  );
  assert.equal(selected?.house._id, 'newer');
});
