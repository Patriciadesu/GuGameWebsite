import assert from 'node:assert/strict';
import test from 'node:test';
import Skill from './Skill';

const structuralStar = {
  cost: 0,
  layer: 0,
  position: 0,
  mapNodeRole: 'lesson',
  nodeColor: 'blue',
  isActive: true
};

test('StarMaster-linked Star validates without locally stored Quest content', async () => {
  const star = new Skill({
    ...structuralStar,
    constellationLabel: 'Remote Quest',
    externalSource: 'star-master',
    externalQuestId: 'remote-quest'
  });
  await star.validate();
  assert.equal(star.title, undefined);
  assert.equal(star.description, undefined);
});

test('non-StarMaster Star still requires local title and description', async () => {
  const star = new Skill(structuralStar);
  await assert.rejects(star.validate(), /title.*required|description.*required/i);
});
