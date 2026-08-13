"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const questStepNormalization_1 = require("./questStepNormalization");
(0, node_test_1.default)('assigns unique stable-looking IDs to new quest steps', () => {
    const normalized = (0, questStepNormalization_1.normalizeQuestStepExternalIds)([
        { title: 'First' },
        { title: 'Second', externalId: ' upstream-step ' }
    ]);
    strict_1.default.match(normalized[0].externalId, /^step-[0-9a-f-]{36}$/);
    strict_1.default.equal(normalized[1].externalId, 'upstream-step');
    strict_1.default.notEqual(normalized[0].externalId, normalized[1].externalId);
});
(0, node_test_1.default)('preserves persisted IDs when an update omits or replaces them', () => {
    const persisted = [{ externalId: 'step-a' }, { externalId: 'step-b' }];
    const normalized = (0, questStepNormalization_1.normalizeQuestStepExternalIds)([
        { title: 'Renamed' },
        { title: 'Changed ID', externalId: 'replacement' },
        { title: 'New', externalId: 'new-step' }
    ], persisted);
    strict_1.default.deepEqual(normalized.map(step => step.externalId), ['step-a', 'step-b', 'new-step']);
});
(0, node_test_1.default)('preserves persisted IDs when existing steps are reordered', () => {
    const persisted = [{ externalId: 'step-a' }, { externalId: 'step-b' }];
    const normalized = (0, questStepNormalization_1.normalizeQuestStepExternalIds)([
        { title: 'B', externalId: 'step-b' },
        { title: 'A', externalId: 'step-a' }
    ], persisted);
    strict_1.default.deepEqual(normalized.map(step => step.externalId), ['step-b', 'step-a']);
});
(0, node_test_1.default)('rejects duplicate external IDs', () => {
    strict_1.default.throws(() => (0, questStepNormalization_1.normalizeQuestStepExternalIds)([{ externalId: 'same' }, { externalId: ' same ' }]), /must be unique/);
});
