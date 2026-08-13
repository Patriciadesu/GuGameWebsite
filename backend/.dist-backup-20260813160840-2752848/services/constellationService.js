"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSkillCanBeDeleted = exports.assertConstellationMapCanBeDeleted = exports.validateConstellationMapContents = exports.validateSkillMapAssignment = exports.validateConstellationMapLinkage = exports.assertConstellationHierarchyIntegrity = exports.assertRoleAllowedForScope = exports.normalizeConstellationLayout = exports.ConstellationOperationError = void 0;
const mongoose_1 = require("mongoose");
const ConstellationMap_1 = __importDefault(require("../models/ConstellationMap"));
const Skill_1 = __importDefault(require("../models/Skill"));
class ConstellationOperationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ConstellationOperationError';
    }
}
exports.ConstellationOperationError = ConstellationOperationError;
const objectIdString = (value, fieldName) => {
    const normalized = value instanceof mongoose_1.Types.ObjectId ? value.toString() : String(value || '');
    if (!mongoose_1.Types.ObjectId.isValid(normalized)) {
        throw new ConstellationOperationError(`${fieldName} must be a valid ID`);
    }
    return normalized;
};
const normalizeConstellationLayout = (value, viewport) => {
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
    const seen = new Set();
    return value.map((candidate, index) => {
        if (!candidate || typeof candidate !== 'object') {
            throw new ConstellationOperationError(`Layout node ${index + 1} is invalid`);
        }
        const node = candidate;
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
exports.normalizeConstellationLayout = normalizeConstellationLayout;
const assertRoleAllowedForScope = (scope, role) => {
    if (scope === 'discipline' && role !== 'topic-gateway') {
        throw new ConstellationOperationError('Discipline maps only accept topic-gateway nodes');
    }
    if (scope === 'topic' && role === 'topic-gateway') {
        throw new ConstellationOperationError('Topic maps cannot contain topic-gateway nodes');
    }
};
exports.assertRoleAllowedForScope = assertRoleAllowedForScope;
const assertConstellationHierarchyIntegrity = (parent, child) => {
    if (parent.scope !== 'discipline') {
        throw new ConstellationOperationError('Topic maps must belong to a discipline map');
    }
    if (child.scope !== 'topic') {
        throw new ConstellationOperationError('Only topic maps can belong to a parent map');
    }
    if (parent.constellationType !== child.constellationType) {
        throw new ConstellationOperationError('Topic and parent map must use the same constellation type', 409);
    }
};
exports.assertConstellationHierarchyIntegrity = assertConstellationHierarchyIntegrity;
const validateConstellationMapLinkage = async (linkage, mapId) => {
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
        ConstellationMap_1.default.findById(parentMapId).select('_id scope constellationType').lean(),
        Skill_1.default.findById(gatewaySkillId).select('_id constellationMapId mapNodeRole').lean()
    ]);
    if (!parentMap) {
        throw new ConstellationOperationError('Parent constellation map not found', 404);
    }
    (0, exports.assertConstellationHierarchyIntegrity)({
        scope: parentMap.scope,
        constellationType: parentMap.constellationType || 'skill'
    }, { scope: linkage.scope, constellationType: linkage.constellationType });
    if (!gatewaySkill) {
        throw new ConstellationOperationError('Gateway skill not found', 404);
    }
    if (gatewaySkill.mapNodeRole !== 'topic-gateway') {
        throw new ConstellationOperationError('Gateway skill must use the topic-gateway role');
    }
    if (gatewaySkill.constellationMapId?.toString() !== parentMapId) {
        throw new ConstellationOperationError('Gateway skill must belong to the topic map parent');
    }
};
exports.validateConstellationMapLinkage = validateConstellationMapLinkage;
const validateSkillMapAssignment = async (assignment) => {
    if (!assignment.constellationMapId) {
        if (assignment.mapNodeRole !== 'lesson') {
            throw new ConstellationOperationError('Unassigned skills must use the lesson role');
        }
        if (assignment.skillId) {
            const dependentTopic = await ConstellationMap_1.default.findOne({ gatewaySkillId: assignment.skillId })
                .select('_id')
                .lean();
            if (dependentTopic) {
                throw new ConstellationOperationError('Skill cannot be unassigned while it opens a topic map', 409);
            }
        }
        return;
    }
    const constellationMapId = objectIdString(assignment.constellationMapId, 'constellationMapId');
    const map = await ConstellationMap_1.default.findById(constellationMapId).select('_id scope').lean();
    if (!map) {
        throw new ConstellationOperationError('Constellation map not found', 404);
    }
    (0, exports.assertRoleAllowedForScope)(map.scope, assignment.mapNodeRole);
    if (!assignment.skillId)
        return;
    const dependentTopic = await ConstellationMap_1.default.findOne({ gatewaySkillId: assignment.skillId })
        .select('_id parentMapId')
        .lean();
    if (dependentTopic && (assignment.mapNodeRole !== 'topic-gateway' ||
        dependentTopic.parentMapId?.toString() !== constellationMapId)) {
        throw new ConstellationOperationError('Skill assignment must continue to match the topic map it opens', 409);
    }
};
exports.validateSkillMapAssignment = validateSkillMapAssignment;
const validateConstellationMapContents = async (mapId, scope) => {
    const incompatibleSkill = await Skill_1.default.exists({
        constellationMapId: mapId,
        mapNodeRole: scope === 'discipline' ? { $ne: 'topic-gateway' } : 'topic-gateway'
    });
    if (incompatibleSkill) {
        throw new ConstellationOperationError(`Move or change incompatible nodes before converting this map to ${scope}`, 409);
    }
    if (scope === 'topic') {
        const childMap = await ConstellationMap_1.default.exists({ parentMapId: mapId });
        if (childMap) {
            throw new ConstellationOperationError('A map with topic children must remain a discipline map', 409);
        }
    }
};
exports.validateConstellationMapContents = validateConstellationMapContents;
const assertConstellationMapCanBeDeleted = async (mapId) => {
    const [assignedSkill, childMap] = await Promise.all([
        Skill_1.default.exists({ constellationMapId: mapId }),
        ConstellationMap_1.default.exists({ parentMapId: mapId })
    ]);
    if (assignedSkill) {
        throw new ConstellationOperationError('Move or unassign this map\'s skills before deleting it', 409);
    }
    if (childMap) {
        throw new ConstellationOperationError('Delete this discipline map\'s topic maps first', 409);
    }
};
exports.assertConstellationMapCanBeDeleted = assertConstellationMapCanBeDeleted;
const assertSkillCanBeDeleted = async (skillId) => {
    const dependentTopic = await ConstellationMap_1.default.exists({ gatewaySkillId: skillId });
    if (dependentTopic) {
        throw new ConstellationOperationError('Delete the topic map opened by this skill first', 409);
    }
};
exports.assertSkillCanBeDeleted = assertSkillCanBeDeleted;
