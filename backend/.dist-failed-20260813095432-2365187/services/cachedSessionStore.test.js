"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const express_session_1 = __importDefault(require("express-session"));
const cachedSessionStore_1 = require("./cachedSessionStore");
class FakeStore extends express_session_1.default.Store {
    constructor() {
        super(...arguments);
        this.sessions = new Map();
        this.gets = 0;
        this.touches = 0;
    }
    get(sid, callback) {
        this.gets += 1;
        setTimeout(() => callback(null, this.sessions.get(sid) || null), 5);
    }
    set(sid, value, callback) {
        this.sessions.set(sid, structuredClone(value));
        callback?.();
    }
    destroy(sid, callback) {
        this.sessions.delete(sid);
        callback?.();
    }
    touch(_sid, _value, callback) {
        this.touches += 1;
        callback?.();
    }
}
const sessionValue = () => ({
    cookie: {
        originalMaxAge: 60000,
        maxAge: 60000,
        secure: true,
        httpOnly: true,
        path: '/',
        sameSite: 'none'
    },
    passport: { user: 'user-1' }
});
const getSession = (store, sid) => new Promise((resolve, reject) => {
    store.get(sid, (error, value) => error ? reject(error) : resolve(value || null));
});
(0, node_test_1.default)('CachedSessionStore coalesces concurrent backing-store reads', async () => {
    const backing = new FakeStore();
    backing.sessions.set('sid', sessionValue());
    const store = new cachedSessionStore_1.CachedSessionStore(backing);
    const sessions = await Promise.all(Array.from({ length: 100 }, () => getSession(store, 'sid')));
    strict_1.default.equal(sessions.length, 100);
    strict_1.default.equal(backing.gets, 1);
});
(0, node_test_1.default)('CachedSessionStore updates and destroys both cache and backing store', async () => {
    const backing = new FakeStore();
    const store = new cachedSessionStore_1.CachedSessionStore(backing);
    const value = sessionValue();
    store.set('sid', value);
    strict_1.default.deepEqual(await getSession(store, 'sid'), value);
    strict_1.default.equal(backing.gets, 0);
    await new Promise((resolve, reject) => {
        store.destroy('sid', error => error ? reject(error) : resolve());
    });
    strict_1.default.equal(await getSession(store, 'sid'), null);
    strict_1.default.equal(backing.gets, 1);
});
(0, node_test_1.default)('CachedSessionStore rate-limits persistent session touches', () => {
    const backing = new FakeStore();
    const store = new cachedSessionStore_1.CachedSessionStore(backing);
    const value = sessionValue();
    for (let index = 0; index < 100; index += 1) {
        store.touch('sid', value);
    }
    strict_1.default.equal(backing.touches, 1);
});
