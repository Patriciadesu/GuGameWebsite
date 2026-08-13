"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const constellationService_1 = require("./constellationService");
(0, node_test_1.default)('hierarchy accepts a topic under a same-type discipline', () => {
    strict_1.default.doesNotThrow(() => (0, constellationService_1.assertConstellationHierarchyIntegrity)({ scope: 'discipline', constellationType: 'main' }, { scope: 'topic', constellationType: 'main' }));
});
(0, node_test_1.default)('hierarchy rejects cross-type parent and child maps', () => {
    strict_1.default.throws(() => (0, constellationService_1.assertConstellationHierarchyIntegrity)({ scope: 'discipline', constellationType: 'main' }, { scope: 'topic', constellationType: 'skill' }), (error) => error instanceof constellationService_1.ConstellationOperationError && error.statusCode === 409);
});
(0, node_test_1.default)('hierarchy rejects invalid parent and child scopes', () => {
    strict_1.default.throws(() => (0, constellationService_1.assertConstellationHierarchyIntegrity)({ scope: 'topic', constellationType: 'skill' }, { scope: 'topic', constellationType: 'skill' }), /discipline map/);
    strict_1.default.throws(() => (0, constellationService_1.assertConstellationHierarchyIntegrity)({ scope: 'discipline', constellationType: 'skill' }, { scope: 'discipline', constellationType: 'skill' }), /Only topic maps/);
});
(0, node_test_1.default)('discipline maps accept topic gateways', () => {
    strict_1.default.doesNotThrow(() => (0, constellationService_1.assertRoleAllowedForScope)('discipline', 'topic-gateway'));
});
(0, node_test_1.default)('discipline maps reject lesson nodes', () => {
    strict_1.default.throws(() => (0, constellationService_1.assertRoleAllowedForScope)('discipline', 'lesson'), (error) => error instanceof constellationService_1.ConstellationOperationError && error.statusCode === 400);
});
(0, node_test_1.default)('topic maps accept lesson, boss, and capstone nodes', () => {
    strict_1.default.doesNotThrow(() => (0, constellationService_1.assertRoleAllowedForScope)('topic', 'lesson'));
    strict_1.default.doesNotThrow(() => (0, constellationService_1.assertRoleAllowedForScope)('topic', 'boss'));
    strict_1.default.doesNotThrow(() => (0, constellationService_1.assertRoleAllowedForScope)('topic', 'capstone'));
});
(0, node_test_1.default)('topic maps reject topic gateways', () => {
    strict_1.default.throws(() => (0, constellationService_1.assertRoleAllowedForScope)('topic', 'topic-gateway'), /Topic maps cannot contain topic-gateway nodes/);
});
(0, node_test_1.default)('layout normalization accepts unique nodes inside the viewport', () => {
    const nodes = (0, constellationService_1.normalizeConstellationLayout)([
        { skillId: '64b000000000000000000001', x: 120, y: 240 },
        { skillId: '64b000000000000000000002', x: 880, y: 640 }
    ], { width: 1600, height: 900 });
    strict_1.default.deepEqual(nodes, [
        { skillId: '64b000000000000000000001', x: 120, y: 240 },
        { skillId: '64b000000000000000000002', x: 880, y: 640 }
    ]);
});
(0, node_test_1.default)('layout normalization rejects duplicate nodes', () => {
    strict_1.default.throws(() => (0, constellationService_1.normalizeConstellationLayout)([
        { skillId: '64b000000000000000000001', x: 120, y: 240 },
        { skillId: '64b000000000000000000001', x: 220, y: 340 }
    ], { width: 1600, height: 900 }), /duplicate skill/);
});
(0, node_test_1.default)('layout normalization rejects positions outside the map viewport', () => {
    strict_1.default.throws(() => (0, constellationService_1.normalizeConstellationLayout)([
        { skillId: '64b000000000000000000001', x: 1601, y: 240 }
    ], { width: 1600, height: 900 }), /outside the map viewport/);
});
