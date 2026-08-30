import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'APPLY_GAME_ART_SYSTEM_CONSTELLATION_REDESIGN';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

interface GuideInput {
  sky: 'Game Art' | 'System';
  name: string;
  assetUrl: string;
  positions: Array<{ x: number; y: number }>;
  bakedBoundary: {
    path: string;
    assetUrl: string;
    bounds: { x: number; y: number; width: number; height: number };
    imageSize: { width: number; height: number };
    generatedAt: string;
  };
}

const EXPECTED_TOPICS: Array<Pick<GuideInput, 'sky' | 'name'>> = [
  ['Game Art', 'Blender'], ['Game Art', 'Shader Graph'], ['Game Art', 'UI'], ['Game Art', 'Animation'],
  ['Game Art', 'Basic Particle System'], ['Game Art', 'Advance Particle System'], ['Game Art', 'Advance Blender'],
  ['Game Art', 'Sound'], ['Game Art', 'Light'], ['Game Art', 'GodRay'],
  ['System', 'C# Nard'], ['System', 'C# Dev L1'], ['System', 'Dev L2'], ['System', 'Lv.2 C# For Nerd'],
  ['System', 'Lv.2 C# For Unity Dev'], ['System', 'Lv.3 C# For Unity Dev'], ['System', 'Lv.3 C# For Nerd'],
  ['System', 'Lv.4 C# For Unity Dev'], ['System', 'Dev L3'], ['System', 'Dev L4'], ['System', 'Dev L5']
].map(([sky, name]) => ({ sky: sky as GuideInput['sky'], name }));

const keyFor = ({ sky, name }: Pick<GuideInput, 'sky' | 'name'>) => `${sky}/${name}`;

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const inputPath = argument('input');
  if (!inputPath || !path.isAbsolute(inputPath) || !fs.existsSync(inputPath)) throw new Error('A readable absolute --input path is required');
  if (APPLY && argument('confirm') !== CONFIRMATION) throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  const backupPath = argument('backup');
  if (APPLY && (!backupPath || !path.isAbsolute(backupPath))) throw new Error('Apply requires an absolute --backup path');

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as GuideInput[];
  const guideByKey = new Map(input.map(guide => [keyFor(guide), guide]));
  const expectedKeys = EXPECTED_TOPICS.map(keyFor);
  if (guideByKey.size !== EXPECTED_TOPICS.length || expectedKeys.some(key => !guideByKey.has(key))) {
    throw new Error(`Input must contain exactly ${EXPECTED_TOPICS.length} named Game Art/System topic guides`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const skies = await ConstellationMap.find({ scope: 'discipline', name: { $in: ['Game Art', 'System'] } });
    const skyByName = new Map(skies.map(sky => [sky.name, sky]));
    if (skyByName.size !== 2) throw new Error('Game Art and System discipline maps are required');
    const topicMaps = await ConstellationMap.find({
      scope: 'topic',
      parentMapId: { $in: skies.map(sky => sky._id) }
    });
    const plans = [];
    for (const expected of EXPECTED_TOPICS) {
      const sky = skyByName.get(expected.sky)!;
      const map = topicMaps.find(candidate => candidate.parentMapId?.equals(sky._id) && candidate.name === expected.name);
      if (!map) throw new Error(`${keyFor(expected)} topic map was not found`);
      const guide = guideByKey.get(keyFor(expected))!;
      const stars = await Skill.find({ constellationMapId: map._id, isActive: true }).sort({ position: 1, _id: 1 });
      if (stars.length !== guide.positions.length) throw new Error(`${keyFor(expected)} has ${stars.length} active stars but ${guide.positions.length} guide markers`);
      const boundary = guide.bakedBoundary;
      if (!guide.assetUrl.startsWith('/gugame/constellation-guides/') || boundary.assetUrl !== guide.assetUrl || boundary.path.length < 100 ||
        boundary.bounds.width !== map.viewport.width || boundary.bounds.height !== map.viewport.height ||
        boundary.imageSize.width < 1 || boundary.imageSize.height < 1) throw new Error(`${keyFor(expected)} has invalid guide metadata`);
      plans.push({ sky: expected.sky, map, stars, guide });
    }
    if (topicMaps.length !== plans.length) throw new Error(`Expected exactly ${plans.length} Game Art/System topic maps, found ${topicMaps.length}`);

    console.log(JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      topics: plans.map(({ sky, map, stars, guide }) => ({
        sky,
        name: map.name,
        assetUrl: guide.assetUrl,
        boundaryPathLength: guide.bakedBoundary.path.length,
        stars: stars.map((star, index) => ({ title: star.title, from: star.constellationPosition, to: guide.positions[index] }))
      }))
    }, null, 2));
    if (!APPLY) return;

    fs.mkdirSync(path.dirname(backupPath!), { recursive: true });
    fs.writeFileSync(backupPath!, JSON.stringify({
      capturedAt: new Date().toISOString(),
      maps: plans.map(({ map }) => map.toObject()),
      skills: plans.flatMap(({ stars }) => stars.map(star => star.toObject()))
    }, null, 2));

    for (const { map, stars, guide } of plans) {
      map.visualTheme.backgroundAssetUrl = guide.assetUrl;
      map.visualTheme.bakedBoundary = { ...guide.bakedBoundary, generatedAt: new Date(guide.bakedBoundary.generatedAt) };
      map.markModified('visualTheme');
      await map.save();
      if (stars.length) await Skill.bulkWrite(stars.map((star, index) => ({
        updateOne: { filter: { _id: star._id }, update: { $set: { constellationPosition: guide.positions[index] } } }
      })));
    }

    for (const { sky, map, stars, guide } of plans) {
      const [verifiedMap, verifiedStars] = await Promise.all([
        ConstellationMap.findById(map._id).lean(),
        Skill.find({ _id: { $in: stars.map(star => star._id) } }).sort({ position: 1, _id: 1 }).lean()
      ]);
      const positionsMatch = verifiedStars.every((star, index) =>
        star.constellationPosition?.x === guide.positions[index].x && star.constellationPosition?.y === guide.positions[index].y);
      if (verifiedMap?.visualTheme.backgroundAssetUrl !== guide.assetUrl ||
        verifiedMap.visualTheme.bakedBoundary?.assetUrl !== guide.assetUrl || !positionsMatch) {
        throw new Error(`${sky}/${map.name}: post-migration verification failed`);
      }
    }
    console.log(JSON.stringify({ success: true, updatedTopics: plans.length, backupPath }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
