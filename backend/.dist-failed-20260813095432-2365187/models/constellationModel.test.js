"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const mongoose_1 = __importDefault(require("mongoose"));
const Constellation_1 = __importDefault(require("./Constellation"));
const Skill_1 = __importDefault(require("./Skill"));
(0, node_test_1.default)('root constellations validate without a parent', async () => {
    const constellation = new Constellation_1.default({
        name: 'Game Art',
        slug: 'game-art',
        kind: 'root'
    });
    await constellation.validate();
    strict_1.default.equal(constellation.theme.key, 'default');
    strict_1.default.equal(constellation.layout.width, 1600);
});
(0, node_test_1.default)('child constellations require a parent', async () => {
    const constellation = new Constellation_1.default({
        name: '3D Modeling',
        slug: 'game-art-3d-modeling',
        kind: 'child'
    });
    await strict_1.default.rejects(() => constellation.validate(), /Child constellations require a parent/);
});
(0, node_test_1.default)('topic nodes can link to a child constellation and expose preview content', async () => {
    const childConstellationId = new mongoose_1.default.Types.ObjectId();
    const skill = new Skill_1.default({
        title: '3D Modeling',
        description: 'Create and shape 3D assets for games.',
        cost: 0,
        constellationNodeRole: 'topic',
        childConstellationId,
        constellationPreview: {
            imageUrl: '/uploads/3d-modeling.png',
            summary: 'Create and shape 3D assets for your games.',
            outcomes: ['Build game-ready 3D assets'],
            actionLabel: 'View Path'
        }
    });
    await skill.validate();
    strict_1.default.equal(skill.childConstellationId?.toString(), childConstellationId.toString());
    strict_1.default.deepEqual(skill.constellationPreview?.outcomes, ['Build game-ready 3D assets']);
});
(0, node_test_1.default)('quest and boss nodes cannot open child constellations', async () => {
    const skill = new Skill_1.default({
        title: 'Scenery',
        description: 'Branch boss quest.',
        cost: 0,
        constellationNodeRole: 'boss',
        childConstellationId: new mongoose_1.default.Types.ObjectId()
    });
    await strict_1.default.rejects(() => skill.validate(), /Only topic nodes can open child constellations/);
});
