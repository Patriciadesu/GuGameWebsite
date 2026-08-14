import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';

dotenv.config({ path: path.join(__dirname, '../.env') });

const applyChanges = process.argv.includes('--apply');

const levelFromTitle = (title: string): number | undefined => {
  const match = title.match(/\blevel\s*(\d+)\b/i);
  if (!match) return undefined;
  const level = Number(match[1]);
  return Number.isInteger(level) && level > 0 ? level : undefined;
};

const nextFreeLevel = (used: Set<number>): number => {
  let level = 1;
  while (used.has(level)) level += 1;
  return level;
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB_NAME || undefined,
    serverSelectionTimeoutMS: 10_000
  });

  try {
    const mainMaps = await ConstellationMap.find({ constellationType: 'main', scope: 'discipline' })
      .select('_id name')
      .lean();

    if (mainMaps.length === 0) {
      console.log('No Main Quest paths found.');
      return;
    }

    for (const map of mainMaps) {
      const quests = await Skill.find({ constellationMapId: map._id })
        .select('_id title position mainQuestLevel mapNodeRole nodeColor nodeType nextQuestCost')
        .sort({ position: 1, createdAt: 1, _id: 1 })
        .lean();
      const used = new Set<number>();
      const assignments = quests.map(quest => {
        const existingLevel = Number.isInteger(quest.mainQuestLevel) && (quest.mainQuestLevel || 0) > 0
          ? quest.mainQuestLevel
          : undefined;
        const titleLevel = levelFromTitle(quest.title);
        const level = existingLevel && !used.has(existingLevel)
          ? existingLevel
          : titleLevel && !used.has(titleLevel)
            ? titleLevel
            : nextFreeLevel(used);
        used.add(level);
        return { quest, level };
      });

      console.log(`Main Quest path: ${map.name}`);
      for (const { quest, level } of assignments) {
        console.log(`- Level ${level}: ${quest.title}`);
      }

      if (!applyChanges || assignments.length === 0) continue;
      await Skill.bulkWrite(assignments.map(({ quest, level }) => ({
        updateOne: {
          filter: { _id: quest._id },
          update: {
            $set: {
              mainQuestLevel: level,
              nodeColor: 'green',
              nodeType: 'quest',
              nextQuestCost: 0,
              ...(quest.mapNodeRole === 'topic-gateway' ? { mapNodeRole: 'lesson' } : {})
            }
          }
        }
      })));
    }

    console.log(applyChanges
      ? 'Main Quest level migration applied. Existing quest IDs and user progress were preserved.'
      : 'Dry run only. Re-run with --apply to write these assignments.');
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
