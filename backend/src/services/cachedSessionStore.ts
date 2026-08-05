import session, { SessionData } from 'express-session';

interface CacheEntry {
  session: SessionData;
  expiresAt: number;
}

const cloneSession = (value: SessionData): SessionData =>
  structuredClone(value);

export class CachedSessionStore extends session.Store {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pendingGets = new Map<string, Promise<SessionData | null>>();
  private readonly lastPersistedTouches = new Map<string, number>();

  constructor(
    private readonly backingStore: session.Store,
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 5_000,
    private readonly persistTouchIntervalMs = 60 * 60 * 1_000
  ) {
    super();
  }

  get(sid: string, callback: (err: any, session?: SessionData | null) => void): void {
    const cached = this.cache.get(sid);
    if (cached && cached.expiresAt > Date.now()) {
      this.cache.delete(sid);
      this.cache.set(sid, cached);
      callback(null, cloneSession(cached.session));
      return;
    }
    if (cached) this.cache.delete(sid);

    let pending = this.pendingGets.get(sid);
    if (!pending) {
      pending = new Promise<SessionData | null>((resolve, reject) => {
        this.backingStore.get(sid, (error, storedSession) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(storedSession || null);
        });
      }).then(storedSession => {
        if (storedSession) this.remember(sid, storedSession);
        return storedSession;
      }).finally(() => {
        this.pendingGets.delete(sid);
      });
      this.pendingGets.set(sid, pending);
    }

    pending.then(
      storedSession => callback(null, storedSession ? cloneSession(storedSession) : null),
      error => callback(error)
    );
  }

  set(sid: string, value: SessionData, callback?: (err?: any) => void): void {
    this.remember(sid, value);
    this.backingStore.set(sid, value, callback);
  }

  touch(sid: string, value: SessionData, callback?: () => void): void {
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
    } else {
      callback?.();
    }
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    this.cache.delete(sid);
    this.pendingGets.delete(sid);
    this.lastPersistedTouches.delete(sid);
    this.backingStore.destroy(sid, callback);
  }

  clear(callback?: (err?: any) => void): void {
    this.cache.clear();
    this.pendingGets.clear();
    this.lastPersistedTouches.clear();
    if (this.backingStore.clear) {
      this.backingStore.clear(callback);
    } else {
      callback?.();
    }
  }

  length(callback: (err: any, length?: number) => void): void {
    if (this.backingStore.length) {
      this.backingStore.length(callback);
    } else {
      callback(null, this.cache.size);
    }
  }

  private remember(sid: string, value: SessionData): void {
    this.cache.delete(sid);
    this.cache.set(sid, {
      session: cloneSession(value),
      expiresAt: Date.now() + this.ttlMs
    });
    while (this.cache.size > this.maxEntries) {
      const oldestSid = this.cache.keys().next().value;
      if (oldestSid === undefined) break;
      this.cache.delete(oldestSid);
    }
  }
}
