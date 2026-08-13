"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const asyncCache_1 = require("./asyncCache");
(0, node_test_1.default)('AsyncTtlCache coalesces concurrent cache misses', async () => {
    const cache = new asyncCache_1.AsyncTtlCache(1000);
    let loads = 0;
    const loader = async () => {
        loads += 1;
        await new Promise(resolve => setTimeout(resolve, 10));
        return 42;
    };
    const values = await Promise.all(Array.from({ length: 50 }, () => cache.get(loader)));
    strict_1.default.deepEqual(new Set(values), new Set([42]));
    strict_1.default.equal(loads, 1);
});
(0, node_test_1.default)('AsyncTtlCache invalidates and refreshes', async () => {
    const cache = new asyncCache_1.AsyncTtlCache(10000);
    let value = 1;
    strict_1.default.equal(await cache.get(async () => value), 1);
    value = 2;
    strict_1.default.equal(await cache.get(async () => value), 1);
    cache.clear();
    strict_1.default.equal(await cache.get(async () => value), 2);
});
(0, node_test_1.default)('AsyncTtlCache serves stale data when a refresh fails', async () => {
    const cache = new asyncCache_1.AsyncTtlCache(10000);
    strict_1.default.equal(await cache.get(async () => 7), 7);
    strict_1.default.equal(await cache.get(async () => {
        throw new Error('upstream unavailable');
    }, true), 7);
});
(0, node_test_1.default)('KeyedAsyncTtlCache isolates keys and coalesces each key', async () => {
    const cache = new asyncCache_1.KeyedAsyncTtlCache(1000);
    let loads = 0;
    const load = async (key) => {
        loads += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return key.toUpperCase();
    };
    const values = await Promise.all([
        ...Array.from({ length: 20 }, () => cache.get('a', () => load('a'))),
        ...Array.from({ length: 20 }, () => cache.get('b', () => load('b')))
    ]);
    strict_1.default.equal(values.filter(value => value === 'A').length, 20);
    strict_1.default.equal(values.filter(value => value === 'B').length, 20);
    strict_1.default.equal(loads, 2);
});
(0, node_test_1.default)('KeyedAsyncTtlCache supports explicit set and delete', async () => {
    const cache = new asyncCache_1.KeyedAsyncTtlCache(1000);
    cache.set('answer', 42);
    strict_1.default.equal(await cache.get('answer', async () => 0), 42);
    cache.delete('answer');
    strict_1.default.equal(await cache.get('answer', async () => 7), 7);
});
