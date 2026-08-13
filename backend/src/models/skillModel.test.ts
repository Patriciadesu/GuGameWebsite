import assert from 'node:assert/strict';
import test from 'node:test';
import Skill from './Skill';

test('newly persisted quest steps receive immutable external IDs', async () => {
  const skill = new Skill({
    title: 'Quest',
    description: 'A quest with manual steps',
    cost: 0,
    subQuests: [
      { title: 'First', description: '' },
      { externalId: 'source-step', title: 'Second', description: '' }
    ]
  });

  await skill.validate();

  assert.match(skill.subQuests?.[0].externalId || '', /^step-[0-9a-f-]{36}$/);
  assert.equal(skill.subQuests?.[1].externalId, 'source-step');
  const externalIdPath = Skill.schema.path('subQuests.externalId');
  assert.equal(externalIdPath.options.immutable, true);
});

test('duplicate quest step external IDs fail validation', async () => {
  const skill = new Skill({
    title: 'Quest',
    description: 'Duplicate steps',
    cost: 0,
    subQuests: [
      { externalId: 'duplicate', title: 'First', description: '' },
      { externalId: 'duplicate', title: 'Second', description: '' }
    ]
  });

  await assert.rejects(() => skill.validate(), /must be unique/);
});
