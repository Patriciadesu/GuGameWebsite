"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const keyedBatchLoader_1 = require("./keyedBatchLoader");
(0, node_test_1.default)('KeyedBatchLoader combines concurrent keys and duplicate requests', async () => {
    let calls = 0;
    const loader = new keyedBatchLoader_1.KeyedBatchLoader(async (keys) => {
        calls += 1;
        return new Map(keys.map(key => [key, `value-${key}`]));
    });
    const values = await Promise.all([
        loader.load('a'),
        loader.load('b'),
        loader.load('a')
    ]);
    strict_1.default.equal(calls, 1);
    strict_1.default.deepEqual(values, ['value-a', 'value-b', 'value-a']);
});
(0, node_test_1.default)('KeyedBatchLoader rejects every request when a batch fails', async () => {
    const loader = new keyedBatchLoader_1.KeyedBatchLoader(async () => {
        throw new Error('database unavailable');
    });
    const results = await Promise.allSettled([
        loader.load('a'),
        loader.load('b')
    ]);
    strict_1.default.equal(results.every(result => result.status === 'rejected'), true);
});
