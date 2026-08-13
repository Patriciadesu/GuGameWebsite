"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const Skill_1 = __importDefault(require("./Skill"));
(0, node_test_1.default)('newly persisted quest steps receive immutable external IDs', async () => {
    const skill = new Skill_1.default({
        title: 'Quest',
        description: 'A quest with manual steps',
        cost: 0,
        subQuests: [
            { title: 'First', description: '' },
            { externalId: 'source-step', title: 'Second', description: '' }
        ]
    });
    await skill.validate();
    strict_1.default.match(skill.subQuests?.[0].externalId || '', /^step-[0-9a-f-]{36}$/);
    strict_1.default.equal(skill.subQuests?.[1].externalId, 'source-step');
    const externalIdPath = Skill_1.default.schema.path('subQuests.externalId');
    strict_1.default.equal(externalIdPath.options.immutable, true);
});
(0, node_test_1.default)('duplicate quest step external IDs fail validation', async () => {
    const skill = new Skill_1.default({
        title: 'Quest',
        description: 'Duplicate steps',
        cost: 0,
        subQuests: [
            { externalId: 'duplicate', title: 'First', description: '' },
            { externalId: 'duplicate', title: 'Second', description: '' }
        ]
    });
    await strict_1.default.rejects(() => skill.validate(), /must be unique/);
});
