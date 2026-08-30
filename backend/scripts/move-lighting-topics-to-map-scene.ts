import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'MOVE_LIGHTING_TOPICS_TO_MAP_SCENE';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const TOPIC_NAMES = ['Advance Lighting', 'Light Probe', 'Realtime Global Illumination', 'Area Light'];

const connectionTo = (targetSkillId: mongoose.Types.ObjectId) => [{
  targetSkillId,
  connectionType: 'normal' as const,
  hasArrowhead: true,
  curveMode: 'auto' as const,
  controlPoints: [],
  breakPoints: []
}];

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (APPLY && argument('confirm') !== CONFIRMATION) throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  const backupPath = argument('backup');
  if (APPLY && (!backupPath || !path.isAbsolute(backupPath))) throw new Error('Apply requires an absolute --backup path');

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const target = await ConstellationMap.findOne({ scope: 'discipline', name: 'Map & Scene' });
    if (!target) throw new Error('Map & Scene discipline was not found');
    const topics = await ConstellationMap.find({ scope: 'topic', name: { $in: TOPIC_NAMES } });
    if (topics.length !== TOPIC_NAMES.length) throw new Error(`Expected ${TOPIC_NAMES.length} lighting topics, found ${topics.length}`);
    const topicByName = new Map(topics.map(topic => [topic.name, topic]));
    const oldAdvanceGatewayId = topicByName.get('Advance Lighting')!.gatewaySkillId;
    const destinationAdvanceGateway = await Skill.findOne({
      constellationMapId: target._id,
      title: 'Advance Lighting',
      mapNodeRole: 'topic-gateway',
      isActive: true
    });
    if (!destinationAdvanceGateway || !oldAdvanceGatewayId) throw new Error('Advance Lighting gateway pair was not found');
    const oldAdvanceGateway = await Skill.findById(oldAdvanceGatewayId);
    const lightProbeGateway = await Skill.findById(topicByName.get('Light Probe')!.gatewaySkillId);
    const realtimeGateway = await Skill.findById(topicByName.get('Realtime Global Illumination')!.gatewaySkillId);
    const areaGateway = await Skill.findById(topicByName.get('Area Light')!.gatewaySkillId);
    if (!oldAdvanceGateway || !lightProbeGateway || !realtimeGateway || !areaGateway) throw new Error('One or more source gateways were not found');

    const affectedSkillIds = [destinationAdvanceGateway._id, oldAdvanceGateway._id, lightProbeGateway._id, realtimeGateway._id, areaGateway._id];
    const incoming = await Skill.find({ 'connections.targetSkillId': { $in: affectedSkillIds } });
    const plan = {
      mode: APPLY ? 'apply' : 'dry-run',
      target: { id: target._id.toString(), name: target.name, viewport: '2400x1400' },
      topics: TOPIC_NAMES.map(name => ({
        name,
        topicId: topicByName.get(name)!._id.toString(),
        gatewayId: (name === 'Advance Lighting' ? destinationAdvanceGateway._id : topicByName.get(name)!.gatewaySkillId)!.toString()
      })),
      sequence: ['Basic Lighting', ...TOPIC_NAMES],
      archivedGateway: { id: oldAdvanceGateway._id.toString(), title: oldAdvanceGateway.title },
      removedCrossSkyConnection: 'Area Light → GodRay'
    };
    console.log(JSON.stringify(plan, null, 2));
    if (!APPLY) return;

    fs.mkdirSync(path.dirname(backupPath!), { recursive: true });
    fs.writeFileSync(backupPath!, JSON.stringify({
      capturedAt: new Date().toISOString(),
      maps: [target, ...topics].map(map => map.toObject()),
      skills: [destinationAdvanceGateway, oldAdvanceGateway, lightProbeGateway, realtimeGateway, areaGateway, ...incoming]
        .filter((skill, index, rows) => rows.findIndex(candidate => candidate._id.equals(skill._id)) === index)
        .map(skill => skill.toObject())
    }, null, 2));

    target.viewport.width = 2400;
    target.viewport.height = 1400;
    await target.save();

    for (const topic of topics) {
      topic.parentMapId = target._id;
      if (topic.name === 'Advance Lighting') topic.gatewaySkillId = destinationAdvanceGateway._id;
      await topic.save();
    }

    await Skill.updateOne({ _id: oldAdvanceGateway._id }, { $set: { isActive: false, connections: [] } });
    await Skill.updateOne({ _id: destinationAdvanceGateway._id }, {
      $set: {
        constellationMapId: target._id,
        constellationPosition: { x: 1100, y: 260 },
        position: 15500,
        connections: connectionTo(lightProbeGateway._id)
      }
    });
    await Skill.updateOne({ _id: lightProbeGateway._id }, {
      $set: { constellationMapId: target._id, constellationPosition: { x: 1800, y: 260 }, position: 15600, connections: connectionTo(realtimeGateway._id) }
    });
    await Skill.updateOne({ _id: realtimeGateway._id }, {
      $set: { constellationMapId: target._id, constellationPosition: { x: 1800, y: 900 }, position: 15700, connections: connectionTo(areaGateway._id) }
    });
    await Skill.updateOne({ _id: areaGateway._id }, {
      $set: { constellationMapId: target._id, constellationPosition: { x: 1100, y: 900 }, position: 15800, connections: [] }
    });

    const verifiedTopics = await ConstellationMap.find({ _id: { $in: topics.map(topic => topic._id) }, parentMapId: target._id });
    const activeGateways = await Skill.find({ _id: { $in: [destinationAdvanceGateway._id, lightProbeGateway._id, realtimeGateway._id, areaGateway._id] } });
    const verifiedOldGateway = await Skill.findById(oldAdvanceGateway._id);
    if (verifiedTopics.length !== 4 || activeGateways.some(gateway => !gateway.constellationMapId?.equals(target._id)) || verifiedOldGateway?.isActive) {
      throw new Error('Post-migration verification failed');
    }
    console.log(JSON.stringify({ success: true, movedTopics: verifiedTopics.length, activeGateways: activeGateways.length, backupPath }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
