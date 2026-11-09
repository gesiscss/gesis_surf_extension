/**
 * Runs async tasks one at a time per key. Tasks with different keys run in parallel.
 *
 * Every task is bounded by `maxWaitMs`: a hung network request can never block all
 * later tasks for that key. Unlike a wait timeout, the hung task is still abandoned
 * only after it is cancelled, so two tasks for the same key never run at once.
 */
export class KeyedSerialQueue<K> {
  private readonly tails = new Map<K, Promise<void>>();

  constructor(
    private readonly maxWaitMs: number = 15000,
    private readonly onTimeout?: (key: K, error: Error) => void,
  ) {}

  run<T>(key: K, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key);

    const result = (async () => {
      if (previous) {
        await previous;
      }
      return this.boundedTask(key, task);
    })();

    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) {
        this.tails.delete(key);
      }
    });

    return result;
  }

  private async boundedTask<T>(key: K, task: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Task for key ${String(key)} exceeded ${this.maxWaitMs}ms and was abandoned`);
        this.onTimeout?.(key, error);
        reject(error);
      }, this.maxWaitMs);
    });
    try {
      return await Promise.race([task(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
