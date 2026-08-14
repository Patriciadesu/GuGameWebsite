import { Types } from 'mongoose';
import ConstellationMap, { ConstellationScope, ConstellationType } from '../models/ConstellationMap';
import Skill, { MapNodeRole } from '../models/Skill';

export class ConstellationOperationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 409 = 400
  ) {
    super(message);
    this.name = 'ConstellationOperationError';
  }
}

export interface ConstellationMapLinkage {
  constellationType: ConstellationType;
  scope: ConstellationScope;
  parentMapId?: unknown;
  gatewaySkillId?: unknown;
}

export interface ConstellationHierarchyNode {
  constellationType: ConstellationType;
  scope: ConstellationScope;
}

export interface SkillMapAssignment {
  skillId?: string;
  constellationMapId?: unknown;
  mapNodeRole: MapNodeRole;
  mainQuestLevel?: unknown;
}

export interface ConstellationLayoutNode {
  skillId: string;
  x: number;
  y: number;
}

export interface ConstellationViewportBounds {
  width: number;
  height: number;
}

const objectIdString = (value: unknown, fieldName: string): string => {
  const normalized = value instanceof Types.ObjectId ? value.toString() : String(value || '');
  if (!Types.ObjectId.isValid(normalized)) {
    throw new ConstellationOperationError(`${fieldName} must be a valid ID`);
  }
  return normalized;
};

export const normalizeConstellationLayout = (
  value: unknown,
  viewport: ConstellationViewportBounds
): ConstellationLayoutNode[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConstellationOperationError('Layout must contain at least one node');
  }
  if (value.length > 500) {
    throw new ConstellationOperationError('Layout cannot update more than 500 nodes at once');
  }
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
    viewport.width <= 0 || viewport.height <= 0) {
    throw new ConstellationOperationError('Map viewport is invalid');
  }

  const seen = new Set<string>();
  return value.map((candidate: unknown, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new ConstellationOperationError(`Layout node ${index + 1} is invalid`);
    }
    const node = candidate as Record<string, unknown>;
    const skillId = objectIdString(node.skillId, `nodes[${index}].skillId`);
    if (seen.has(skillId)) {
      throw new ConstellationOperationError(`Layout contains duplicate skill ${skillId}`);
    }
    seen.add(skillId);

    const x = Number(node.x);
    const y = Number(node.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new ConstellationOperationError(`Layout node ${index + 1} must contain numeric x and y values`);
    }
    if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) {
      throw new ConstellationOperationError(`Layout node ${index + 1} is outside the map viewport`);
    }

    return { skillId, x, y };
  });
};

export const assertRoleAllowedForScope = (
  scope: ConstellationScope,
  role: MapNodeRole,
  constellationType: ConstellationType = 'skill'
): void => {
  if (constellationType === 'main') {
    if (role === 'topic-gateway') {
      throw new ConstellationOperationError('Main quest maps cannot contain topic-gateway nodes');
    }
    return;
  }
  if (scope === 'discipline' && role !== 'topic-gateway') {
    throw new ConstellationOperationError('Discipline maps only accept topic-gateway nodes');
  }
  if (scope === 'topic' && role === 'topic-gateway') {
    throw new ConstellationOperationError('Topic maps cannot contain topic-gateway nodes');
  }
};

export const assertConstellationHierarchyIntegrity = (
  parent: ConstellationHierarchyNode,
  child: ConstellationHierarchyNode
): void => {
  if (parent.constellationType !== child.constellationType) {
    throw new ConstellationOperationError(
      'Topic and parent map must use the same constellation type',
      409
    );
  }
  if (parent.constellationType === 'main') {
    throw new ConstellationOperationError('Main Quest paths do not use topic maps');
  }
  if (parent.scope !== 'discipline') {
    throw new ConstellationOperationError('Topic maps must belong to a discipline map');
  }
  if (child.scope !== 'topic') {
    throw new ConstellationOperationError('Only topic maps can belong to a parent map');
  }
};

export const validateConstellationMapLinkage = async (
  linkage: ConstellationMapLinkage,
  mapId?: string
): Promise<void> => {
  if (linkage.constellationType === 'main' && linkage.scope !== 'discipline') {
    throw new ConstellationOperationError('Main Quest maps do not use topic maps');
  }
  if (linkage.scope === 'discipline') {
    if (linkage.parentMapId || linkage.gatewaySkillId) {
      throw new ConstellationOperationError('Discipline maps cannot have a parent map or gateway skill');
    }
    return;
  }

  if (!linkage.parentMapId || !linkage.gatewaySkillId) {
    throw new ConstellationOperationError('Topic maps require both a parent map and gateway skill');
  }

  const parentMapId = objectIdString(linkage.parentMapId, 'parentMapId');
  const gatewaySkillId = objectIdString(linkage.gatewaySkillId, 'gatewaySkillId');
  if (mapId && parentMapId === mapId) {
    throw new ConstellationOperationError('A constellation map cannot be its own parent');
  }

  const [parentMap, gatewaySkill] = await Promise.all([
    ConstellationMap.findById(parentMapId).select('_id scope constellationType').lean(),
    Skill.findById(gatewaySkillId).select('_id constellationMapId mapNodeRole').lean()
  ]);
  if (!parentMap) {
    throw new ConstellationOperationError('Parent constellation map not found', 404);
  }
  assertConstellationHierarchyIntegrity(
    {
      scope: parentMap.scope,
      constellationType: parentMap.constellationType || 'skill'
    },
    { scope: linkage.scope, constellationType: linkage.constellationType }
  );
  if (!gatewaySkill) {
    throw new ConstellationOperationError('Gateway skill not found', 404);
  }
  if (gatewaySkill.mapNodeRole !== 'topic-gateway') {
    throw new ConstellationOperationError('Gateway skill must use the topic-gateway role');
  }
  if (gatewaySkill.constellationMapId?.toString() !== parentMapId) {
    throw new ConstellationOperationError('Gateway skill must belong to the topic map parent');
  }
}

