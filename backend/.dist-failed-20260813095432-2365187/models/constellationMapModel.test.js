"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const mongoose_1 = __importDefault(require("mongoose"));
const ConstellationMap_1 = __importDefault(require("./ConstellationMap"));
const Skill_1 = __importDefault(require("./Skill"));
(0, node_test_1.default)('discipline maps validate without parent linkage', async () => {
    const map = new ConstellationMap_1.default({
        name: 'Game Art',
        slug: 'game-art',
        scope: 'discipline'
    });
    await map.validate();
    strict_1.default.equal(map.visualTheme.key, 'default');
    strict_1.default.equal(map.visualTheme.frameStyle, 'luminous-minimal');
    strict_1.default.equal(map.visualTheme.backgroundColor, '#f7f9fc');
    strict_1.default.equal(map.visualTheme.surfaceColor, '#ffffff');
    strict_1.default.equal(map.viewport.width, 2400);
    strict_1.default.equal(map.viewport.height, 1400);
    strict_1.default.equal(map.level, 1);
    strict_1.default.equal(map.constellationType, 'skill');
});
(0, node_test_1.default)('main constellations use the same map schema without becoming skill maps', async () => {
    const map = new ConstellationMap_1.default({
        name: 'Main Journey',
        slug: 'main-journey',
        constellationType: 'main',
        scope: 'discipline'
    });
    await map.validate();
    strict_1.default.equal(map.constellationType, 'main');
    strict_1.default.equal(map.scope, 'discipline');
});
(0, node_test_1.default)('topic maps require both a parent map and gateway skill', async () => {
    const map = new ConstellationMap_1.default({
        name: '3D Modeling',
        slug: 'game-art-3d-modeling',
        scope: 'topic'
    });
    await strict_1.default.rejects(() => map.validate(), /Topic maps require both a parent map and gateway skill/);
});
(0, node_test_1.default)('topic maps own the link back to their parent and gateway skill', async () => {
    const parentMapId = new mongoose_1.default.Types.ObjectId();
    const gatewaySkillId = new mongoose_1.default.Types.ObjectId();
    const map = new ConstellationMap_1.default({
        name: '3D Modeling',
        slug: 'game-art-3d-modeling',
        scope: 'topic',
        parentMapId,
        gatewaySkillId
    });
    await map.validate();
    strict_1.default.equal(map.level, 1);
    strict_1.default.equal(map.parentMapId?.toString(), parentMapId.toString());
    strict_1.default.equal(map.gatewaySkillId?.toString(), gatewaySkillId.toString());
});
(0, node_test_1.default)('topic level must be a positive integer', async () => {
    const map = new ConstellationMap_1.default({
        name: 'Advanced VFX',
        slug: 'advanced-vfx',
        scope: 'topic',
        parentMapId: new mongoose_1.default.Types.ObjectId(),
        gatewaySkillId: new mongoose_1.default.Types.ObjectId(),
        level: 1.5
    });
    await strict_1.default.rejects(() => map.validate(), /level/);
});
(0, node_test_1.default)('topic gateway skills expose preview content without owning map linkage', async () => {
    const skill = new Skill_1.default({
        title: '3D Modeling',
        description: 'Create and shape 3D assets for games.',
        cost: 0,
        treePosition: { x: -992, y: 608 },
        constellationPosition: { x: 800, y: 180 },
        constellationLabel: '3D Modelling',
        mapNodeRole: 'topic-gateway',
        nodePreview: {
            imageUrl: '/uploads/3d-modeling.png',
            summary: 'Create and shape 3D assets for your games.',
            outcomes: ['Build game-ready 3D assets'],
            actionLabel: 'View Path'
        }
    });
    await skill.validate();
    strict_1.default.equal(skill.mapNodeRole, 'topic-gateway');
    strict_1.default.equal(skill.treePosition?.x, -992);
    strict_1.default.equal(skill.constellationPosition?.x, 800);
    strict_1.default.equal(skill.constellationLabel, '3D Modelling');
    strict_1.default.deepEqual(skill.nodePreview?.outcomes, ['Build game-ready 3D assets']);
});
