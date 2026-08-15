import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';
import User from '../src/models/User';
import {
  createStarMasterHouse,
  createStarMasterQuest,
  listStarMasterHouses,
  listStarMasterQuests,
  updateStarMasterQuest,
  StarMasterHouse,
  StarMasterQuest
} from '../src/services/starMasterApi';
import {
  buildStarMasterQuestMutation,
  remoteQuestMatchesMutation,
  starMasterQuestContentHash
} from '../src/services/starMasterMigration';

dotenv.config({ path: path.join(__dirname, '../.env') });

type Phase = 'plan' | 'houses' | 'tags' | 'quests' | 'verify' | 'cleanup';

const argValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
};

const phase = (argValue('phase') || 'plan') as Phase;
const apply = process.argv.includes('--apply');
const limit = Math.max(0, Number(argValue('limit')) || 0);
const onlyStarId = argValue('star-id');
const EXPECTED_DISCIPLINES = ['Game Art', 'System', 'Map & Scene'];
const TOPIC_COLORS: Record<string, string> = {
  'Game Art': '#f59e0b',
  System: '#3b82f6',
  'Map & Scene': '#14b8a6'
};

const normalizedName = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = (value: unknown) => String(value || '');

const hasRemoteTag = (quest: StarMasterQuest, tagId: string) =>
  (quest.tags || []).some(tag => tag._id === tagId);

const hasRemoteHouse = (quest: StarMasterQuest, houseId: string) =>
  (quest.assignedHouses || []).some(house =>
    (typeof house === 'string' ? house : house._id) === houseId
  );

