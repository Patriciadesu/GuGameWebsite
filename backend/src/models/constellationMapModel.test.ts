import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import ConstellationMap from './ConstellationMap';
import Skill from './Skill';

test('discipline maps validate without parent linkage', async () => {
  const map = new ConstellationMap({
    name: 'Game Art',
    slug: 'game-art',
    scope: 'discipline'
  });

  await map.validate();
  assert.equal(map.visualTheme.key, 'default');
  assert.equal(map.visualTheme.frameStyle, 'luminous-minimal');
  assert.equal(map.visualTheme.backgroundColor, '#f7f9fc');
  assert.equal(map.visualTheme.surfaceColor, '#ffffff');
  assert.equal(map.viewport.width, 1600);
});

test('topic maps require both a parent map and gateway skill', async () => {
  const map = new ConstellationMap({
    name: '3D Modeling',
    slug: 'game-art-3d-modeling',
    scope: 'topic'
  });

  await assert.rejects(
    () => map.validate(),
    /Topic maps require both a parent map and gateway skill/
  );
});

test('topic maps own the link back to their parent and gateway skill', async () => {
  const parentMapId = new mongoose.Types.ObjectId();
  const gatewaySkillId = new mongoose.Types.ObjectId();
  const map = new ConstellationMap({
    name: '3D Modeling',
    slug: 'game-art-3d-modeling',
    scope: 'topic',
    parentMapId,
    gatewaySkillId
  });

  await map.validate();
  assert.equal(map.parentMapId?.toString(), parentMapId.toString());
  assert.equal(map.gatewaySkillId?.toString(), gatewaySkillId.toString());
});

test('topic gateway skills expose preview content without owning map linkage', async () => {
  const skill = new Skill({
    title: '3D Modeling',
    description: 'Create and shape 3D assets for games.',
    cost: 0,
    treePosition: { x: -992, y: 608 },
    constellationPosition: { x: 800, y: 180 },
    constellationLabel: '3D Modelling',
    mapNodeRole: 'topic-gateway',
    nodePreview: {
      imageUrl: '/uploads/3d-modeling.png',
      summary: 'Create and shape 3D assets for your games.',
      outcomes: ['Build game-ready 3D assets'],
      actionLabel: 'View Path'
    }
  });

  await skill.validate();
  assert.equal(skill.mapNodeRole, 'topic-gateway');
  assert.equal(skill.treePosition?.x, -992);
  assert.equal(skill.constellationPosition?.x, 800);
  assert.equal(skill.constellationLabel, '3D Modelling');
  assert.deepEqual(skill.nodePreview?.outcomes, ['Build game-ready 3D assets']);
});
