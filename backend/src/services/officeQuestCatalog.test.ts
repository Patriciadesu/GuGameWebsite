import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfficeQuestDescription, getOfficeQuestImageUrl } from './officeQuestCatalog';

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
