import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';
import ConstellationMap, {
  ConstellationScope,
  IConstellationViewport,
  IConstellationVisualTheme
} from '../src/models/ConstellationMap';
import Skill, { INodePreview, MapNodeRole } from '../src/models/Skill';
import User from '../src/models/User';
import { assertRoleAllowedForScope } from '../src/services/constellationService';

dotenv.config({ path: path.join(__dirname, '../.env') });

interface MapMigrationEntry {
  name: string;
  slug: string;
  description?: string;
  scope: ConstellationScope;
  parentSlug?: string;
  gatewaySkillId?: string;
  displayOrder?: number;
  isActive?: boolean;
  visualTheme?: Partial<IConstellationVisualTheme>;
  viewport?: Partial<IConstellationViewport>;
}

interface SkillMigrationEntry {
  skillId: string;
  mapSlug: string;
  mapNodeRole: MapNodeRole;
  constellationLabel?: string;
  constellationPosition?: { x: number; y: number };
  nodePreview?: INodePreview;
}

interface ConstellationMigrationManifest {
  maps: MapMigrationEntry[];
  skillAssignments: SkillMigrationEntry[];
}

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const fileFlagIndex = args.indexOf('--file');
const manifestPath = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;

const readManifest = (): ConstellationMigrationManifest | null => {
  if (!manifestPath) return null;
  const absolutePath = path.resolve(process.cwd(), manifestPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Migration manifest not found: ${absolutePath}`);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!Array.isArray(parsed.maps) || !Array.isArray(parsed.skillAssignments)) {
    throw new Error('Manifest requires maps and skillAssignments arrays');
  }
  return parsed;
};

const auditCurrentState = async () => {
  const [disciplineMaps, topicMaps, assignedSkills, totalSkills, users] = await Promise.all([
    ConstellationMap.countDocuments({ scope: 'discipline' }),
    ConstellationMap.countDocuments({ scope: 'topic' }),
    Skill.countDocuments({ constellationMapId: { $exists: true } }),
    Skill.countDocuments(),
    User.find({ unlockedSkills: { $exists: true, $ne: [] } }).select('unlockedSkills').lean()
  ]);
  const unlockedReferences = users.reduce((total, user) => total + (user.unlockedSkills?.length || 0), 0);
  console.log('Current constellation audit');
  console.log(`- Discipline maps: ${disciplineMaps}`);
  console.log(`- Topic maps: ${topicMaps}`);
  console.log(`- Assigned skills: ${assignedSkills}`);
  console.log(`- Unassigned skills: ${totalSkills - assignedSkills}`);
  console.log(`- Preserved user unlock references: ${unlockedReferences}`);
};

const validateAndPlan = async (manifest: ConstellationMigrationManifest) => {
  const validRoles = new Set<MapNodeRole>(['topic-gateway', 'lesson', 'boss', 'capstone']);
  for (const map of manifest.maps) {
    if (!map.name?.trim()) throw new Error('Every map requires a name');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(map.slug || '')) {
      throw new Error(`Invalid map slug: ${map.slug}`);
    }
    if (map.scope !== 'discipline' && map.scope !== 'topic') {
      throw new Error(`Invalid map scope for ${map.slug}`);
    }
    if (map.displayOrder !== undefined && (!Number.isInteger(map.displayOrder) || map.displayOrder < 0)) {
      throw new Error(`displayOrder must be a non-negative integer for ${map.slug}`);
    }
  }

  const slugs = manifest.maps.map(map => map.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error('Manifest map slugs must be unique');

  const assignmentsBySkillId = new Map<string, SkillMigrationEntry>();
  for (const assignment of manifest.skillAssignments) {
    if (!Types.ObjectId.isValid(assignment.skillId)) {
      throw new Error(`Invalid skillId: ${assignment.skillId}`);
    }
    if (assignmentsBySkillId.has(assignment.skillId)) {
      throw new Error(`Skill appears more than once in manifest: ${assignment.skillId}`);
    }
    if (!validRoles.has(assignment.mapNodeRole)) {
      throw new Error(`Invalid mapNodeRole for skill: ${assignment.skillId}`);
    }
    if (assignment.constellationPosition &&
      (!Number.isFinite(assignment.constellationPosition.x) ||
        !Number.isFinite(assignment.constellationPosition.y))) {
      throw new Error(`Invalid constellationPosition for skill: ${assignment.skillId}`);
    }
    if (assignment.constellationLabel !== undefined &&
      (typeof assignment.constellationLabel !== 'string' || !assignment.constellationLabel.trim())) {
      throw new Error(`Invalid constellationLabel for skill: ${assignment.skillId}`);
    }
    if (assignment.nodePreview) {
      const { imageUrl, summary, outcomes, actionLabel } = assignment.nodePreview;
      if ((imageUrl !== undefined && typeof imageUrl !== 'string') ||
        (summary !== undefined && typeof summary !== 'string') ||
        !Array.isArray(outcomes) || outcomes.some(outcome => typeof outcome !== 'string') ||
        typeof actionLabel !== 'string') {
        throw new Error(`Invalid nodePreview for skill: ${assignment.skillId}`);
      }
    }
    assignmentsBySkillId.set(assignment.skillId, assignment);
  }

  const requestedSkillIds = [...new Set([
    ...manifest.skillAssignments.map(assignment => assignment.skillId),
    ...manifest.maps.map(map => map.gatewaySkillId).filter((id): id is string => Boolean(id))
  ])];
  const [existingMaps, requestedSkills, existingGatewayMaps] = await Promise.all([
    ConstellationMap.find({ slug: { $in: slugs } }).lean(),
    Skill.find({ _id: { $in: requestedSkillIds } }).select('_id constellationMapId mapNodeRole').lean(),
    ConstellationMap.find({ gatewaySkillId: { $in: requestedSkillIds } })
      .select('slug gatewaySkillId')
      .lean()
  ]);
  const skillById = new Map(requestedSkills.map(skill => [skill._id.toString(), skill]));
  for (const skillId of requestedSkillIds) {
    if (!skillById.has(skillId)) throw new Error(`Skill not found: ${skillId}`);
  }

  const existingMapBySlug = new Map(existingMaps.map(map => [map.slug, map]));
  const plannedMapBySlug = new Map(manifest.maps.map(entry => {
    const existing = existingMapBySlug.get(entry.slug);
    return [entry.slug, {
      entry,
      _id: existing?._id || new Types.ObjectId()
    }] as const;
  }));

  for (const assignment of manifest.skillAssignments) {
    const targetMap = plannedMapBySlug.get(assignment.mapSlug);
    if (!targetMap) throw new Error(`Assignment references unknown map slug: ${assignment.mapSlug}`);
    assertRoleAllowedForScope(targetMap.entry.scope, assignment.mapNodeRole);
  }

  const gatewayIds = new Set<string>();
  for (const map of manifest.maps) {
    if (map.scope === 'discipline') {
      if (map.parentSlug || map.gatewaySkillId) {
        throw new Error(`Discipline map ${map.slug} cannot define parentSlug or gatewaySkillId`);
      }
      continue;
    }
    if (!map.parentSlug || !map.gatewaySkillId) {
      throw new Error(`Topic map ${map.slug} requires parentSlug and gatewaySkillId`);
    }
    const parent = plannedMapBySlug.get(map.parentSlug);
    if (!parent || parent.entry.scope !== 'discipline') {
      throw new Error(`Topic map ${map.slug} must reference a discipline map in the manifest`);
    }
    if (gatewayIds.has(map.gatewaySkillId)) {
      throw new Error(`Gateway skill is reused by multiple topic maps: ${map.gatewaySkillId}`);
    }
    gatewayIds.add(map.gatewaySkillId);
    const conflictingMap = existingGatewayMaps.find(existing =>
      existing.gatewaySkillId?.toString() === map.gatewaySkillId && existing.slug !== map.slug
    );
    if (conflictingMap) {
      throw new Error(`Gateway skill is already used by topic map: ${conflictingMap.slug}`);
    }

    const currentGateway = skillById.get(map.gatewaySkillId)!;
    const plannedGateway = assignmentsBySkillId.get(map.gatewaySkillId);
    const gatewayMapId = plannedGateway
      ? plannedMapBySlug.get(plannedGateway.mapSlug)?._id.toString()
      : currentGateway.constellationMapId?.toString();
    const gatewayRole = plannedGateway?.mapNodeRole || currentGateway.mapNodeRole;
    if (gatewayRole !== 'topic-gateway' || gatewayMapId !== parent._id.toString()) {
      throw new Error(`Gateway skill for ${map.slug} must be assigned to ${map.parentSlug} as topic-gateway`);
    }
  }

  return plannedMapBySlug;
};

const applyManifest = async (
  manifest: ConstellationMigrationManifest,
  plannedMapBySlug: Awaited<ReturnType<typeof validateAndPlan>>
) => {
  for (const { entry, _id } of plannedMapBySlug.values()) {
    const parentMapId = entry.parentSlug ? plannedMapBySlug.get(entry.parentSlug)?._id : undefined;
    const update = {
      name: entry.name,
      slug: entry.slug,
      description: entry.description || '',
      scope: entry.scope,
      ...(entry.scope === 'topic' ? {
        parentMapId,
        gatewaySkillId: entry.gatewaySkillId
      } : {}),
      displayOrder: entry.displayOrder ?? 0,
      isActive: entry.isActive !== false,
      ...(entry.visualTheme ? { visualTheme: entry.visualTheme } : {}),
      ...(entry.viewport ? { viewport: entry.viewport } : {}),
      schemaVersion: 1
    };
    await ConstellationMap.updateOne(
      { slug: entry.slug },
      {
        $set: update,
        ...(entry.scope === 'discipline'
          ? { $unset: { parentMapId: '', gatewaySkillId: '' } }
          : {}),
        $setOnInsert: { _id }
      },
      { upsert: true, runValidators: true }
    );
  }

  if (manifest.skillAssignments.length > 0) {
    await Skill.bulkWrite(manifest.skillAssignments.map(assignment => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(assignment.skillId) },
        update: {
          $set: {
            constellationMapId: plannedMapBySlug.get(assignment.mapSlug)!._id,
            mapNodeRole: assignment.mapNodeRole,
            ...(assignment.constellationLabel
              ? { constellationLabel: assignment.constellationLabel.trim() }
              : {}),
            ...(assignment.constellationPosition
              ? { constellationPosition: assignment.constellationPosition }
              : {}),
            ...(assignment.nodePreview ? { nodePreview: assignment.nodePreview } : {})
          }
        }
      }
    })));
  }
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required');
  if (applyChanges && !manifestPath) throw new Error('--apply requires --file <manifest.json>');

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB_NAME || undefined,
    serverSelectionTimeoutMS: 10_000
  });
  try {
    await auditCurrentState();
    const manifest = readManifest();
    if (!manifest) {
      console.log('Dry-run audit complete. No manifest supplied; no writes planned.');
      return;
    }

    const plan = await validateAndPlan(manifest);
    console.log(`Validated ${manifest.maps.length} maps and ${manifest.skillAssignments.length} skill assignments.`);
    if (!applyChanges) {
      console.log('Dry-run complete. Re-run with --apply to write this validated manifest.');
      return;
    }

    await applyManifest(manifest, plan);
    console.log('Migration applied. Skill IDs, unlock references, prerequisites, and connections were not modified.');
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