export const validateSkillMapAssignment = async (
  assignment: SkillMapAssignment
): Promise<void> => {
  if (!assignment.constellationMapId) {
    if (assignment.mainQuestLevel !== undefined && assignment.mainQuestLevel !== null) {
      throw new ConstellationOperationError('Only Main Quest stars can have a Main Quest level');
    }
    if (assignment.mapNodeRole !== 'lesson') {
      throw new ConstellationOperationError('Unassigned skills must use the lesson role');
    }
    if (assignment.skillId) {
      const dependentTopic = await ConstellationMap.findOne({ gatewaySkillId: assignment.skillId })
        .select('_id')
        .lean();
      if (dependentTopic) {
        throw new ConstellationOperationError('Skill cannot be unassigned while it opens a topic map', 409);
      }
    }
    return;
  }

  const constellationMapId = objectIdString(assignment.constellationMapId, 'constellationMapId');
  const map = await ConstellationMap.findById(constellationMapId).select('_id scope constellationType').lean();
  if (!map) {
    throw new ConstellationOperationError('Constellation map not found', 404);
  }
  assertRoleAllowedForScope(map.scope, assignment.mapNodeRole, map.constellationType || 'skill');

  if (map.constellationType === 'main') {
    const mainQuestLevel = Number(assignment.mainQuestLevel);
    if (!Number.isInteger(mainQuestLevel) || mainQuestLevel < 1) {
      throw new ConstellationOperationError('Main Quest level must be a positive integer');
    }
    const duplicate = await Skill.exists({
      constellationMapId,
      mainQuestLevel,
      ...(assignment.skillId ? { _id: { $ne: assignment.skillId } } : {})
    });
    if (duplicate) {
      throw new ConstellationOperationError(`Level ${mainQuestLevel} already has a Main Quest`, 409);
    }
  } else if (assignment.mainQuestLevel !== undefined && assignment.mainQuestLevel !== null) {
    throw new ConstellationOperationError('Skill Constellation stars cannot have a Main Quest level');
  }

  if (!assignment.skillId) return;
  const dependentTopic = await ConstellationMap.findOne({ gatewaySkillId: assignment.skillId })
    .select('_id parentMapId')
    .lean();
  if (dependentTopic && (
    assignment.mapNodeRole !== 'topic-gateway' ||
    dependentTopic.parentMapId?.toString() !== constellationMapId
  )) {
    throw new ConstellationOperationError(
      'Skill assignment must continue to match the topic map it opens',
      409
    );
  }
};

export const validateConstellationMapContents = async (
  mapId: string,
  scope: ConstellationScope,
  constellationType: ConstellationType = 'skill'
): Promise<void> => {
  const incompatibleSkill = await Skill.exists({
    constellationMapId: mapId,
    mapNodeRole: constellationType === 'main'
      ? 'topic-gateway'
      : scope === 'discipline' ? { $ne: 'topic-gateway' } : 'topic-gateway'
  });
  if (incompatibleSkill) {
    throw new ConstellationOperationError(
      `Move or change incompatible nodes before converting this map to ${scope}`,
      409
    );
  }

  if (scope === 'topic') {
    const childMap = await ConstellationMap.exists({ parentMapId: mapId });
    if (childMap) {
      throw new ConstellationOperationError(
        'A map with topic children must remain a discipline map',
        409
      );
    }
  }
};

export const assertConstellationMapCanBeDeleted = async (mapId: string): Promise<void> => {
  const [assignedSkill, childMap] = await Promise.all([
    Skill.exists({ constellationMapId: mapId }),
    ConstellationMap.exists({ parentMapId: mapId })
  ]);
  if (assignedSkill) {
    throw new ConstellationOperationError('Move or unassign this map\'s skills before deleting it', 409);
  }
  if (childMap) {
    throw new ConstellationOperationError('Delete this discipline map\'s topic maps first', 409);
  }
};

export const assertSkillCanBeDeleted = async (skillId: string): Promise<void> => {
  const dependentTopic = await ConstellationMap.exists({ gatewaySkillId: skillId });
  if (dependentTopic) {
    throw new ConstellationOperationError('Delete the topic map opened by this skill first', 409);
  }
};
