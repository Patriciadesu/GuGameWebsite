"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const progressionService_1 = require("./progressionService");
(0, node_test_1.default)('a quest without steps is not complete', () => {
    strict_1.default.equal((0, progressionService_1.areQuestStepsComplete)([], new Set()), false);
});
(0, node_test_1.default)('every quest step must be complete', () => {
    const steps = [{ externalId: 'intro' }, {}, { externalId: 'finish' }];
    strict_1.default.equal((0, progressionService_1.areQuestStepsComplete)(steps, new Set(['intro', 'step-1'])), false);
    strict_1.default.equal((0, progressionService_1.areQuestStepsComplete)(steps, new Set(['intro', 'step-1', 'finish'])), true);
});
