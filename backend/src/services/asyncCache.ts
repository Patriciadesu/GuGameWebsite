export class AsyncTtlCache<T> {
  private value: T | undefined;
  private hasValue = false;
  private expiresAt = 0;
  private pending: Promise<T> | null = null;

  constructor(private readonly ttlMs: number) {}

  async get(loader: () => Promise<T>, forceRefresh = false): Promise<T> {
    if (!forceRefresh && this.hasValue && Date.now() < this.expiresAt) {
      return this.value as T;
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
          this.expiresAt = Date.now() + Math.min(this.ttlMs, 5_000);
          return this.value as T;
        }
        throw error;
      })
      .finally(() => {
        this.pending = null;
      });

    return this.pending;
  }

  clear(): void {
    this.hasValue = false;
    this.value = undefined;
    this.expiresAt = 0;
  }
}

interface KeyedEntry<T> {
  value?: T;
  hasValue: boolean;
  expiresAt: number;
  pending: Promise<T> | null;
}

export class KeyedAsyncTtlCache<T> {
  private readonly entries = new Map<string, KeyedEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1_000
  ) {}

  async get(key: string, loader: () => Promise<T>): Promise<T> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { hasValue: false, expiresAt: 0, pending: null };
      this.entries.set(key, entry);
      this.trim();
    }

    if (entry.hasValue && Date.now() < entry.expiresAt) {
      return entry.value as T;
    }
    if (entry.pending) {
      return entry.pending;
    }

    entry.pending = loader()
      .then(value => {
        entry!.value = value;
        entry!.hasValue = true;
        entry!.expiresAt = Date.now() + this.ttlMs;
        return value;
      })
      .finally(() => {
        entry!.pending = null;
      });

    return entry.pending;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  set(key: string, value: T): void {
    this.entries.set(key, {
      value,
      hasValue: true,
      expiresAt: Date.now() + this.ttlMs,
      pending: null
    });
    this.trim();
  }

  clear(): void {
    this.entries.clear();
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}
