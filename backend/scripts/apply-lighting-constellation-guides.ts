import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'APPLY_LIGHTING_CONSTELLATION_GUIDES';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const TOPIC_NAMES = ['Advance Lighting', 'Light Probe', 'Realtime Global Illumination', 'Area Light'];

interface GuideInput {
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

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const inputPath = argument('input');
  if (!inputPath || !path.isAbsolute(inputPath) || !fs.existsSync(inputPath)) throw new Error('A readable absolute --input path is required');
  if (APPLY && argument('confirm') !== CONFIRMATION) throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  const backupPath = argument('backup');
  if (APPLY && (!backupPath || !path.isAbsolute(backupPath))) throw new Error('Apply requires an absolute --backup path');

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as GuideInput[];
  const guideByName = new Map(input.map(guide => [guide.name, guide]));
  if (guideByName.size !== TOPIC_NAMES.length || TOPIC_NAMES.some(name => !guideByName.has(name))) {
    throw new Error(`Input must contain exactly: ${TOPIC_NAMES.join(', ')}`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const maps = await ConstellationMap.find({ scope: 'topic', name: { $in: TOPIC_NAMES } });
    if (maps.length !== TOPIC_NAMES.length) throw new Error(`Expected ${TOPIC_NAMES.length} topic maps, found ${maps.length}`);
    const plans = [];
    for (const map of maps) {
      const guide = guideByName.get(map.name)!;
      const stars = await Skill.find({ constellationMapId: map._id, isActive: true }).sort({ position: 1, _id: 1 });
      if (stars.length !== guide.positions.length) {
        throw new Error(`${map.name}: ${stars.length} active stars do not match ${guide.positions.length} guide positions`);
      }
      if (!guide.assetUrl.startsWith('/gugame/constellation-guides/') || guide.bakedBoundary.assetUrl !== guide.assetUrl || guide.bakedBoundary.path.length < 100) {
        throw new Error(`${map.name}: invalid guide asset or baked boundary`);
      }
      plans.push({ map, stars, guide });
    }

    console.log(JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      topics: plans.map(({ map, stars, guide }) => ({
        id: map._id.toString(),
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
      map.visualTheme.bakedBoundary = {
        ...guide.bakedBoundary,
        generatedAt: new Date(guide.bakedBoundary.generatedAt)
      };
      map.markModified('visualTheme');
      await map.save();
      await Promise.all(stars.map((star, index) => Skill.updateOne(
        { _id: star._id },
        { $set: { constellationPosition: guide.positions[index] } }
      )));
    }

    for (const { map, stars, guide } of plans) {
      const verifiedMap = await ConstellationMap.findById(map._id);
      const verifiedStars = await Skill.find({ _id: { $in: stars.map(star => star._id) } }).sort({ position: 1, _id: 1 });
      const positionsMatch = verifiedStars.every((star, index) =>
        star.constellationPosition?.x === guide.positions[index].x && star.constellationPosition?.y === guide.positions[index].y);
      if (verifiedMap?.visualTheme.backgroundAssetUrl !== guide.assetUrl ||
        verifiedMap.visualTheme.bakedBoundary?.assetUrl !== guide.assetUrl || !positionsMatch) {
        throw new Error(`${map.name}: post-migration verification failed`);
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
