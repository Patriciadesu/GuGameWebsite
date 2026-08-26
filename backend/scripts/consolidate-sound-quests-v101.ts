import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';
import {
  createStarMasterQuest,
  listStarMasterQuests,
  StarMasterQuest,
  updateStarMasterQuest
} from '../src/services/starMasterApi';
import { remoteQuestMatchesMutation, starMasterQuestContentHash } from '../src/services/starMasterMigration';
import { buildConsolidatedSoundQuest } from '../src/services/soundQuestConsolidation';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'CONSOLIDATE_SOUND_V101';
const EXPECTED_TOPICS = [
  { name: 'Sound001', stars: 4 },
  { name: '3D Sound', stars: 2 },
  { name: 'Audio Mixer', stars: 3 },
  { name: 'ไหนรองทำอันนี้ให้พี่หน่อย', stars: 2 }
];

const argument = (name: string) => {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
};

const remoteHouseIds = (quest: StarMasterQuest) => (quest.assignedHouses || [])
  .map(house => typeof house === 'string' ? house : house._id)
  .filter(Boolean);

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not configured');
  if (APPLY) {
    if (argument('confirm') !== CONFIRMATION) {
      throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
    }
    const backup = argument('backup');
    if (!backup || !path.isAbsolute(backup) || !fs.existsSync(backup) || fs.statSync(backup).size < 1) {
      throw new Error('Apply requires --backup=/absolute/path/to/a/non-empty MongoDB archive');
    }
  }

  await mongoose.connect(mongoUri);
  try {
    const discipline = await ConstellationMap.findOne({
      name: 'Game Art',
      scope: 'discipline',
      $or: [{ constellationType: 'skill' }, { constellationType: { $exists: false } }]
    }).lean();
    if (!discipline?.externalHouseId) throw new Error('Game Art is missing its HamsterQuest House link');
    const topics = await ConstellationMap.find({
      parentMapId: discipline._id,
      scope: 'topic',
      name: { $in: EXPECTED_TOPICS.map(topic => topic.name) }
    }).lean();
    if (topics.length !== EXPECTED_TOPICS.length) {
      throw new Error(`Expected ${EXPECTED_TOPICS.length} Sound Topics; found ${topics.length}`);
    }

    const remoteQuests = await listStarMasterQuests();
    const remoteById = new Map(remoteQuests.map(quest => [quest._id, quest]));
    const plans: Array<{
      topic: typeof topics[number];
      stars: Array<InstanceType<typeof Skill>>;
      representative: InstanceType<typeof Skill>;
      sourceQuests: StarMasterQuest[];
      payload: ReturnType<typeof buildConsolidatedSoundQuest>;
      remote?: StarMasterQuest;
      action: string;
    }> = [];

    for (const expected of EXPECTED_TOPICS) {
      const topic = topics.find(candidate => candidate.name === expected.name);
      if (!topic?.externalTagId) throw new Error(`${expected.name} is missing its HamsterQuest Tag link`);
      const stars = await Skill.find({ constellationMapId: topic._id })
        .sort({ position: 1, _id: 1 });
      if (stars.length !== expected.stars) {
        throw new Error(`${expected.name} expected ${expected.stars} Stars; found ${stars.length}`);
      }
      const sourceQuestIds = stars.map(star => star.soundConsolidationSourceQuestId || star.externalQuestId);
      if (sourceQuestIds.some(id => !id)) throw new Error(`${expected.name} has a Star without a source Quest ID`);
      const sourceQuests = sourceQuestIds.map(id => remoteById.get(id!));
      if (sourceQuests.some(quest => !quest)) throw new Error(`${expected.name} has a source Quest missing from HamsterQuest`);
      const payload = buildConsolidatedSoundQuest({
        topicName: topic.name,
        houseId: discipline.externalHouseId,
        tagId: topic.externalTagId,
        starQuests: sourceQuests as StarMasterQuest[]
      });
      const representative = stars[0];
      let remote = representative.soundConsolidationSourceQuestId && representative.externalQuestId
        ? remoteById.get(representative.externalQuestId)
        : undefined;
      if (!remote) {
        const candidates = remoteQuests.filter(quest =>
          quest.title.trim() === payload.title &&
          (quest.tags || []).some(tag => tag._id === topic.externalTagId) &&
          remoteHouseIds(quest).includes(discipline.externalHouseId!) &&
          remoteQuestMatchesMutation(quest, payload)
        );
        if (candidates.length > 1) throw new Error(`${topic.name} has multiple matching consolidated Quests`);
        remote = candidates[0];
      }
      const action = !remote ? 'create' : remoteQuestMatchesMutation(remote, payload) ? 'reuse' : 'update';
      plans.push({ topic, stars, representative, sourceQuests: sourceQuests as StarMasterQuest[], payload, remote, action });
    }

    console.log(JSON.stringify({
      version: '1.0.1',
      mode: APPLY ? 'apply' : 'dry-run',
      quests: plans.map(plan => ({
        topic: plan.topic.name,
        stepCount: plan.payload.subQuests.length,
        steps: plan.payload.subQuests.map(step => step.title),
        action: plan.action,
        questId: plan.remote?._id || null,
        representativeStarId: plan.representative._id.toString(),
        archivedStarIds: plan.stars.slice(1).map(star => star._id.toString())
      }))
    }, null, 2));
    if (!APPLY) return;

    for (const plan of plans) {
      let remote = plan.remote;
      if (!remote) remote = await createStarMasterQuest(plan.payload);
      else if (!remoteQuestMatchesMutation(remote, plan.payload)) {
        remote = await updateStarMasterQuest(remote._id, plan.payload);
      }
      if (!remoteQuestMatchesMutation(remote, plan.payload)) {
        throw new Error(`${plan.topic.name} failed remote verification`);
      }
      plan.remote = remote;
    }

    for (const plan of plans) {
      const positions = plan.stars.map(star => star.constellationPosition).filter(Boolean) as Array<{ x: number; y: number }>;
      const centroid = positions.length > 0 ? {
        x: positions.reduce((sum, point) => sum + point.x, 0) / positions.length,
        y: positions.reduce((sum, point) => sum + point.y, 0) / positions.length
      } : undefined;
      const sourceQuestId = plan.representative.soundConsolidationSourceQuestId || plan.representative.externalQuestId;
      await Skill.updateOne({ _id: plan.representative._id }, {
        $set: {
          externalSource: 'star-master',
          externalQuestId: plan.remote!._id,
          soundConsolidationSourceQuestId: sourceQuestId,
          externalQuestContentHash: starMasterQuestContentHash(plan.payload),
          externalQuestSyncedAt: new Date(),
          constellationLabel: plan.topic.name,
          isActive: true,
          connections: [],
          ...(centroid ? { constellationPosition: centroid } : {})
        }
      });
      if (plan.stars.length > 1) {
        await Skill.updateMany(
          { _id: { $in: plan.stars.slice(1).map(star => star._id) } },
          { $set: { isActive: false } }
        );
      }
    }

    const verification = [];
    for (const plan of plans) {
      const active = await Skill.find({ constellationMapId: plan.topic._id, isActive: true }).lean();
      if (active.length !== 1 || active[0].externalQuestId !== plan.remote!._id) {
        throw new Error(`${plan.topic.name} failed local verification`);
      }
      verification.push({ topic: plan.topic.name, questId: plan.remote!._id, steps: plan.payload.subQuests.length });
    }
    console.log(JSON.stringify({ success: true, verification }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
