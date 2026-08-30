import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'APPLY_BAKED_CONSTELLATION_BOUNDARIES';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

interface BoundaryInput {
  path: string;
  assetUrl: string;
  bounds: { x: number; y: number; width: number; height: number };
  imageSize?: { width: number; height: number };
  generatedAt?: string;
}

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const inputPath = argument('input');
  if (!inputPath || !path.isAbsolute(inputPath) || !fs.existsSync(inputPath)) {
    throw new Error('A readable absolute --input path is required');
  }
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as Record<string, BoundaryInput>;
  const backupPath = argument('backup');
  if (APPLY && argument('confirm') !== CONFIRMATION) throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  if (APPLY && (!backupPath || !path.isAbsolute(backupPath))) throw new Error('Apply requires an absolute --backup path');

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const maps = await ConstellationMap.find({ 'visualTheme.backgroundAssetUrl': { $exists: true, $ne: '' } });
    const plan = maps.map(map => {
      const key = `${map.viewport.width}x${map.viewport.height}`;
      const boundary = input[key];
      if (!boundary?.path || boundary.assetUrl !== map.visualTheme.backgroundAssetUrl) {
        throw new Error(`${map.name} has no matching baked boundary for ${key}`);
      }
      return { map, key, boundary };
    });
    console.log(JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      maps: plan.map(item => ({ id: item.map._id.toString(), name: item.map.name, viewport: item.key, pathLength: item.boundary.path.length }))
    }, null, 2));
    if (!APPLY) return;

    fs.mkdirSync(path.dirname(backupPath!), { recursive: true });
    fs.writeFileSync(backupPath!, JSON.stringify({
      capturedAt: new Date().toISOString(),
      maps: plan.map(item => item.map.toObject())
    }, null, 2));
    for (const { map, boundary } of plan) {
      map.visualTheme.bakedBoundary = {
        path: boundary.path,
        assetUrl: boundary.assetUrl,
        bounds: boundary.bounds,
        imageSize: boundary.imageSize,
        generatedAt: boundary.generatedAt ? new Date(boundary.generatedAt) : new Date()
      };
      map.markModified('visualTheme.bakedBoundary');
      await map.save();
    }
    const verified = await ConstellationMap.countDocuments({
      _id: { $in: plan.map(item => item.map._id) },
      'visualTheme.bakedBoundary.path': { $exists: true, $ne: '' }
    });
    if (verified !== plan.length) throw new Error(`Boundary verification failed: ${verified}/${plan.length}`);
    console.log(JSON.stringify({ success: true, updatedMaps: verified, backupPath }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