const assertExactDisciplines = (roots: Array<{ name: string }>) => {
  const actual = roots.map(root => root.name).sort();
  const expected = [...EXPECTED_DISCIPLINES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected exactly ${expected.join(', ')} disciplines; found ${actual.join(', ')}`);
  }
};

const loadCatalog = async () => {
  const maps = await ConstellationMap.find({
    isActive: { $ne: false },
    $or: [{ constellationType: 'skill' }, { constellationType: { $exists: false } }]
  }).sort({ displayOrder: 1, _id: 1 }).lean();
  const roots = maps.filter(map => map.scope === 'discipline');
  const topics = maps.filter(map => map.scope === 'topic');
  assertExactDisciplines(roots);
  const stars = await Skill.find({
    isActive: { $ne: false },
    constellationMapId: { $in: topics.map(topic => topic._id) },
    ...(onlyStarId ? { _id: onlyStarId } : {})
  }).sort({ constellationMapId: 1, position: 1, _id: 1 }).lean();
  return { roots, topics, stars };
};

const planMigration = async () => {
  const { roots, topics, stars } = await loadCatalog();
  const parentById = new Map(roots.map(root => [root._id.toString(), root]));
  const counts = roots.map(root => {
    const rootTopics = topics.filter(topic => topic.parentMapId?.toString() === root._id.toString());
    const topicIds = new Set(rootTopics.map(topic => topic._id.toString()));
    return {
      discipline: root.name,
      houseLinked: Boolean(root.externalHouseId),
      topics: rootTopics.length,
      tagsLinked: rootTopics.filter(topic => topic.externalTagId).length,
      stars: stars.filter(star => topicIds.has(star.constellationMapId?.toString() || '')).length
    };
  });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', phase, counts }, null, 2));
  if (topics.some(topic => !parentById.has(topic.parentMapId?.toString() || ''))) {
    throw new Error('At least one Topic is missing its Discipline parent');
  }
};

const migrateHouses = async () => {
  const { roots } = await loadCatalog();
  const remoteHouses = await listStarMasterHouses();
  const owner = process.env.STAR_MASTER_HOUSE_OWNER_ID || '';
  const results: Array<{ name: string; action: string; id?: string }> = [];

  for (const root of roots) {
    const matches = remoteHouses.filter(house => normalizedName(house.name) === normalizedName(root.name));
    if (matches.length > 1) throw new Error(`Multiple HamsterQuest Houses have the name ${root.name}`);
    let house: StarMasterHouse | undefined = matches[0];
    let action = 'existing';
    if (!house) {
      if (!apply) {
        results.push({ name: root.name, action: 'would-create' });
        continue;
      }
      if (!mongoose.Types.ObjectId.isValid(owner)) {
        throw new Error('STAR_MASTER_HOUSE_OWNER_ID must be configured before creating Houses');
      }
      house = await createStarMasterHouse({
        name: root.name,
        description: `GuGame discipline house: ${root.name}`,
        owner,
        showInPowerAnalysis: true
      });
      action = 'created';
    }
    if (normalizedName(house.name) !== normalizedName(root.name)) {
      throw new Error(`House verification failed for ${root.name}`);
    }
    if (apply) {
      await ConstellationMap.updateOne({ _id: root._id }, { $set: { externalHouseId: house._id } });
    }
    results.push({ name: root.name, action, id: house._id });
  }
  console.log(JSON.stringify({ phase: 'houses', mode: apply ? 'apply' : 'dry-run', results }, null, 2));
};

const migrateTags = async () => {
  const { roots, topics } = await loadCatalog();
  const externalMongoUri = process.env.HAMSTERQUEST_MONGODB_URI || '';
  if (!externalMongoUri) throw new Error(
    'HAMSTERQUEST_MONGODB_URI is required because the documented integration API has no Tag endpoints'
  );
  const external = await mongoose.createConnection(externalMongoUri).asPromise();
  try {
    const tags = external.collection('tags');
    const parentById = new Map(roots.map(root => [root._id.toString(), root]));
    const results: Array<{ topic: string; action: string; id?: string }> = [];
    for (const topic of topics) {
      const parent = parentById.get(topic.parentMapId?.toString() || '');
      if (!parent) throw new Error(`Topic ${topic.name} has no Discipline parent`);
      const name = normalizedName(topic.name);
      const matches = await tags.find({ name }).project({ _id: 1, name: 1 }).toArray();
      if (matches.length > 1) throw new Error(`Multiple HamsterQuest Tags have the name ${name}`);
      let tag = matches[0];
      let action = 'existing';
      if (!tag) {
        if (!apply) {
          results.push({ topic: name, action: 'would-create' });
          continue;
        }
        const now = new Date();
        const inserted = await tags.insertOne({
          name,
          color: TOPIC_COLORS[parent.name] || '#6b7280',
          description: `GuGame topic in ${parent.name}`,
          createdAt: now,
          updatedAt: now
        });
        tag = { _id: inserted.insertedId, name };
        action = 'created';
      }
      if (apply) {
        await ConstellationMap.updateOne({ _id: topic._id }, { $set: { externalTagId: tag._id.toString() } });
      }
      results.push({ topic: name, action, id: tag._id.toString() });
    }
    console.log(JSON.stringify({ phase: 'tags', mode: apply ? 'apply' : 'dry-run', results }, null, 2));
  } finally {
    await external.close();
  }
};

const migrateQuests = async () => {
  const { roots, topics, stars } = await loadCatalog();
  const parentById = new Map(roots.map(root => [root._id.toString(), root]));
  const topicById = new Map(topics.map(topic => [topic._id.toString(), topic]));
  const remoteQuests = await listStarMasterQuests();
  const remoteById = new Map(remoteQuests.map(quest => [quest._id, quest]));
  const selectedStars = limit > 0 ? stars.slice(0, limit) : stars;
  const results: Array<{ starId: string; title: string; action: string; questId?: string; warnings?: string[] }> = [];

  for (const star of selectedStars) {
    if (!star.title) {
      throw new Error(`Star ${star._id} has already removed local Quest content; Quests must now be edited in HamsterQuest`);
    }
    const topic = topicById.get(star.constellationMapId?.toString() || '');
    const parent = topic ? parentById.get(topic.parentMapId?.toString() || '') : undefined;
    if (!topic || !parent) throw new Error(`Star ${star.title} is missing its Topic or Discipline`);
    if (!parent.externalHouseId || !topic.externalTagId) {
      throw new Error(`Run Houses and Tags phases before migrating ${star.title}`);
    }
    const { payload, warnings } = buildStarMasterQuestMutation(star, parent.externalHouseId, topic.externalTagId);
    let remote = star.externalQuestId ? remoteById.get(star.externalQuestId) : undefined;
    let action = 'verified-current-link';
    if (remote && !remoteQuestMatchesMutation(remote, payload)) {
      if (apply) {
        remote = await updateStarMasterQuest(remote._id, payload);
        if (!remoteQuestMatchesMutation(remote, payload)) {
          throw new Error(`Updated Quest verification failed for ${star.title}`);
        }
        remoteById.set(remote._id, remote);
        action = 'updated-current-link';
      } else {
        action = 'would-update-current-link';
      }
    }
    if (!remote) {
      const candidates = remoteQuests.filter(quest =>
        quest.title.trim() === payload.title &&
        hasRemoteTag(quest, topic.externalTagId!) &&
        hasRemoteHouse(quest, parent.externalHouseId!) &&
        remoteQuestMatchesMutation(quest, payload)
      );
      if (candidates.length > 1) throw new Error(`Multiple matching remote Quests found for ${star.title}`);
      remote = candidates[0];
      action = remote ? 'adopted-existing' : 'would-create';
    }
    if (!remote && apply) {
      remote = await createStarMasterQuest(payload);
      if (!remoteQuestMatchesMutation(remote, payload)) {
        throw new Error(`Created Quest verification failed for ${star.title}`);
      }
      remoteQuests.push(remote);
      remoteById.set(remote._id, remote);
      action = 'created';
    }
    if (remote && apply) {
      const previousId = star.externalQuestId && star.externalQuestId !== remote._id
        ? star.externalQuestId
        : star.legacyExternalQuestId;
      await Skill.updateOne({ _id: star._id }, {
        $set: {
          externalSource: 'star-master',
          externalQuestId: remote._id,
          externalQuestContentHash: starMasterQuestContentHash(payload),
          externalQuestSyncedAt: new Date(),
          ...(previousId ? { legacyExternalQuestId: previousId } : {})
        }
      });
    }
    results.push({
      starId: star._id.toString(),
      title: star.title,
      action,
      questId: remote?._id,
      ...(warnings.length > 0 ? { warnings } : {})
    });
  }
  console.log(JSON.stringify({ phase: 'quests', mode: apply ? 'apply' : 'dry-run', results }, null, 2));
};

const verifyMigration = async () => {
  const { roots, topics, stars } = await loadCatalog();
  const remoteHouses = await listStarMasterHouses();
  const remoteQuests = await listStarMasterQuests();
  const remoteById = new Map(remoteQuests.map(quest => [quest._id, quest]));
  const rootById = new Map(roots.map(root => [root._id.toString(), root]));
  const topicById = new Map(topics.map(topic => [topic._id.toString(), topic]));
  const issues: string[] = [];

  for (const root of roots) {
    const matches = remoteHouses.filter(house => house._id === root.externalHouseId && house.name === root.name);
    if (matches.length !== 1) issues.push(`House link invalid: ${root.name}`);
  }
  for (const topic of topics) {
    if (!mongoose.Types.ObjectId.isValid(topic.externalTagId || '')) issues.push(`Tag link missing: ${topic.name}`);
  }
  for (const star of stars) {
    const starLabel = star.title || star.constellationLabel || star._id.toString();
    const topic = topicById.get(star.constellationMapId?.toString() || '');
    const root = topic ? rootById.get(topic.parentMapId?.toString() || '') : undefined;
    const quest = star.externalQuestId ? remoteById.get(star.externalQuestId) : undefined;
    if (!topic || !root || !quest) {
      issues.push(`Quest link missing: ${starLabel}`);
      continue;
    }
    if (star.externalSource !== 'star-master') issues.push(`Quest source invalid: ${starLabel}`);
    const remoteHash = starMasterQuestContentHash(quest);
    if (!star.externalQuestContentHash || remoteHash !== star.externalQuestContentHash) {
      issues.push(`Quest hash mismatch: ${starLabel}`);
    }
    if (star.title) {
      const { payload } = buildStarMasterQuestMutation(star, root.externalHouseId || '', topic.externalTagId || '');
      if (!remoteQuestMatchesMutation(quest, payload)) issues.push(`Quest content mismatch: ${starLabel}`);
    }
  }
  console.log(JSON.stringify({
    phase: 'verify',
    houses: roots.length,
    topics: topics.length,
    stars: stars.length,
    issues
  }, null, 2));
  if (issues.length > 0) throw new Error(`Migration verification found ${issues.length} issue(s)`);
};

const cleanupLocalQuestData = async () => {
  const { stars } = await loadCatalog();
  const checkpoint = argValue('checkpoint');
  const fields = [
    'title',
    'description',
    'previewClip',
    'contentYouTube',
    'contentGoogleDrive',
    'nodePreview',
    'subQuests'
  ];
  const alreadyClean = stars.filter(star => !star.title && !star.description && !star.subQuests).length;
  console.log(JSON.stringify({
    phase: 'cleanup',
    mode: apply ? 'apply' : 'dry-run',
    stars: stars.length,
    alreadyClean,
    fields
  }, null, 2));
  if (!apply) return;
  if (argValue('confirm-cleanup') !== 'REMOVE_LOCAL_QUEST_DATA') {
    throw new Error('Cleanup requires --confirm-cleanup=REMOVE_LOCAL_QUEST_DATA');
  }
  if (!checkpoint || !path.isAbsolute(checkpoint) || !fs.existsSync(checkpoint) || fs.statSync(checkpoint).size < 1) {
    throw new Error('Cleanup requires --checkpoint=/absolute/path/to/a/non-empty/gugame.archive.gz');
  }

  await verifyMigration();
  const [usersWithSteps, usersWithRewards] = await Promise.all([
    User.countDocuments({ 'completedQuestSteps.0': { $exists: true } }),
    User.countDocuments({ 'completedQuestRewards.0': { $exists: true } })
  ]);
  if (usersWithSteps > 0 || usersWithRewards > 0) {
    throw new Error(`Cleanup stopped: ${usersWithSteps} users have local step progress and ${usersWithRewards} have local Quest rewards`);
  }
  const operations = stars
    .filter(star => star.externalSource === 'star-master' && star.externalQuestId)
    .map(star => ({
      updateOne: {
        filter: { _id: star._id, externalSource: 'star-master', externalQuestId: star.externalQuestId },
        update: {
          $set: { constellationLabel: (star.constellationLabel || star.title || 'Quest').slice(0, 80) },
          $unset: Object.fromEntries(fields.map(field => [field, 1]))
        }
      }
    }));
  if (operations.length !== stars.length) throw new Error('Cleanup stopped: not every Star has a verified StarMaster link');
  const result = await Skill.bulkWrite(operations, { ordered: true });
  if (result.matchedCount !== stars.length) {
    throw new Error(`Cleanup matched ${result.matchedCount}/${stars.length} Stars`);
  }
  console.log(JSON.stringify({ phase: 'cleanup', cleaned: result.modifiedCount, checkpoint }, null, 2));
  await verifyMigration();
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) throw new Error('MONGODB_URI is not configured');
  if (!['plan', 'houses', 'tags', 'quests', 'verify', 'cleanup'].includes(phase)) throw new Error(`Unknown phase: ${phase}`);
  await mongoose.connect(mongoUri);
  try {
    if (phase === 'plan') await planMigration();
    if (phase === 'houses') await migrateHouses();
    if (phase === 'tags') await migrateTags();
    if (phase === 'quests') await migrateQuests();
    if (phase === 'verify') await verifyMigration();
    if (phase === 'cleanup') await cleanupLocalQuestData();
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
