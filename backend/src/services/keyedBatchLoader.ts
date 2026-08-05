interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class KeyedBatchLoader<T> {
  private pending = new Map<string, PendingRequest<T>[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly batchLoad: (keys: string[]) => Promise<Map<string, T>>,
    private readonly delayMs = 2,
    private readonly maxBatchSize = 500
  ) {}

  load(key: string): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
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

  private async flush(): Promise<void> {
    if (this.pending.size === 0) return;

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
    } catch (error) {
      for (const requests of batch.values()) {
        requests.forEach(request => request.reject(error));
      }
    }
  }
}
