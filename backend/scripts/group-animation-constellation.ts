import dotenv from 'dotenv';
import fs from 'node:fs';
import mongoose from 'mongoose';
import path from 'node:path';
import ConstellationMap from '../src/models/ConstellationMap';
import Skill from '../src/models/Skill';

dotenv.config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRMATION = 'GROUP_ANIMATION_CONSTELLATION';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

const starTitles = ['TimeLine', 'Animation', 'BlendTree', 'IK animation'] as const;

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (APPLY && argument('confirm') !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}`);
  }
  const backupPath = argument('backup');
  if (APPLY && (!backupPath || !path.isAbsolute(backupPath))) {
    throw new Error('Apply requires an absolute --backup path');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const discipline = await ConstellationMap.findOne({ name: 'Game Art', scope: 'discipline' });
    if (!discipline) throw new Error('Game Art discipline was not found');
    const topic = await ConstellationMap.findOne({
      name: 'Animation',
      scope: 'topic',
      parentMapId: discipline._id
    });
    if (!topic) throw new Error('Animation topic under Game Art was not found');

    const stars = await Skill.find({ title: { $in: starTitles } }).sort({ _id: 1 });
    const starByTitle = new Map(stars.map(star => [star.title, star]));
    if (starTitles.some(title => !starByTitle.has(title))) {
      throw new Error('Timeline, Animation, BlendTree, and IK animation must all exist before grouping');
    }
    const animation = starByTitle.get('Animation')!;
    const timeline = starByTitle.get('TimeLine')!;
    const blendTree = starByTitle.get('BlendTree')!;
    const ikAnimation = starByTitle.get('IK animation')!;
    const gateway = await Skill.findOne({
      title: 'Animation Gateway',
      constellationMapId: discipline._id,
      mapNodeRole: 'topic-gateway'
    });

    const plan = {
      discipline: discipline.name,
      topic: topic.name,
      gateway: gateway?._id.toString() || 'create Animation Gateway',
      stars: [
        { title: timeline.title, position: { x: 390, y: 470 }, connectsTo: animation.title },
        { title: animation.title, position: { x: 650, y: 470 }, connectsTo: [blendTree.title, ikAnimation.title] },
        { title: blendTree.title, position: { x: 930, y: 330 } },
        { title: ikAnimation.title, position: { x: 930, y: 610 } }
      ]
    };
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', plan }, null, 2));
    if (!APPLY) return;

    const snapshot = {
      capturedAt: new Date().toISOString(),
      discipline: discipline.toObject(),
      topic: topic.toObject(),
      gateway: gateway?.toObject() || null,
      stars: stars.map(star => star.toObject())
    };
    fs.mkdirSync(path.dirname(backupPath!), { recursive: true });
    fs.writeFileSync(backupPath!, JSON.stringify(snapshot, null, 2));

    const activeGateway = gateway || await Skill.create({
      title: 'Animation Gateway',
      description: 'Open the Animation constellation.',
      cost: 0,
      nextQuestCost: 0,
      layer: 0,
      position: animation.position,
      constellationPosition: animation.constellationPosition,
      constellationMapId: discipline._id,
      constellationLabel: 'Animation',
      mapNodeRole: 'topic-gateway',
      nodeColor: 'yellow',
      nodeType: 'marker',
      isActive: true,
      connections: []
    });

    await ConstellationMap.updateOne({ _id: topic._id }, { $set: { gatewaySkillId: activeGateway._id } });
    await Skill.updateOne({ _id: timeline._id }, {
      $set: {
        constellationMapId: topic._id, mapNodeRole: 'lesson', position: 100,
        constellationPosition: { x: 390, y: 470 },
        connections: [{ targetSkillId: animation._id.toString(), connectionType: 'normal', hasArrowhead: true, curveMode: 'auto', controlPoints: [], breakPoints: [] }]
      }
    });
    await Skill.updateOne({ _id: animation._id }, {
      $set: {
        constellationMapId: topic._id, mapNodeRole: 'lesson', position: 200,
        constellationPosition: { x: 650, y: 470 },
        connections: [blendTree, ikAnimation].map(target => ({ targetSkillId: target._id.toString(), connectionType: 'normal', hasArrowhead: true, curveMode: 'auto', controlPoints: [], breakPoints: [] }))
      }
    });
    await Skill.updateOne({ _id: blendTree._id }, {
      $set: { constellationMapId: topic._id, mapNodeRole: 'lesson', position: 300, constellationPosition: { x: 930, y: 330 }, connections: [] }
    });
    await Skill.updateOne({ _id: ikAnimation._id }, {
      $set: { constellationMapId: topic._id, mapNodeRole: 'lesson', position: 400, constellationPosition: { x: 930, y: 610 }, connections: [] }
    });

    const [verifiedTopic, verifiedGateway, verifiedStars] = await Promise.all([
      ConstellationMap.findById(topic._id).lean(),
      Skill.findById(activeGateway._id).lean(),
      Skill.find({ _id: { $in: [timeline._id, animation._id, blendTree._id, ikAnimation._id] } }).lean()
    ]);
    if (verifiedTopic?.gatewaySkillId?.toString() !== activeGateway._id.toString() ||
      verifiedGateway?.constellationMapId?.toString() !== discipline._id.toString() ||
      verifiedStars.length !== 4 || verifiedStars.some(star => star.constellationMapId?.toString() !== topic._id.toString())) {
      throw new Error('Post-migration verification failed');
    }
    console.log(JSON.stringify({ success: true, backup: backupPath, topicId: topic._id.toString(), gatewayId: activeGateway._id.toString() }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
