"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyedAsyncTtlCache = exports.AsyncTtlCache = void 0;
class AsyncTtlCache {
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
        this.hasValue = false;
        this.expiresAt = 0;
        this.pending = null;
    }
    async get(loader, forceRefresh = false) {
        if (!forceRefresh && this.hasValue && Date.now() < this.expiresAt) {
            return this.value;
        }
        if (this.pending) {
            return this.pending;
        }
        this.pending = loader()
            .then(value => {
            this.value = value;
            this.hasValue = true;
            this.expiresAt = Date.now() + this.ttlMs;
            return value;
        })
            .catch(error => {
            if (this.hasValue) {
                this.expiresAt = Date.now() + Math.min(this.ttlMs, 5000);
                return this.value;
            }
            throw error;
        })
            .finally(() => {
            this.pending = null;
        });
        return this.pending;
    }
    clear() {
        this.hasValue = false;
        this.value = undefined;
        this.expiresAt = 0;
    }
}
exports.AsyncTtlCache = AsyncTtlCache;
class KeyedAsyncTtlCache {
    constructor(ttlMs, maxEntries = 1000) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.entries = new Map();
    }
    async get(key, loader) {
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { hasValue: false, expiresAt: 0, pending: null };
            this.entries.set(key, entry);
            this.trim();
        }
        if (entry.hasValue && Date.now() < entry.expiresAt) {
            return entry.value;
        }
        if (entry.pending) {
            return entry.pending;
        }
        entry.pending = loader()
            .then(value => {
            entry.value = value;
            entry.hasValue = true;
            entry.expiresAt = Date.now() + this.ttlMs;
            return value;
        })
            .finally(() => {
            entry.pending = null;
        });
        return entry.pending;
    }
    delete(key) {
        this.entries.delete(key);
    }
    set(key, value) {
        this.entries.set(key, {
            value,
            hasValue: true,
            expiresAt: Date.now() + this.ttlMs,
            pending: null
        });
        this.trim();
    }
    clear() {
        this.entries.clear();
    }
    trim() {
        while (this.entries.size > this.maxEntries) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey === undefined)
                break;
            this.entries.delete(oldestKey);
        }
    }
}
exports.KeyedAsyncTtlCache = KeyedAsyncTtlCache;
