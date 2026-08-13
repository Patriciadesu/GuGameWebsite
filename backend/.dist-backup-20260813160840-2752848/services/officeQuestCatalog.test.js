"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const officeQuestCatalog_1 = require("./officeQuestCatalog");
(0, node_test_1.default)('StarMaster presentation keeps text separate from quest images', () => {
    const quest = {
        _id: 'quest-1',
        title: 'Soundscape',
        description: [
            { type: 'Text', content: 'Build an atmospheric soundscape.' },
            { type: 'Image', content: 'https://cdn.example.com/cover.webp' }
        ],
        subQuests: []
    };
    strict_1.default.equal((0, officeQuestCatalog_1.getOfficeQuestDescription)(quest.description), 'Build an atmospheric soundscape.');
    strict_1.default.equal((0, officeQuestCatalog_1.getOfficeQuestImageUrl)(quest), 'https://cdn.example.com/cover.webp');
});
(0, node_test_1.default)('StarMaster presentation falls back to the first subquest image', () => {
    const quest = {
        _id: 'quest-2',
        title: 'Model a prop',
        description: [],
        subQuests: [{
                _id: 'step-1',
                title: 'Reference',
                description: [{ type: 'Image', content: 'https://cdn.example.com/reference.webp' }]
            }]
    };
    strict_1.default.equal((0, officeQuestCatalog_1.getOfficeQuestImageUrl)(quest), 'https://cdn.example.com/reference.webp');
});
