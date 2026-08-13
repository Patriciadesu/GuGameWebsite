"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyedBatchLoader = void 0;
class KeyedBatchLoader {
    constructor(batchLoad, delayMs = 2, maxBatchSize = 500) {
        this.batchLoad = batchLoad;
        this.delayMs = delayMs;
        this.maxBatchSize = maxBatchSize;
        this.pending = new Map();
        this.timer = null;
    }
    load(key) {
        const result = new Promise((resolve, reject) => {
            const requests = this.pending.get(key) || [];
            requests.push({ resolve, reject });
            this.pending.set(key, requests);
        });
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.flush();
            }, this.delayMs);
        }
        if (this.pending.size >= this.maxBatchSize) {
            clearTimeout(this.timer);
            this.timer = null;
            void this.flush();
        }
        return result;
    }
    async flush() {
        if (this.pending.size === 0)
            return;
        const batch = this.pending;
        this.pending = new Map();
        const keys = [...batch.keys()];
        try {
            const values = await this.batchLoad(keys);
            for (const key of keys) {
                const value = values.get(key);
                if (value === undefined) {
                    throw new Error(`Batch loader did not return a value for key "${key}"`);
                }
                batch.get(key)?.forEach(request => request.resolve(value));
            }
        }
        catch (error) {
            for (const requests of batch.values()) {
                requests.forEach(request => request.reject(error));
            }
        }
    }
}
exports.KeyedBatchLoader = KeyedBatchLoader;
