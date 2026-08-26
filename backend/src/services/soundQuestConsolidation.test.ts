import assert from 'node:assert/strict';
import test from 'node:test';
import { StarMasterQuest } from './starMasterApi';
import { buildConsolidatedSoundQuest } from './soundQuestConsolidation';

const quest = (id: string, title: string, stepCount = 1): StarMasterQuest => ({
  _id: id,
  title,
  type: 'MainQuest',
  description: [{ type: 'Image', content: `https://example.com/${id}.png` }],
  subQuests: Array.from({ length: stepCount }, (_, index) => ({
    _id: `${id}-${index}`,
    title: `${title} section ${index + 1}`,
    description: [{ type: 'Text', content: `${title} content ${index + 1}` }],
    hint: index === 0 ? [{ type: 'Text', content: `${title} hint` }] : [],
    subQuestType: 'ImageNote'
  }))
});

test('consolidated Sound Quest creates exactly one Step for each source Star', () => {
  const result = buildConsolidatedSoundQuest({
    topicName: 'Sound001',
    houseId: 'house',
    tagId: 'tag',
    starQuests: [quest('one', 'First', 2), quest('two', 'Second')]
  });
  assert.equal(result.title, 'Sound001');
  assert.equal(result.subQuests.length, 2);
  assert.deepEqual(result.subQuests.map(step => step.title), ['First', 'Second']);
  const firstStep = result.subQuests.at(0);
  assert.ok(firstStep);
  assert.match((firstStep.description || []).map(part => part.content).join('\n'), /First content 2/);
  assert.equal(firstStep.hint?.[0]?.content, 'First hint');
  assert.deepEqual(result.tags, ['tag']);
  assert.deepEqual(result.assignedHouses, ['house']);
});

test('consolidated Sound Quest refuses an empty Topic', () => {
  assert.throws(() => buildConsolidatedSoundQuest({
    topicName: 'Empty',
    houseId: 'house',
    tagId: 'tag',
    starQuests: []
  }), /no Star quests/);
});
