import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStarMasterQuestMutation,
  mergeStarMasterQuestMutation,
  remoteQuestMatchesMutation,
  starMasterQuestContentHash
} from './starMasterMigration';

test('migration preserves quest text, image, steps, House, and Topic tag', () => {
  const result = buildStarMasterQuestMutation({
    _id: 'local-star',
    title: 'Basic Particle System',
    description: 'Create a particle effect.',
    nodePreview: { imageUrl: 'https://cdn.example.test/particle.png' },
    contentYouTube: ['https://youtu.be/top-level'],
    subQuests: [{
      externalId: 'old-step',
      title: 'Build the emitter',
      descriptionParts: [
        { type: 'Text', content: 'Configure emission.' },
        { type: 'YouTube', content: 'https://youtu.be/example' }
      ],
      hintParts: [{ type: 'Text', content: 'Start with a low emission rate.' }],
      type: 'ImageNote'
    }]
  }, 'house-id', 'tag-id');

  assert.equal(result.payload.title, 'Basic Particle System');
  assert.deepEqual(result.payload.assignedHouses, ['house-id']);
  assert.deepEqual(result.payload.tags, ['tag-id']);
  assert.deepEqual(result.payload.description, [
    { type: 'Text', content: 'Create a particle effect.' },
    { type: 'Image', content: 'https://cdn.example.test/particle.png' },
    { type: 'YouTube', content: 'https://youtu.be/top-level' }
  ]);
  assert.equal(result.payload.subQuests[0]?.subQuestType, 'ImageNote');
  assert.equal(result.payload.subQuests[0]?.description?.[1]?.type, 'YouTube');
  assert.equal(result.payload.subQuests[0]?.hint?.[0]?.content, 'Start with a low emission rate.');
  assert.deepEqual(result.warnings, []);
});

test('migration makes incomplete Choice steps usable without inventing choices', () => {
  const result = buildStarMasterQuestMutation({
    _id: 'local-star',
    title: 'Choice legacy',
    subQuests: [{ title: 'Legacy choice', type: 'Choice' }]
  }, 'house-id', 'tag-id');

  assert.equal(result.payload.subQuests[0]?.subQuestType, 'ImageNote');
  assert.equal(result.warnings.length, 1);
});

test('content hash ignores remote IDs and detects meaningful changes', () => {
  const { payload } = buildStarMasterQuestMutation({
    _id: 'local-star',
    title: 'Quest',
    subQuests: [{ title: 'Step', description: 'Do it', type: 'ImageNote' }]
  }, 'aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb');
  const remote = {
    _id: 'cccccccccccccccccccccccc',
    ...payload,
    tags: [{ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Topic' }],
    subQuests: payload.subQuests.map(step => ({ ...step, _id: 'dddddddddddddddddddddddd' }))
  };

  assert.equal(remoteQuestMatchesMutation(remote, payload), true);
  assert.notEqual(starMasterQuestContentHash({ ...payload, title: 'Changed' }), starMasterQuestContentHash(payload));
});

test('remote edit merge preserves untouched image, links, and steps', () => {
  const remote = {
    _id: 'remote-quest',
    title: 'Original',
    type: 'MainQuest',
    description: [
      { type: 'Text', content: 'Original description' },
      { type: 'Image', content: 'https://cdn.example.test/cover.png' },
      { type: 'YouTube', content: 'https://youtu.be/original' }
    ],
    subQuests: [{
      _id: 'remote-step',
      title: 'Keep this step',
      description: [{ type: 'Image', content: 'https://cdn.example.test/step.png' }],
      hint: [{ type: 'Text', content: 'Keep this hint' }],
      subQuestType: 'ImageNote' as const
    }],
    tags: [{ _id: 'old-tag', name: 'Old topic' }],
    assignedHouses: ['old-house']
  };
  const merged = mergeStarMasterQuestMutation(remote, { title: 'Renamed' }, 'new-house', 'new-tag');

  assert.equal(merged.title, 'Renamed');
  assert.deepEqual(merged.description, remote.description);
  assert.equal(merged.subQuests[0]?.title, 'Keep this step');
  assert.equal(merged.subQuests[0]?.hint?.[0]?.content, 'Keep this hint');
  assert.deepEqual(merged.tags, ['new-tag']);
  assert.deepEqual(merged.assignedHouses, ['new-house']);
});

test('remote edit merge replaces only explicitly edited content types', () => {
  const remote = {
    _id: 'remote-quest',
    title: 'Quest',
    type: 'MainQuest',
    description: [
      { type: 'Text', content: 'Old text' },
      { type: 'Image', content: 'https://cdn.example.test/old.png' },
      { type: 'GoogleDrive', content: 'https://drive.google.com/keep' }
    ],
    subQuests: []
  };
  const merged = mergeStarMasterQuestMutation(remote, {
    description: 'New text',
    nodePreview: { imageUrl: 'https://cdn.example.test/new.png' }
  }, 'house', 'tag');

  assert.deepEqual(merged.description, [
    { type: 'Text', content: 'New text' },
    { type: 'GoogleDrive', content: 'https://drive.google.com/keep' },
    { type: 'Image', content: 'https://cdn.example.test/new.png' }
  ]);
});
