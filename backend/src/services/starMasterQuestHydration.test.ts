import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateSkillsFromStarMaster, projectStarMasterQuestOntoSkill } from './starMasterQuestHydration';

const skill = {
  _id: 'local-star',
  title: 'Stale title',
  description: 'Stale description',
  externalSource: 'star-master',
  externalQuestId: 'remote-quest',
  subQuests: [{ externalId: 'old-step', title: 'Old step', description: '' }]
};

const quest = {
  _id: 'remote-quest',
  title: 'Remote title',
  description: [
    { type: 'Text', content: 'Remote description' },
    { type: 'Image', content: 'https://cdn.example.test/cover.png' }
  ],
  subQuests: [{
    _id: 'remote-step',
    title: 'Remote step',
    description: [{ type: 'Text', content: 'Remote requirement' }],
    hint: [
      { type: 'Text', content: 'Try the timeline first.' },
      { type: 'Image', content: 'https://cdn.example.test/hint.png' }
    ],
    subQuestType: 'ImageNote'
  }]
};

test('remote Quest data is projected without changing structural Star fields', () => {
  const projected = projectStarMasterQuestOntoSkill(skill, quest);
  assert.equal(projected._id, 'local-star');
  assert.equal(projected.title, 'Remote title');
  assert.equal(projected.description, 'Remote description');
  assert.equal(projected.nodePreview.imageUrl, 'https://cdn.example.test/cover.png');
  assert.deepEqual(projected.contentYouTube, []);
  assert.equal(projected.subQuests[0].externalId, 'remote-step');
  assert.equal(projected.subQuests[0].hasHint, true);
  assert.deepEqual(projected.subQuests[0].hintParts, quest.subQuests[0].hint);
  assert.equal(projected.questDataStatus, 'remote');
});

test('hydration restores top-level video and Drive content from HamsterQuest', () => {
  const projected = projectStarMasterQuestOntoSkill(skill, {
    ...quest,
    description: [
      ...(quest.description || []),
      { type: 'YouTube', content: 'https://youtu.be/remote' },
      { type: 'GoogleDrive', content: 'https://drive.google.com/remote' }
    ]
  });
  assert.deepEqual(projected.contentYouTube, ['https://youtu.be/remote']);
  assert.deepEqual(projected.contentGoogleDrive, ['https://drive.google.com/remote']);
});

test('hydration fails open without losing local Quest data during rollout', async () => {
  const [result] = await hydrateSkillsFromStarMaster([skill], {
    loader: async () => { throw new Error('network unavailable'); }
  });
  assert.equal(result.title, 'Stale title');
  assert.equal(result.subQuests[0].externalId, 'old-step');
  assert.equal(result.questDataStatus, 'local-fallback');
});

test('hydration marks a missing remote Quest and keeps rollback data', async () => {
  const [result] = await hydrateSkillsFromStarMaster([skill], {
    loader: async () => new Map()
  });
  assert.equal(result.title, 'Stale title');
  assert.equal(result.questDataStatus, 'missing');
});
