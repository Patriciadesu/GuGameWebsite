"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedSessionStore = void 0;
const express_session_1 = __importDefault(require("express-session"));
const cloneSession = (value) => structuredClone(value);
class CachedSessionStore extends express_session_1.default.Store {
    constructor(backingStore, ttlMs = 60000, maxEntries = 5000, persistTouchIntervalMs = 60 * 60 * 1000) {
        super();
        this.backingStore = backingStore;
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.persistTouchIntervalMs = persistTouchIntervalMs;
        this.cache = new Map();
        this.pendingGets = new Map();
        this.lastPersistedTouches = new Map();
    }
    get(sid, callback) {
        const cached = this.cache.get(sid);
        if (cached && cached.expiresAt > Date.now()) {
            this.cache.delete(sid);
            this.cache.set(sid, cached);
            callback(null, cloneSession(cached.session));
            return;
        }
        if (cached)
            this.cache.delete(sid);
        let pending = this.pendingGets.get(sid);
        if (!pending) {
            pending = new Promise((resolve, reject) => {
                this.backingStore.get(sid, (error, storedSession) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(storedSession || null);
                });
            }).then(storedSession => {
                if (storedSession)
                    this.remember(sid, storedSession);
                return storedSession;
            }).finally(() => {
                this.pendingGets.delete(sid);
            });
            this.pendingGets.set(sid, pending);
        }
        pending.then(storedSession => callback(null, storedSession ? cloneSession(storedSession) : null), error => callback(error));
    }
    set(sid, value, callback) {
        this.remember(sid, value);
        this.backingStore.set(sid, value, callback);
    }
    touch(sid, value, callback) {
        this.remember(sid, value);
        const now = Date.now();
        const lastPersistedTouch = this.lastPersistedTouches.get(sid) || 0;
        if (now - lastPersistedTouch < this.persistTouchIntervalMs) {
            callback?.();
            return;
        }
        this.lastPersistedTouches.set(sid, now);
        if (this.backingStore.touch) {
            this.backingStore.touch(sid, value, callback);
        }
        else {
            callback?.();
        }
    }
    destroy(sid, callback) {
        this.cache.delete(sid);
        this.pendingGets.delete(sid);
        this.lastPersistedTouches.delete(sid);
        this.backingStore.destroy(sid, callback);
    }
    clear(callback) {
        this.cache.clear();
        this.pendingGets.clear();
        this.lastPersistedTouches.clear();
        if (this.backingStore.clear) {
            this.backingStore.clear(callback);
        }
        else {
            callback?.();
        }
    }
    length(callback) {
        if (this.backingStore.length) {
            this.backingStore.length(callback);
        }
        else {
            callback(null, this.cache.size);
        }
    }
    remember(sid, value) {
        this.cache.delete(sid);
        this.cache.set(sid, {
            session: cloneSession(value),
            expiresAt: Date.now() + this.ttlMs
        });
        while (this.cache.size > this.maxEntries) {
            const oldestSid = this.cache.keys().next().value;
            if (oldestSid === undefined)
                break;
            this.cache.delete(oldestSid);
        }
    }
}
exports.CachedSessionStore = CachedSessionStore;
