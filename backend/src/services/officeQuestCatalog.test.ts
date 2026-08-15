import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfficeQuestDescription, getOfficeQuestDetailHash, getOfficeQuestImageUrl } from './officeQuestCatalog';

test('StarMaster presentation keeps text separate from quest images', () => {
  const quest = {
    _id: 'quest-1',
    title: 'Soundscape',
    description: [
      { type: 'Text', content: 'Build an atmospheric soundscape.' },
      { type: 'Image', content: 'https://cdn.example.com/cover.webp' }
    ],
    subQuests: []
  };

  assert.equal(getOfficeQuestDescription(quest.description), 'Build an atmospheric soundscape.');
  assert.equal(getOfficeQuestImageUrl(quest), 'https://cdn.example.com/cover.webp');
});

test('StarMaster presentation falls back to the first subquest image', () => {
  const quest = {
    _id: 'quest-2',
    title: 'Model a prop',
    description: [],
    subQuests: [{
      _id: 'step-1',
      title: 'Reference',
      description: [{ type: 'Image', content: 'https://cdn.example.com/reference.webp' }]
    }]
  };

  assert.equal(getOfficeQuestImageUrl(quest), 'https://cdn.example.com/reference.webp');
});

test('StarMaster cache hash changes when the quest cover changes', () => {
  const baseQuest = {
    _id: 'quest-cover',
    title: 'Quest cover',
    description: [{ type: 'Text', content: 'Same description.' }],
    subQuests: []
  };
  const first = { ...baseQuest, description: [...baseQuest.description, { type: 'Image', content: 'https://cdn.example.com/first.webp' }] };
  const second = { ...baseQuest, description: [...baseQuest.description, { type: 'Image', content: 'https://cdn.example.com/second.webp' }] };

  assert.notEqual(getOfficeQuestDetailHash(first), getOfficeQuestDetailHash(second));
});
