import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'GROUP_SOUND_TOPICS_CONSTELLATION';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

const SOURCES = [
  { name: 'Sound001', level: 1, position: { x: 260, y: 450 } },
  { name: '3D Sound', level: 2, position: { x: 600, y: 450 } },
  { name: 'Audio Mixer', level: 3, position: { x: 940, y: 450 } },
  { name: 'ไหนรองทำอันนี้ให้พี่หน่อย', level: 4, position: { x: 1280, y: 450 } }
] as const;

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const backupPath = argument('backup');
  if (APPLY && argument('confirm') !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  }
  if (APPLY && (!backupPath || !path.isAbsolute(backupPath))) {
    throw new Error('Apply requires an absolute --backup path');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const discipline = await ConstellationMap.findOne({ name: 'Game Art', scope: 'discipline' });
    if (!discipline) throw new Error('Game Art discipline was not found');
    const sourceMaps = await ConstellationMap.find({
      parentMapId: discipline._id,
      scope: 'topic',
      name: { $in: SOURCES.map(source => source.name) }
    }).sort({ level: 1 });
    if (sourceMaps.length !== SOURCES.length) {
      throw new Error(`Expected ${SOURCES.length} Sound Topics; found ${sourceMaps.length}`);
    }
    const mapsByName = new Map(sourceMaps.map(map => [map.name, map]));
    const orderedMaps = SOURCES.map(source => {
      const map = mapsByName.get(source.name);
      if (!map || map.level !== source.level || !map.gatewaySkillId) {
        throw new Error(`${source.name} must be a Level ${source.level} Topic with a gateway`);
      }
      return map;
    });
    const allStars = await Skill.find({ constellationMapId: { $in: orderedMaps.map(map => map._id) } }).sort({ position: 1, _id: 1 });
    const primaryStars = orderedMaps.map(map => {
      const primary = allStars.filter(star => star.constellationMapId?.equals(map._id) && star.isActive);
      if (primary.length !== 1) throw new Error(`${map.name} must have exactly one published Star; found ${primary.length}`);
      return primary[0];
    });
    const gateways = await Skill.find({ _id: { $in: orderedMaps.map(map => map.gatewaySkillId!) } });
    if (gateways.length !== SOURCES.length) throw new Error('One or more Sound Topic gateways are missing');
    const gatewayById = new Map(gateways.map(gateway => [gateway._id.toString(), gateway]));
    const targetMap = orderedMaps[0];
    const targetGateway = gatewayById.get(targetMap.gatewaySkillId!.toString());
    if (!targetGateway) throw new Error('Sound001 gateway is missing');
    const archivedMaps = orderedMaps.slice(1);
    const archivedGatewayIds = archivedMaps.map(map => map.gatewaySkillId!.toString());

    const plan = {
      discipline: discipline.name,
      target: { id: targetMap._id.toString(), name: 'Sound', gatewayId: targetGateway._id.toString() },
      stars: primaryStars.map((star, index) => ({
        id: star._id.toString(),
        name: star.constellationLabel || star.title,
        level: SOURCES[index].level,
        position: SOURCES[index].position,
        connectsTo: index < primaryStars.length - 1 ? (primaryStars[index + 1].constellationLabel || primaryStars[index + 1].title) : null
      })),
      preservedHiddenStars: allStars.length - primaryStars.length,
      removedGatewayIds: archivedGatewayIds,
      removedTopicIds: archivedMaps.map(map => map._id.toString())
    };
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', plan }, null, 2));
    if (!APPLY) return;

    fs.mkdirSync(path.dirname(backupPath!), { recursive: true });
    fs.writeFileSync(backupPath!, JSON.stringify({
      capturedAt: new Date().toISOString(),
      discipline: discipline.toObject(),
      maps: orderedMaps.map(map => map.toObject()),
      gateways: gateways.map(gateway => gateway.toObject()),
      stars: allStars.map(star => star.toObject())
    }, null, 2));

    await ConstellationMap.updateOne({ _id: targetMap._id }, {
      $set: { name: 'Sound', slug: 'game-art-sound', level: 1, isActive: true, gatewaySkillId: targetGateway._id }
    });
    await Skill.updateOne({ _id: targetGateway._id }, {
      $set: { title: 'Sound', constellationLabel: 'Sound', isActive: true, connections: [] }
    });

    await Promise.all(primaryStars.map((star, index) => Skill.updateOne({ _id: star._id }, {
      $set: {
        constellationMapId: targetMap._id,
        mapNodeRole: 'lesson',
        isActive: true,
        position: (index + 1) * 100,
        constellationPosition: SOURCES[index].position,
        connections: index < primaryStars.length - 1 ? [{
          targetSkillId: primaryStars[index + 1]._id.toString(),
          connectionType: 'normal',
          hasArrowhead: true,
          curveMode: 'auto',
          controlPoints: [],
          breakPoints: []
        }] : []
      }
    })));

    const hiddenStars = allStars.filter(star => !primaryStars.some(primary => primary._id.equals(star._id)));
    await Promise.all(hiddenStars.map((star, index) => Skill.updateOne({ _id: star._id }, {
      $set: { constellationMapId: targetMap._id, position: 1000 + index, isActive: false }
    })));
    await Skill.updateMany({ _id: { $in: archivedGatewayIds } }, { $set: { isActive: false, connections: [] } });
    await Skill.updateMany({
      $or: [
        { 'connections.targetSkillId': { $in: archivedGatewayIds } },
        { prerequisites: { $in: archivedGatewayIds } }
      ]
    }, {
      $pull: {
        connections: { targetSkillId: { $in: archivedGatewayIds } },
        prerequisites: { $in: archivedGatewayIds }
      }
    });
    await ConstellationMap.deleteMany({ _id: { $in: archivedMaps.map(map => map._id) } });
    await Skill.deleteMany({ _id: { $in: archivedGatewayIds } });

    const [verifiedMap, verifiedStars, visibleGateways] = await Promise.all([
      ConstellationMap.findById(targetMap._id).lean(),
      Skill.find({ constellationMapId: targetMap._id, isActive: true }).sort({ position: 1 }).lean(),
      Skill.find({ constellationMapId: discipline._id, mapNodeRole: 'topic-gateway', isActive: true }).lean()
    ]);
    const expectedIds = primaryStars.map(star => star._id.toString());
    if (verifiedMap?.name !== 'Sound' || verifiedStars.length !== 4 ||
      verifiedStars.some((star, index) => star._id.toString() !== expectedIds[index]) ||
      visibleGateways.filter(gateway => gateway._id.equals(targetGateway._id)).length !== 1 ||
      archivedGatewayIds.some(id => visibleGateways.some(gateway => gateway._id.toString() === id))) {
      throw new Error('Sound constellation verification failed');
    }
    console.log(JSON.stringify({ success: true, targetMapId: targetMap._id.toString(), starIds: expectedIds, backupPath }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
